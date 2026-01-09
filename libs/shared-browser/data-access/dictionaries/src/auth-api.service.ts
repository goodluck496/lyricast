import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DefaultService, AuthResponse } from '@lyri-cast/openapi-songs-dictionary';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(DefaultService);

  login(email: string): Observable<AuthResponse> {
    return this.api.apiPhpactionauthLoginPost({
      apiPhpActionAuthLoginPostRequest: {
        email,
      },
    });
  }
}
