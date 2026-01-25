import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, AuthUser } from './auth.service';

declare module 'http' {
  interface IncomingMessage {
    authUser?: AuthUser;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || Array.isArray(authHeader)) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const token = this.extractBearer(authHeader);
    if (!token) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    const user = await this.authService.validateToken(token);
    (req as any).authUser = user;
    return true;
  }

  private extractBearer(header: string): string | null {
    const [type, value] = header.split(' ');
    if (!type || !value) return null;
    if (type.toLowerCase() !== 'bearer') return null;
    return value.trim() || null;
  }
}
