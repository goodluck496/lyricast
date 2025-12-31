import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import { AuthApiService, AuthOverlayPort } from '@lyri-cast/shared-browser/data-access/dictionaries';

@Injectable({ providedIn: 'root' })
export class AuthOverlayService implements AuthOverlayPort {
  private readonly authApi = inject(AuthApiService)
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

  async submitEmail(email: string): Promise<void> {
    const response = await firstValueFrom(this.authApi.login(email));
    const token = response.token;

    this.visibleSubject.next(false);
    if (this.loginSubject) {
      this.loginSubject.next(token);
      this.loginSubject.complete();
      this.loginSubject = undefined;
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
