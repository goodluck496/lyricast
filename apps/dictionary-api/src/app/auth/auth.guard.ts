import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, AuthUser } from './auth.service';
import { IS_OPTIONAL_AUTH } from './optional-auth.decorator';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || Array.isArray(authHeader)) {
      if (isOptional) {
        return true;
      }
      throw new UnauthorizedException('Missing Authorization header');
    }
    const token = this.extractBearer(authHeader);
    if (!token) {
      if (isOptional) {
        return true;
      }
      throw new UnauthorizedException('Invalid Authorization header');
    }

    try {
      const user = await this.authService.validateToken(token);
      req.authUser = user;
      return true;
    } catch (err) {
      if (isOptional) {
        return true;
      }
      throw err;
    }
  }

  private extractBearer(header: string): string | null {
    const [type, value] = header.split(' ');
    if (!type || !value) return null;
    if (type.toLowerCase() !== 'bearer') return null;
    return value.trim() || null;
  }
}
