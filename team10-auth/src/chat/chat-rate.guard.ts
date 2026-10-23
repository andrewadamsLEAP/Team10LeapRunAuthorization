import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

@Injectable()
export class ChatRateGuard implements CanActivate {
  private readonly clients = new Map<string, { count: number; reset: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    // Do not trust X-Forwarded-For. Configure trusted proxies explicitly at deployment.
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    for (const [key, state] of this.clients) {
      if (state.reset <= now) this.clients.delete(key);
    }
    let state = this.clients.get(ip);
    if (!state) {
      if (this.clients.size >= 10_000) this.reject(response, 60);
      state = { count: 0, reset: now + 60_000 };
      this.clients.set(ip, state);
    }
    if (++state.count > 10) this.reject(response, Math.ceil((state.reset - now) / 1000));
    return true;
  }

  private reject(response: Response, seconds: number): never {
    response.setHeader('Retry-After', String(seconds));
    throw new HttpException('Too many chat requests. Please try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
  }
}