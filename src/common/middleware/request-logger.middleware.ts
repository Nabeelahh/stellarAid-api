import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction) {
    const { method, originalUrl, ip, headers } = request;
    const startTime = Date.now();
    const userAgent = headers['user-agent'] || 'unknown';
    const requestId = headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add request ID to response headers
    response.setHeader('X-Request-ID', requestId.toString());

    response.on('finish', () => {
      const { statusCode } = response;
      const responseTime = Date.now() - startTime;
      const contentLength = response.get('content-length') || 0;

      this.logger.log(
        `${method} ${originalUrl} - ${statusCode} - ${responseTime}ms - ${contentLength}B - ${ip} - ${userAgent}`,
      );
    });

    next();
  }
}
