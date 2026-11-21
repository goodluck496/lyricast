import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import { AuthApiService, AuthOverlayPort } from '@lyri-cast/shared-browser/data-access/dictionaries';
import { AuthStorageService, WindowService } from '@lyri-cast/common-browser';

@Injectable({ providedIn: 'root' })
export class AuthOverlayService implements AuthOverlayPort {
  private readonly authApi = inject(AuthApiService);
  private readonly authStorage = inject(AuthStorageService);
  private readonly windowSrv = inject(WindowService);

  private loginSubject?: Subject<string>;
  private readonly visibleSubject = new BehaviorSubject<boolean>(false);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string>('');

  readonly isVisible$: Observable<boolean> = this.visibleSubject.asObservable();
  readonly isLoading$: Observable<boolean> = this.loadingSubject.asObservable();
  readonly error$: Observable<string> = this.errorSubject.asObservable();

  openAndWaitForToken(): Observable<string> {
    if (!this.loginSubject) {
      this.loginSubject = new Subject<string>();
      this.errorSubject.next('');
      this.loadingSubject.next(false);
      this.visibleSubject.next(true);
    }

    return this.loginSubject.asObservable();
  }

  getStoredEmail(): string {
    return this.authStorage.getStoredEmail() ?? '';
  }

  async loginWithGoogle(): Promise<void> {
    const electron = this.windowSrv.electronContext;
    if (electron?.loginGoogle) {
      this.loadingSubject.next(true);
      this.errorSubject.next('');
      try {
        const res = await electron.loginGoogle();
        if (res.ok && res.token) {
          await this.authStorage.saveToken(res.token);
          if (res.email) {
            await this.authStorage.saveEmail(res.email);
          }
          this.visibleSubject.next(false);
          this.loadingSubject.next(false);
          if (this.loginSubject) {
            this.loginSubject.next(res.token);
            this.loginSubject.complete();
            this.loginSubject = undefined;
          }
        } else {
          this.loadingSubject.next(false);
          const errMsg =
            res.error === 'blocked'
              ? 'Пользователь заблокирован администратором'
              : (res.error || 'Ошибка входа через Google');
          this.errorSubject.next(errMsg);
        }
      } catch (err: unknown) {
        this.loadingSubject.next(false);
        const errMsg = err instanceof Error ? err.message : 'Не удалось выполнить вход через Google';
        this.errorSubject.next(errMsg);
      }
    } else {
      window.location.href = this.authApi.getGoogleAuthUrl('web');
    }
  }

  async submitEmail(email: string): Promise<void> {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    this.loadingSubject.next(true);
    this.errorSubject.next('');

    try {
      await this.authStorage.saveEmail(trimmedEmail);
      const response = await firstValueFrom(this.authApi.login(trimmedEmail));
      const token = response.token;
      await this.authStorage.saveToken(token);

      this.visibleSubject.next(false);
      this.loadingSubject.next(false);
      if (this.loginSubject) {
        this.loginSubject.next(token);
        this.loginSubject.complete();
        this.loginSubject = undefined;
      }
    } catch (err: unknown) {
      this.loadingSubject.next(false);
      const errMsg = err instanceof Error ? err.message : 'Ошибка авторизации';
      this.errorSubject.next(errMsg);
    }
  }

  cancel(): void {
    this.visibleSubject.next(false);
    this.loadingSubject.next(false);
    this.errorSubject.next('');
    if (this.loginSubject) {
      this.loginSubject.error(new Error('Login cancelled'));
      this.loginSubject = undefined;
    }
  }
}
