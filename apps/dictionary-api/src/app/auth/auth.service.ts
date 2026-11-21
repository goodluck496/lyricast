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
  isAdmin: boolean;
  name?: string;
  picture?: string;
  meta?: Record<string, string>;
}

export interface AuthRequestMeta {
  ip?: string;
  country?: string;
  city?: string;
  userAgent?: string;
  reqHost?: string;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  sub?: string;
  email_verified?: boolean;
}

function parseGoogleUserInfo(data: unknown): GoogleUserInfo {
  if (typeof data !== 'object' || data === null) {
    return {};
  }
  const getString = (key: string): string | undefined => {
    if (key in data) {
      const val = Reflect.get(data, key);
      return typeof val === 'string' ? val : undefined;
    }
    return undefined;
  };
  const getBoolean = (key: string): boolean | undefined => {
    if (key in data) {
      const val = Reflect.get(data, key);
      return typeof val === 'boolean' ? val : undefined;
    }
    return undefined;
  };

  return {
    email: getString('email'),
    name: getString('name'),
    given_name: getString('given_name'),
    family_name: getString('family_name'),
    picture: getString('picture'),
    locale: getString('locale'),
    sub: getString('sub'),
    email_verified: getBoolean('email_verified'),
  };
}

export interface OAuthStatePayload {
  source?: 'web' | 'desktop';
  redirect_port?: number;
  frontend_url?: string;
  return_path?: string;
  use_hash?: boolean;
  nonce?: string;
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

