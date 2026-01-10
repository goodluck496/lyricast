import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import { AuthApiService, AuthOverlayPort } from '@lyri-cast/shared-browser/data-access/dictionaries';
import { AuthStorageService } from '@lyri-cast/common-browser';

@Injectable({ providedIn: 'root' })
export class AuthOverlayService implements AuthOverlayPort {
  private readonly authApi = inject(AuthApiService);
  private readonly authStorage = inject(AuthStorageService);

  private loginSubject?: Subject<string>;
  private readonly visibleSubject = new BehaviorSubject<boolean>(false);

  readonly isVisible$: Observable<boolean> = this.visibleSubject.asObservable();

  openAndWaitForToken(): Observable<string> {
    if (!this.loginSubject) {
      this.loginSubject = new Subject<string>();
      this.visibleSubject.next(true);
    }

    return this.loginSubject.asObservable();
  }

  getStoredEmail(): string {
    return this.authStorage.getStoredEmail() ?? '';
  }

  async submitEmail(email: string): Promise<void> {
    const trimmedEmail = email.trim();
    await this.authStorage.saveEmail(trimmedEmail);

    try {
      const response = await firstValueFrom(this.authApi.login(trimmedEmail));
      const token = response.token;
      await this.authStorage.saveToken(token);

      this.visibleSubject.next(false);
      if (this.loginSubject) {
        this.loginSubject.next(token);
        this.loginSubject.complete();
        this.loginSubject = undefined;
      }
    } catch (error) {
      console.error('[AuthOverlay] Login failed', error);
      if (this.loginSubject) {
        this.loginSubject.error(error instanceof Error ? error : new Error('Login failed'));
        this.loginSubject = undefined;
      }
    }
  }

  cancel(): void {
    this.visibleSubject.next(false);
    if (this.loginSubject) {
      this.loginSubject.error(new Error('Login cancelled'));
      this.loginSubject = undefined;
    }
  }
}
