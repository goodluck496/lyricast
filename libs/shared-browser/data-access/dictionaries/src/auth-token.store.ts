import { inject, Injectable } from '@angular/core';
import { AuthStorageService } from '@lyri-cast/common-browser';

@Injectable({ providedIn: 'root' })
export class AuthTokenStore {
  protected token?: string;
  private readonly STORAGE_KEY = 'dictClientJwt';
  private readonly authStorage = inject(AuthStorageService, {
    optional: true,
  });
  private readonly readyPromise: Promise<void>;

  constructor() {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(this.STORAGE_KEY)
        : null;
    this.token = stored || undefined;

    if (this.authStorage) {
      this.readyPromise = this.restoreTokenFromStorage();
      this.authStorage.authData$.subscribe((authData) => {
        if (authData.token && authData.token !== this.token) {
          this.token = authData.token;
          this.persistToken(authData.token);
        }

        if (!authData.token && this.token) {
          this.token = undefined;
          this.removePersistedToken();
        }
      });
    } else {
      this.readyPromise = Promise.resolve();
    }
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  getToken(): string | undefined {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
    this.persistToken(token);
    if (this.authStorage) {
      void this.authStorage.saveToken(token);
    }
  }

  clear(): void {
    this.token = undefined;
    this.removePersistedToken();
    if (this.authStorage) {
      void this.authStorage.clearToken();
    }
  }

  protected persistToken(token: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, token);
    }
  }

  protected removePersistedToken(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  private async restoreTokenFromStorage(): Promise<void> {
    try {
      await this.authStorage?.whenReady();
      const storedToken = this.authStorage?.getStoredToken();
      if (storedToken) {
        this.token = storedToken;
        this.persistToken(storedToken);
      }
    } catch (error) {
      console.warn('[AuthTokenStore] Failed to restore token from storage', error);
    }
  }
}
