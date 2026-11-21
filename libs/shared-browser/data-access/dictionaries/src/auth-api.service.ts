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
    let base = (this.explicitBase || this.basePathToken || '').trim().replace(/\/+$/, '');
    if (base.startsWith('svc:')) {
      base = typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://lyricast-dictionary-api.onrender.com';
    }
    while (
      base.endsWith('/songs') ||
      base.endsWith('/bibles') ||
      base.endsWith('/dictionaries') ||
      base.endsWith('/api')
    ) {
      if (base.endsWith('/songs')) {
        base = base.slice(0, -6).replace(/\/+$/, '');
      } else if (base.endsWith('/bibles')) {
        base = base.slice(0, -7).replace(/\/+$/, '');
      } else if (base.endsWith('/dictionaries')) {
        base = base.slice(0, -13).replace(/\/+$/, '');
      } else if (base.endsWith('/api')) {
        base = base.slice(0, -4).replace(/\/+$/, '');
      }
    }
    return base;
  }

  getGoogleAuthUrl(source: 'web' | 'desktop' = 'web', redirectPort?: number): string {
    const base = this.resolveBaseUrl();
    const params = new URLSearchParams({ source });
    if (redirectPort) params.set('redirect_port', String(redirectPort));
    if (typeof window !== 'undefined' && window.location?.origin) {
      params.set('redirect_url', window.location.origin);
      if (window.location.hash) {
        params.set('return_path', window.location.hash);
      }
    }
    const prefix = base ? `${base}/api/auth/google` : '/api/auth/google';
    return `${prefix}?${params.toString()}`;
  }

  login(email: string): Observable<AuthControllerLogin200Response> {
    return this.api.authControllerLogin({
      loginDto: {
        email,
      },
    });
  }
}
