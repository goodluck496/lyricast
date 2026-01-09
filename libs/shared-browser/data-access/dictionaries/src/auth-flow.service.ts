import { inject, Injectable, InjectionToken } from '@angular/core';
import {
  finalize,
  firstValueFrom,
  from,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';
import { AuthTokenStore } from './auth-token.store';
import { AuthStorageService } from '@lyri-cast/common-browser';
import { AuthApiService } from './auth-api.service';

export interface AuthOverlayPort {
  openAndWaitForToken(): Observable<string>;
}

export const AUTH_OVERLAY_PORT = new InjectionToken<AuthOverlayPort>(
  'AUTH_OVERLAY_PORT'
);

@Injectable({ providedIn: 'root' })
export class AuthFlowService {
  private pendingLogin$?: Observable<string>;
  private silentLoginPromise?: Promise<string | null>;
  private readonly tokenStore = inject(AuthTokenStore);
  private readonly overlay = inject(AUTH_OVERLAY_PORT);
  private readonly authStorage = inject(AuthStorageService, { optional: true });
  private readonly authApi = inject(AuthApiService, { optional: true });

  getOrRequestToken(): Observable<string> {
    return from(this.tokenStore.whenReady()).pipe(
      switchMap(() => {
        const existing = this.tokenStore.getToken();
        if (existing) {
          return of(existing);
        }

        return this.tryAutoLogin().pipe(
          switchMap((autoToken) => {
            if (autoToken) {
              return of(autoToken);
            }

            return this.openOverlayForToken();
          })
        );
      })
    );
  }

  private openOverlayForToken(): Observable<string> {
    if (!this.pendingLogin$) {
      this.pendingLogin$ = this.overlay.openAndWaitForToken().pipe(
        tap((token: string) => this.tokenStore.setToken(token)),
        finalize(() => {
          this.pendingLogin$ = undefined;
        }),
        shareReplay(1)
      );
    }

    return this.pendingLogin$;
  }

  private tryAutoLogin(): Observable<string | null> {
    const storage = this.authStorage;
    const authApi = this.authApi;

    if (!storage || !authApi) {
      return of(null);
    }

    if (!this.silentLoginPromise) {
      this.silentLoginPromise = (async () => {
        try {
          await storage.whenReady();
          const email = storage.getStoredEmail()?.trim();
          if (!email) {
            return null;
          }

          const response = await firstValueFrom(authApi.login(email));
          const token = response.token?.trim();
          if (!token) {
            return null;
          }

          this.tokenStore.setToken(token);
          return token;
        } catch (error) {
          console.warn('[AuthFlowService] Silent login failed', error);
          return null;
        } finally {
          this.silentLoginPromise = undefined;
        }
      })();
    }

    return from(this.silentLoginPromise);
  }
}
