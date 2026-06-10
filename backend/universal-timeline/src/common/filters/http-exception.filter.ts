import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// @Catch() with no arguments means "catch EVERYTHING" — both HttpExceptions
// (like 400 Bad Request from validation) and unexpected errors (like DB crashes).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    // ArgumentsHost lets us access the underlying HTTP request/response objects.
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // If it's a known HttpException (400, 404, etc.), use its status.
    // Otherwise, it's an unexpected crash — treat it as 500.
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // For HttpExceptions, NestJS stores a response object with the message.
    // For unknown errors, we use a generic message so we don't leak internals.
    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    // Build a consistent error body — every error from your API
    // will always have these same fields.
    const errorBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      // If NestJS gave us a detailed response object, spread it in.
      // Otherwise just include the message string.
      ...(typeof exceptionResponse === 'object'
        ? exceptionResponse
        : { message: exceptionResponse }),
    };

    // Log the full error server-side (this is where you'd see stack traces
    // during development — but the client never sees them).
    this.logger.error(
      `${request.method} ${request.url} ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json(errorBody);
  }
}