  isAllowedFrontendOrigin(origin: string): boolean {
    if (!origin) return false;
    try {
      const u = new URL(origin);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return true;
      }
      if (u.hostname.endsWith('.onrender.com')) {
        return true;
      }
      const frontendEnv = process.env['FRONTEND_URL'];
      if (frontendEnv) {
        try {
          const fe = new URL(frontendEnv);
          if (u.origin === fe.origin) return true;
        } catch {
          // ignore
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  resolveFrontendUrl(reqHost?: string, candidateUrl?: string): string {
    if (candidateUrl && this.isAllowedFrontendOrigin(candidateUrl)) {
      try {
        const u = new URL(candidateUrl);
        return u.origin;
      } catch {
        // ignore
      }
    }
    if (process.env['FRONTEND_URL']) {
      return process.env['FRONTEND_URL'].replace(/\/+$/, '');
    }
    if (reqHost && reqHost.includes('localhost')) {
      return 'http://localhost:4200';
    }
    return 'https://lyricast-dictionary-client.onrender.com';
  }

  getGoogleAuthUrl(
    source: 'web' | 'desktop' = 'web',
    redirectPort?: number,
    reqHost?: string,
    redirectUrl?: string,
    returnPath?: string
  ): string {
    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const redirectUri = this.resolveCallbackUri(reqHost);
    const resolvedFrontend = this.resolveFrontendUrl(reqHost, redirectUrl);
    const isHashRouter = Boolean(
      (returnPath && returnPath.startsWith('#')) ||
      (redirectUrl && redirectUrl.includes('#'))
    );

    const statePayload: OAuthStatePayload = {
      source,
      redirect_port: redirectPort,
      frontend_url: resolvedFrontend,
      return_path: returnPath || '',
      use_hash: isHashRouter,
      nonce: randomUUID(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    if (!clientId) {
      this.logger.warn('GOOGLE_CLIENT_ID is not configured in environment!');
      if (source === 'desktop' && redirectPort) {
        return `http://127.0.0.1:${redirectPort}/callback?error=google_oauth_not_configured`;
      }
      const cbPath = isHashRouter ? '/#/auth/callback' : '/auth/callback';
      return `${resolvedFrontend}${cbPath}?error=google_oauth_not_configured`;
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
    meta: AuthRequestMeta
  ): Promise<{ redirectUrl: string }> {
    let state: OAuthStatePayload = {};
    if (stateRaw) {
      try {
        state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'));
      } catch {
        state = { source: 'web' };
      }
    }
    const isDesktop = state.source === 'desktop';
    const redirectPort = state.redirect_port;
    const frontendUrl = this.resolveFrontendUrl(meta.reqHost, state.frontend_url);
    const callbackPath = state.use_hash ? '/#/auth/callback' : '/auth/callback';

    const redirectWithError = (err: string, emailVal?: string) => {
      if (isDesktop && redirectPort) {
        const emailParam = emailVal ? `&email=${encodeURIComponent(emailVal)}` : '';
        return { redirectUrl: `http://127.0.0.1:${redirectPort}/callback?error=${err}${emailParam}` };
      }
      const emailParam = emailVal ? `&email=${encodeURIComponent(emailVal)}` : '';
      return { redirectUrl: `${frontendUrl}${callbackPath}?error=${err}${emailParam}` };
    };

    if (!code) {
      return redirectWithError('code_missing');
    }

    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
    if (!clientId || !clientSecret) {
      this.logger.error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing!');
      return redirectWithError('google_oauth_not_configured');
    }

    const redirectUri = this.resolveCallbackUri(meta.reqHost);

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
      return redirectWithError('oauth_exchange_failed');
    }

    const tokenJson: unknown = await tokenRes.json();
    const accessToken =
      typeof tokenJson === 'object' && tokenJson !== null && 'access_token' in tokenJson
        ? String(Reflect.get(tokenJson, 'access_token'))
        : '';

    if (!accessToken) {
      return redirectWithError('oauth_token_missing');
    }

    // 2. Получение данных профиля Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      this.logger.error('Failed to fetch google userinfo');
      return redirectWithError('oauth_userinfo_failed');
    }

    const userData: unknown = await userRes.json();
    const googleUser = parseGoogleUserInfo(userData);

    const email = (googleUser.email || '').trim().toLowerCase();
    if (!email) {
      return redirectWithError('email_missing');
    }

    // 3. Поиск или регистрация пользователя в PostgreSQL
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

    // 4. Запись метаданных в user_meta
    const metaEntries: Array<{ metaKey: string; metaValue: string }> = [
      { metaKey: 'source', metaValue: state.source || 'web' },
      { metaKey: 'last_login_at', metaValue: new Date().toISOString() },
    ];
    if (meta.ip) metaEntries.push({ metaKey: 'ip', metaValue: meta.ip });
    if (meta.country) metaEntries.push({ metaKey: 'country', metaValue: meta.country });
    if (meta.city) metaEntries.push({ metaKey: 'city', metaValue: meta.city });
    if (meta.userAgent) metaEntries.push({ metaKey: 'user_agent', metaValue: meta.userAgent });

    if (googleUser.sub) metaEntries.push({ metaKey: 'google_sub', metaValue: googleUser.sub });
    if (googleUser.name) metaEntries.push({ metaKey: 'name', metaValue: googleUser.name });
    if (googleUser.given_name) metaEntries.push({ metaKey: 'given_name', metaValue: googleUser.given_name });
    if (googleUser.family_name) metaEntries.push({ metaKey: 'family_name', metaValue: googleUser.family_name });
    if (googleUser.picture) metaEntries.push({ metaKey: 'picture', metaValue: googleUser.picture });
    if (googleUser.locale) metaEntries.push({ metaKey: 'locale', metaValue: googleUser.locale });
    if (typeof googleUser.email_verified === 'boolean') {
      metaEntries.push({ metaKey: 'email_verified', metaValue: String(googleUser.email_verified) });
    }

    for (const entry of metaEntries) {
      await db
        .insert(schema.userMeta)
        .values({
          userId: user.id,
          metaKey: entry.metaKey,
          metaValue: entry.metaValue,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.userMeta.userId, schema.userMeta.metaKey],
          set: {
            metaValue: entry.metaValue,
            updatedAt: new Date(),
          },
        });
    }

    // 5. Проверка блокировки пользователя (user.allowed === false)
    if (user.allowed === false) {
      this.logger.warn(`[GoogleAuth] User is blocked: ${email}`);
      return redirectWithError('blocked', email);
    }

    // 7. Создание устройства и активной сессии
    const uaHash = this.hashUserAgent(meta.userAgent || `google-oauth-${state.source || 'web'}`);
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
      return redirectWithError('device_blocked');
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

    // 8. Успешный редирект с токеном
    const userName = googleUser.name || '';
    if (isDesktop && redirectPort) {
      return {
        redirectUrl: `http://127.0.0.1:${redirectPort}/callback?token=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(userName)}`,
      };
    }

    const queryParams = new URLSearchParams({
      token,
      email,
      name: userName,
    });
    if (state.return_path) {
      queryParams.set('return_path', state.return_path);
    }

    return {
      redirectUrl: `${frontendUrl}${callbackPath}?${queryParams.toString()}`,
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

    const adminEmail = (process.env['ADMIN_EMAIL'] || 'nikita.a.kalinin@gmail.com').trim().toLowerCase();
    const isAdmin = session.email.trim().toLowerCase() === adminEmail;

    const userMetas = await db
      .select({
        metaKey: schema.userMeta.metaKey,
        metaValue: schema.userMeta.metaValue,
      })
      .from(schema.userMeta)
      .where(eq(schema.userMeta.userId, session.userId));

    const metaMap: Record<string, string> = {};
    for (const m of userMetas) {
      metaMap[m.metaKey] = m.metaValue;
    }

    return {
      userId: session.userId,
      deviceId: session.deviceId ?? 0,
      email: session.email,
      token,
      isAdmin,
      name: metaMap['name'] || undefined,
      picture: metaMap['picture'] || undefined,
      meta: metaMap,
    };
  }

  async listUsers(): Promise<Array<{ id: number; email: string; name?: string }>> {
    const db = this.db.client;
    const allUsers = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(eq(schema.users.allowed, true))
      .orderBy(schema.users.email);

    if (allUsers.length === 0) return [];

    const metaRows = await db
      .select({
        userId: schema.userMeta.userId,
        key: schema.userMeta.metaKey,
        value: schema.userMeta.metaValue,
      })
      .from(schema.userMeta)
      .where(eq(schema.userMeta.metaKey, 'name'));

    const nameMap = new Map<number, string>();
    for (const m of metaRows) {
      if (m.value) nameMap.set(m.userId, m.value);
    }

    return allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: nameMap.get(u.id),
    }));
  }
}
