import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthControllerLogin200Response,
  AuthService,
} from '@lyri-cast/openapi-songs-dictionary';
import { DICTIONARIES_API_BASE } from './export-jobs.service';
import { BASE_PATH } from '@lyri-cast/openapi-songs-dictionary';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(AuthService);
  private readonly explicitBase = inject(DICTIONARIES_API_BASE, { optional: true });
  private readonly basePathToken = inject(BASE_PATH, { optional: true });

  resolveBaseUrl(): string {
    if (this.explicitBase) {
      const trimmed = this.explicitBase.replace(/\/+$/, '');
      if (trimmed.endsWith('/songs')) return trimmed.slice(0, -6);
      if (trimmed.endsWith('/api')) return trimmed.slice(0, -4);
      return trimmed;
    }
    if (this.basePathToken) {
      const trimmed = this.basePathToken.replace(/\/+$/, '');
      if (trimmed.endsWith('/api')) return trimmed.slice(0, -4);
      return trimmed;
    }
    return '';
  }

  getGoogleAuthUrl(source: 'web' | 'desktop' = 'web', redirectPort?: number): string {
    const base = this.resolveBaseUrl();
    const params = new URLSearchParams({ source });
    if (redirectPort) params.set('redirect_port', String(redirectPort));
    return `${base}/api/auth/google?${params.toString()}`;
  }

  login(email: string): Observable<AuthControllerLogin200Response> {
    return this.api.authControllerLogin({
      loginDto: {
        email,
      },
    });
  }
}
