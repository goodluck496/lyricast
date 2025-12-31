import { inject, Injectable, InjectionToken } from '@angular/core';
import { finalize, Observable, of, shareReplay, tap } from 'rxjs';
import { AuthTokenStore } from './auth-token.store';

export interface AuthOverlayPort {
  openAndWaitForToken(): Observable<string>;
}

export const AUTH_OVERLAY_PORT = new InjectionToken<AuthOverlayPort>(
  'AUTH_OVERLAY_PORT'
);

@Injectable({ providedIn: 'root' })
export class AuthFlowService {
  private pendingLogin$?: Observable<string>;
  private readonly tokenStore = inject(AuthTokenStore);
  private readonly overlay = inject(AUTH_OVERLAY_PORT);

  getOrRequestToken(): Observable<string> {
    const existing = this.tokenStore.getToken();
    if (existing) {
      return of(existing);
    }

    if (!this.pendingLogin$) {
      this.pendingLogin$ = this.overlay.openAndWaitForToken().pipe(
        tap((token: string) => this.tokenStore.setToken(token)),
        finalize(() => {
          this.pendingLogin$ = undefined;
        }),
        shareReplay(1)
      );
    }

    return this.pendingLogin$ as Observable<string>;
  }
}
