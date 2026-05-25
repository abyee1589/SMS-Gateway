import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { AppRequest } from '../types/request-context.type';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: AppRequest, res: Response, next: NextFunction) {
    const startedAt = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;

      const logPayload = {
        event: 'http_request',
        requestId: req.context?.requestId,
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        durationMs,
        tenantId: req.user?.tenantId ?? null,
        userId: req.user?.id ?? null,
      };

      this.logger.log(JSON.stringify(logPayload));
    });

    next();
  }
}