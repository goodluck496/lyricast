import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError, from, Observable, of, switchMap, throwError } from 'rxjs';
import { AuthTokenStore } from './auth-token.store';
import { AuthFlowService } from './auth-flow.service';

export function browserScopedAuthInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  // Не трогаем запросы авторизации (auth.login), чтобы не зациклиться
  if (req.url.includes('action=auth.login')) {
    return next(req);
  }

  // В основном приложении токен нужен только для синхронизации справочников,
  // чтобы оверлей авторизации не всплывал при запуске приложения.
  const isDictionarySyncRequest = (() => {
    // Extend this list when new dictionary types appear.
    // Goal: only dictionary sync endpoints should trigger auth overlay in browser app.
    const allowedPaths = [
      // Songs dictionaries
      '/songs/dictionaries',
      '/songs/dictionaries/install',
      '/songs/dictionaries/delete',
      '/songs/dictionaries/clear',
      // Export jobs (svc://.../export-json|export-jobs)
      '/songs/song-books',
      '/songs/export-jobs',
      '/songs/dictionaries/song-books',
      '/songs/dictionaries/export-jobs',
    ];

    const normalizedPath = (() => {
      try {
        const url = new URL(req.url);
        const hostPrefix = url.protocol === 'svc:' && url.hostname
          ? `/${url.hostname}`
          : '';
        return `${hostPrefix}${url.pathname}`.replace(/\/+/g, '/');
      } catch {
        return req.url;
      }
    })();

    return allowedPaths.some((p) => normalizedPath.startsWith(p));
  })();

  if (!isDictionarySyncRequest) {
    return next(req);
  }

  // svc:// протокол в Electron/Chromium может вырезать Authorization/X-Auth-Token.
  // Поэтому дублируем токен в query-параметр authToken.
  const tokenStore = inject(AuthTokenStore);
  const authFlow = inject(AuthFlowService);

  const sendWithToken = (
    tokenValue: string,
    retried: boolean
  ): Observable<HttpEvent<unknown>> => {
    const authReq = req.clone({
      setParams: { authToken: tokenValue },
      setHeaders: {
        Authorization: `Bearer ${tokenValue}`,
        'X-Auth-Token': tokenValue,
      },
    });

    return next(authReq).pipe(
      catchError((err) => {
        if (
          !retried &&
          err instanceof HttpErrorResponse &&
          [401, 403].includes(err.status)
        ) {
          tokenStore.clear();
          return authFlow.getOrRequestToken().pipe(
            switchMap((nextToken) => sendWithToken(String(nextToken), true))
          );
        }

        return throwError(() => err);
      })
    );
  };

  return from(tokenStore.whenReady()).pipe(
    switchMap(() => {
      const existing = tokenStore.getToken();
      const ensureToken$ = existing
        ? of(String(existing))
        : authFlow.getOrRequestToken();

      return ensureToken$.pipe(
        switchMap((token) => sendWithToken(String(token), false))
      );
    })
  );
}
