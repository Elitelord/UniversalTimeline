import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    // Capture the timestamp when the request arrives.
    const startTime = Date.now();

    // res.on('finish') fires AFTER the response has been sent to the client.
    // This is where we calculate response time and log everything.
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { method, originalUrl } = req;
      const { statusCode } = res;

      // Color-code by status: green for success, yellow for client errors, red for server errors.
      const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms`;

      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    // next() passes control to the next middleware or the route handler.
    // Without this, the request would hang forever.
    next();
  }
}
