import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';

function extractErrorMessage(err: HttpErrorResponse): string {
  const body = err.error as any;

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  if (body && typeof body === 'object') {
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
  }

  if (err.message) {
    return err.message;
  }

  return 'Неизвестная ошибка';
}

export const apiErrorToastInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const messageService = inject(MessageService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        // Не дублируем сообщения для auth.login: там пользователь и так видит ошибку в оверлее
        const isLogin = req.url.includes('action=auth.login');

        if (!isLogin) {
          const detail = extractErrorMessage(err);

          messageService.add({
            severity: 'error',
            summary: `Ошибка API ${err.status}`,
            detail,
            life: 6000,
          });
        }
      }

      return throwError(() => err);
    })
  );
};
