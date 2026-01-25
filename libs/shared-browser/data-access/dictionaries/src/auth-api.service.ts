import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthControllerLogin200Response,
  AuthService,
} from '@lyri-cast/openapi-songs-dictionary';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(AuthService);

  login(email: string): Observable<AuthControllerLogin200Response> {
    return this.api.authControllerLogin({
      loginDto: {
        email,
      },
    });
  }
}
