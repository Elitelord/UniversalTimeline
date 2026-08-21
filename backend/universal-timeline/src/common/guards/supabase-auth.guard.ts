/*
  AUTH FLOW SUMMARY (Task 4.3):
  
  1. The client authenticates with Supabase (email/password) and receives a JWT access token.
  2. On every API request, the client sends this JWT in the Authorization header as "Bearer <token>".
  3. This guard extracts the token from the header and calls Supabase's getUser() to verify it —
     Supabase checks the token's signature, expiration, and validity against its auth server.
  4. If valid, the user's ID (sub claim) is extracted from the verified user object and attached
     to the request object, so controllers can access it without trusting client-provided user_id.
  5. If the token is missing, expired, or invalid, the guard throws a 401 Unauthorized response,
     preventing access to the protected endpoint.
*/

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

/**
 * How long a verified token is trusted without re-asking Supabase.
 *
 * getUser() is a network round-trip to Supabase on every single request, which for
 * search-as-you-type means 100-300ms prepended to each keystroke burst — usually more
 * than the query itself costs. A short TTL removes that for all but the first request
 * while keeping the window in which a revoked token still works down to a minute.
 *
 * The cache is per-process and evaporates when the instance restarts or sleeps, which
 * is the right behaviour for a single free-tier web service. A future move to local
 * JWKS verification would remove the round-trip entirely, but that is a
 * correctness-sensitive change to the only auth boundary and belongs on its own.
 */
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX_ENTRIES = 500;

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger('AuthGuard');
  private supabase: SupabaseClient;
  private readonly tokenCache = new Map<
    string,
    { user_id: string; user: any; expiresAt: number }
  >();

  constructor(private readonly configService: ConfigService) {
    // Create a Supabase client using the project URL and anon key.
    // The anon key is safe to use server-side for token verification —
    // it only has the permissions of an unauthenticated user.
    // The ws transport is required for Node.js < 22 which lacks native WebSocket.
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL', ''),
      this.configService.get<string>('SUPABASE_ANON_KEY', ''),
      {
        realtime: {
          transport: ws as any,
        },
      },
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    // Check if the Authorization header exists and follows "Bearer <token>" format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Missing or malformed Authorization header');
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    // Extract the JWT token (everything after "Bearer ")
    const token = authHeader.split(' ')[1];

    const cached = this.tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      request.user_id = cached.user_id;
      request.user = cached.user;
      return true;
    }

    try {
      // Verify the token with Supabase. getUser() makes a call to Supabase's
      // auth server to validate the token's signature and check expiration.
      // This is more secure than just decoding the JWT locally.
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error || !data.user) {
        this.logger.warn(`Token verification failed: ${error?.message}`);
        throw new UnauthorizedException('Invalid or expired token');
      }

      // Attach the authenticated user's ID to the request object.
      // Controllers can now access req.user_id instead of trusting
      // a user_id from the request body or query params.
      request.user_id = data.user.id;
      request.user = data.user;

      // Simple size cap: once full, drop the oldest insertion. Map preserves
      // insertion order, so the first key is the least recently added.
      if (this.tokenCache.size >= TOKEN_CACHE_MAX_ENTRIES) {
        const oldest = this.tokenCache.keys().next().value;
        if (oldest !== undefined) this.tokenCache.delete(oldest);
      }
      this.tokenCache.set(token, {
        user_id: data.user.id,
        user: data.user,
        expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
      });

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`Auth error: ${err.message}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
