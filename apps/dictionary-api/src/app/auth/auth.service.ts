import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import * as schema from '../../lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';

export interface LoginResponse {
  ok: true;
  token: string;
  userId: number;
  deviceId: number;
  expiresIn: number;
}

export interface AuthUser {
  userId: number;
  deviceId: number;
  email: string;
  token: string;
}

@Injectable()
export class AuthService {
  private readonly defaultExpiresSec = 30 * 24 * 60 * 60; // 30 дней

  constructor(private readonly db: DatabaseService) {}

  async login(emailRaw: string, userAgent: string): Promise<LoginResponse> {
    const email = (emailRaw || '').trim().toLowerCase();
    if (email === '') {
      throw new UnauthorizedException('Email required');
    }

    const expiresIn = this.defaultExpiresSec;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const uaHash = this.hashUserAgent(userAgent || '');

    const db = this.db.client;

    // Ищем/создаём пользователя
    const [foundUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    const userId =
      foundUser?.id ??
      (
        await db
          .insert(schema.users)
          .values({ email })
          .returning({ id: schema.users.id, allowed: schema.users.allowed })
      )[0].id;

    // Проверяем allowed (если когда-то будет выключен)
    if (foundUser && foundUser.allowed === false) {
      throw new UnauthorizedException('User is not allowed');
    }

    // Ищем/создаём устройство по hash user-agent
    const [foundDevice] = await db
      .select()
      .from(schema.devices)
      .where(and(eq(schema.devices.userId, userId), eq(schema.devices.userAgentHash, uaHash)))
      .limit(1);

    const deviceId =
      foundDevice?.id ??
      (
        await db
          .insert(schema.devices)
          .values({ userId, userAgentHash: uaHash })
          .returning({ id: schema.devices.id })
      )[0].id;

    if (foundDevice?.isBlocked) {
      throw new UnauthorizedException('Device blocked');
    }

    // Очищаем старые сессии для устройства (упрощённо — одна активная)
    await db.delete(schema.sessions).where(eq(schema.sessions.deviceId, deviceId));

    const token = randomUUID();
    await db
      .insert(schema.sessions)
      .values({ userId, deviceId, token, expiresAt })
      .returning({ id: schema.sessions.id });

    return {
      ok: true,
      token,
      userId,
      deviceId,
      expiresIn,
    };
  }

  private hashUserAgent(ua: string): string {
    return createHash('sha256').update(ua || 'unknown').digest('hex');
  }

  async validateToken(token: string): Promise<AuthUser> {
    const db = this.db.client;
    const now = new Date();
    const [session] = await db
      .select({
        sessionId: schema.sessions.id,
        userId: schema.sessions.userId,
        deviceId: schema.sessions.deviceId,
        expiresAt: schema.sessions.expiresAt,
        email: schema.users.email,
        allowed: schema.users.allowed,
        isBlocked: schema.devices.isBlocked,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .leftJoin(schema.devices, eq(schema.devices.id, schema.sessions.deviceId))
      .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, now)))
      .limit(1);

    if (!session) {
      throw new UnauthorizedException('Invalid token');
    }
    if (session.allowed === false) {
      throw new UnauthorizedException('User not allowed');
    }
    if (session.isBlocked === true) {
      throw new UnauthorizedException('Device blocked');
    }

    return {
      userId: session.userId,
      deviceId: session.deviceId ?? 0,
      email: session.email,
      token,
    };
  }
}
