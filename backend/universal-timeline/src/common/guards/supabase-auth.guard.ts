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

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger('AuthGuard');
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    // Create a Supabase client using the project URL and anon key.
    // The anon key is safe to use server-side for token verification —
    // it only has the permissions of an unauthenticated user.
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL', ''),
      this.configService.get<string>('SUPABASE_ANON_KEY', ''),
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

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`Auth error: ${err.message}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
