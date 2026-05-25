import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Response } from 'express';
import { AppRequest } from '../types/request-context.type';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: AppRequest, res: Response, next: NextFunction) {
    req.context = {
      requestId: randomUUID(),
      startedAt: Date.now(),
    };

    res.setHeader('x-request-id', req.context.requestId);

    next();
  }
}