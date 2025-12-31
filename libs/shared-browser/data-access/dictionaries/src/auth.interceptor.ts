import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError, Observable, switchMap, throwError } from 'rxjs';
import { AuthTokenStore } from './auth-token.store';
import { AuthFlowService } from './auth-flow.service';

function addAuthHeader(
  req: HttpRequest<unknown>,
  token: string
): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  });
}

function handleAuthError(
  err: unknown,
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  if (err instanceof HttpErrorResponse && err.status === 401) {
    const tokenStore = inject(AuthTokenStore);
    const authFlow = inject(AuthFlowService);
    tokenStore.clear();
    return authFlow.getOrRequestToken().pipe(
      switchMap((newToken) => {
        const authReq = addAuthHeader(req, newToken);
        return next(authReq);
      })
    );
  }

  return throwError(() => err);
}

export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  // Не трогаем запросы авторизации (auth.login), чтобы не зациклиться
  if (req.url.includes('action=auth.login')) {
    return next(req);
  }

  const tokenStore = inject(AuthTokenStore);
  const authFlow = inject(AuthFlowService);

  const token = tokenStore.getToken();

  if (token) {
    const authReq = addAuthHeader(req, token);
    return next(authReq)
      .pipe(catchError((err) => handleAuthError(err, req, next)));
  }

  return authFlow.getOrRequestToken().pipe(
    switchMap((newToken) => {
      const authReq = addAuthHeader(req, newToken);
      return next(authReq);
    }),
    catchError((err) => handleAuthError(err, req, next))
  );
}
/*
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly tokenStore: AuthTokenStore, private readonly authFlow: AuthFlowService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Не трогаем запросы к auth.php (получение токена происходит без Bearer и без рекурсии)
    if (req.url.includes('/auth.php')) {
      return next.handle(req);
    }

    const token = this.tokenStore.getToken();

    if (token) {
      const authReq = this.addAuthHeader(req, token);
      return next.handle(authReq).pipe(catchError((err) => this.handleAuthError(err, req, next)));
    }

    return this.authFlow.getOrRequestToken().pipe(
      switchMap((newToken) => {
        const authReq = this.addAuthHeader(req, newToken);
        return next.handle(authReq);
      }),
      catchError((err) => this.handleAuthError(err, req, next)),
    );
  }

  private addAuthHeader(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
    return req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  private handleAuthError(err: unknown, req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.tokenStore.clear();

      return this.authFlow.getOrRequestToken().pipe(
        switchMap((newToken) => {
          const authReq = this.addAuthHeader(req, newToken);
          return next.handle(authReq);
        }),
      );
    }

    return throwError(() => err);
  }
}
*/
