import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthTokenStore {
  private token?: string;
  private readonly STORAGE_KEY = 'dictClientJwt';

  constructor() {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEY) : null;
    this.token = stored || undefined;
  }

  getToken(): string | undefined {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, token);
    }
  }

  clear(): void {
    this.token = undefined;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }
}
