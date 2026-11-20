import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(AuthService.name);
  private readonly defaultExpiresSec = 30 * 24 * 60 * 60; // 30 дней

  constructor(private readonly db: DatabaseService) {}

  resolveCallbackUri(reqHost?: string): string {
    const backendBase = process.env['BACKEND_URL'] || process.env['DICTIONARY_API_URL'];
    if (backendBase) {
      return `${backendBase.replace(/\/+$/, '')}/api/auth/google/callback`;
    }
    if (reqHost) {
      const proto = reqHost.includes('localhost') ? 'http' : 'https';
      return `${proto}://${reqHost}/api/auth/google/callback`;
    }
    return process.env['NODE_ENV'] === 'production'
      ? 'https://lyricast-dictionary-api.onrender.com/api/auth/google/callback'
      : 'http://localhost:3000/api/auth/google/callback';
  }

  resolveFrontendUrl(reqHost?: string): string {
    if (process.env['FRONTEND_URL']) {
      return process.env['FRONTEND_URL'].replace(/\/+$/, '');
    }
    if (reqHost && reqHost.includes('localhost')) {
      return 'http://localhost:4200';
    }
    return 'https://lyricast-dictionary-client.onrender.com';
  }

  getGoogleAuthUrl(source: 'web' | 'desktop' = 'web', redirectPort?: number, reqHost?: string): string {
    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const redirectUri = this.resolveCallbackUri(reqHost);

    const statePayload = {
      source,
      redirect_port: redirectPort,
      nonce: randomUUID(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    if (!clientId) {
      this.logger.warn('GOOGLE_CLIENT_ID is not configured in environment!');
      const frontendUrl = this.resolveFrontendUrl(reqHost);
      if (source === 'desktop' && redirectPort) {
        return `http://127.0.0.1:${redirectPort}/callback?error=google_oauth_not_configured`;
      }
      return `${frontendUrl}/auth/callback?error=google_oauth_not_configured`;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(
    code: string | undefined,
    stateRaw: string | undefined,
    userAgent: string,
    reqHost?: string
  ): Promise<{ redirectUrl: string }> {
    let state: { source?: 'web' | 'desktop'; redirect_port?: number } = {};
    if (stateRaw) {
      try {
        state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'));
      } catch {
        state = { source: 'web' };
      }
    }
    const isDesktop = state.source === 'desktop';
    const redirectPort = state.redirect_port;
    const frontendUrl = this.resolveFrontendUrl(reqHost);

    if (!code) {
      const err = 'code_missing';
      if (isDesktop && redirectPort) {
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}` };
      }
      return { redirectUrl: `${frontendUrl}/auth/callback?error=${err}` };
    }

    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
    if (!clientId || !clientSecret) {
      this.logger.error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing!');
      const err = 'google_oauth_not_configured';
      if (isDesktop && redirectPort) {
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}` };
      }
      return { redirectUrl: `${frontendUrl}/auth/callback?error=${err}` };
    }

    const redirectUri = this.resolveCallbackUri(reqHost);

    // 1. Обмен кода на токены
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      this.logger.error(`Failed to exchange google code: ${errText}`);
      const err = 'oauth_exchange_failed';
      if (isDesktop && redirectPort) {
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}` };
      }
      return { redirectUrl: `${frontendUrl}/auth/callback?error=${err}` };
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // 2. Получение данных профиля Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      this.logger.error('Failed to fetch google userinfo');
      const err = 'oauth_userinfo_failed';
      if (isDesktop && redirectPort) {
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}` };
      }
      return { redirectUrl: `${frontendUrl}/auth/callback?error=${err}` };
    }

    const googleUser = (await userRes.json()) as {
      email?: string;
      name?: string;
      picture?: string;
      sub?: string;
    };

    const email = (googleUser.email || '').trim().toLowerCase();
    if (!email) {
      const err = 'email_missing';
      if (isDesktop && redirectPort) {
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}` };
      }
      return { redirectUrl: `${frontendUrl}/auth/callback?error=${err}` };
    }

    // 3. Белый список администратора для веб-клиента dictionary-client
    const adminEmail = (process.env['ADMIN_EMAIL'] || 'nikita.a.kalinin@gmail.com').trim().toLowerCase();
    if (!isDesktop) {
      if (email !== adminEmail) {
        this.logger.warn(`[GoogleAuth] Access denied for web client: ${email} is not admin (${adminEmail})`);
        return {
          redirectUrl: `${frontendUrl}/auth/callback?error=forbidden&email=${encodeURIComponent(email)}`,
        };
      }
    }

    // 4. Поиск или регистрация пользователя в PostgreSQL
    const db = this.db.client;
    const [foundUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    let user = foundUser;
    if (!user) {
      const [created] = await db
        .insert(schema.users)
        .values({ email, allowed: true })
        .returning();
      user = created;
      this.logger.log(`[GoogleAuth] New user registered: ${email} (id: ${user.id}, source: ${state.source || 'web'})`);
    }

    // 5. Проверка блокировки (allowed === false)
    if (user.allowed === false) {
      this.logger.warn(`[GoogleAuth] User is blocked: ${email}`);
      const err = 'blocked';
      if (isDesktop && redirectPort) {
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}&email=${encodeURIComponent(email)}` };
      }
      return { redirectUrl: `${frontendUrl}/auth/callback?error=${err}&email=${encodeURIComponent(email)}` };
    }

    // 6. Создание устройства и активной сессии
    const uaHash = this.hashUserAgent(userAgent || `google-oauth-${state.source || 'web'}`);
    const [foundDevice] = await db
      .select()
      .from(schema.devices)
      .where(and(eq(schema.devices.userId, user.id), eq(schema.devices.userAgentHash, uaHash)))
      .limit(1);

    const deviceId =
      foundDevice?.id ??
      (
        await db
          .insert(schema.devices)
          .values({ userId: user.id, userAgentHash: uaHash })
          .returning({ id: schema.devices.id })
      )[0].id;

    if (foundDevice?.isBlocked) {
      const err = 'device_blocked';
      if (isDesktop && redirectPort) {
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}` };
      }
      return { redirectUrl: `${frontendUrl}/auth/callback?error=${err}` };
    }

    await db.delete(schema.sessions).where(eq(schema.sessions.deviceId, deviceId));

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + this.defaultExpiresSec * 1000);
    await db.insert(schema.sessions).values({
      userId: user.id,
      deviceId,
      token,
      expiresAt,
    });

    // 7. Успешный редирект с токеном
    const userName = googleUser.name || '';
    if (isDesktop && redirectPort) {
      return {
        redirectUrl: `http://127.0.0.1:${redirectPort}/callback?token=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(userName)}`,
      };
    }

    return {
      redirectUrl: `${frontendUrl}/auth/callback#token=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(userName)}`,
    };
  }

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
