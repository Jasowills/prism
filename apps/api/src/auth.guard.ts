import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { loadConfig } from '@prism/config';

/** API-key guard for administrative endpoints. Webhook route is exempt (signature instead). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const cfg = loadConfig();
    if (!cfg.PRISM_API_KEY) return true; // dev: no key configured
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['x-api-key'] ?? req.query.api_key;
    if (key === cfg.PRISM_API_KEY) return true;
    const res = ctx.switchToHttp().getResponse();
    res.status(401).json({ error: 'unauthorized', code: 'INVALID_API_KEY' });
    return false;
  }
}
