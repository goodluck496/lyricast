import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AuthData {
  email?: string;
  token?: string;
  lastLogin?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthStorageService {
  private readonly authDataSubject = new BehaviorSubject<AuthData>({});
  readonly authData$ = this.authDataSubject.asObservable();
  private readonly readyPromise: Promise<void>;

  constructor() {
    // Синхронный fallback для быстрого доступа
    this.loadSyncFallback();
    this.readyPromise = this.loadAuthData();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private loadSyncFallback(): void {
    try {
      if (typeof window !== 'undefined' && (window as any).electron) {
        // Electron - пробуем синхронно из localStorage как fallback
        const stored = localStorage.getItem('lyricastAuth');
        if (stored) {
          const authData = JSON.parse(stored);
          this.authDataSubject.next(authData);
          console.log('[AuthStorage] Sync fallback from localStorage:', authData);
        }
      }
    } catch (error) {
      console.error('[AuthStorage] Sync fallback failed:', error);
    }
  }

  private async loadAuthData(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && (window as any).electron) {
        // Electron environment - use file storage
        const settings = await (window as any).electron.loadUserSettings();
        const authData = settings?.auth || {};
        this.authDataSubject.next(authData);
        console.log('[AuthStorage] Loaded auth data from file:', authData);
      } else {
        // Browser environment - fallback to localStorage
        const stored = localStorage.getItem('lyricastAuth');
        const authData = stored ? JSON.parse(stored) : {};
        this.authDataSubject.next(authData);
        console.log('[AuthStorage] Loaded auth data from localStorage:', authData);
      }
    } catch (error) {
      console.error('[AuthStorage] Failed to load auth data:', error);
      this.authDataSubject.next({});
    }
  }

  private async saveAuthData(authData: AuthData): Promise<void> {
    try {
      if (typeof window !== 'undefined' && (window as any).electron) {
        // Electron environment - use file storage
        const currentSettings = await (window as any).electron.loadUserSettings() || {};
        const updatedSettings = { ...currentSettings, auth: authData };
        await (window as any).electron.saveUserSettings(updatedSettings);
        console.log('[AuthStorage] Saved auth data to file:', authData);
      } else {
        // Browser environment - fallback to localStorage
        localStorage.setItem('lyricastAuth', JSON.stringify(authData));
        console.log('[AuthStorage] Saved auth data to localStorage:', authData);
      }
    } catch (error) {
      console.error('[AuthStorage] Failed to save auth data:', error);
    }
  }

  async saveEmail(email: string): Promise<void> {
    await this.whenReady();
    const currentData = this.authDataSubject.value;
    const updatedData = {
      ...currentData,
      email,
      lastLogin: Date.now(),
    };
    this.authDataSubject.next(updatedData);
    await this.saveAuthData(updatedData);
  }

  async saveToken(token: string): Promise<void> {
    await this.whenReady();
    const currentData = this.authDataSubject.value;
    const updatedData = {
      ...currentData,
      token,
      lastLogin: Date.now(),
    };
    this.authDataSubject.next(updatedData);
    await this.saveAuthData(updatedData);
  }

  async clearToken(): Promise<void> {
    await this.whenReady();
    const currentData = this.authDataSubject.value;
    const updatedData: AuthData = {
      ...currentData,
      token: undefined,
    };
    this.authDataSubject.next(updatedData);
    await this.saveAuthData(updatedData);
  }

  async clearAuth(): Promise<void> {
    await this.whenReady();
    this.authDataSubject.next({});
    await this.saveAuthData({});
  }

  getStoredEmail(): string | undefined {
    return this.authDataSubject.value.email;
  }

  getStoredToken(): string | undefined {
    return this.authDataSubject.value.token;
  }

  hasStoredEmail(): boolean {
    return !!this.authDataSubject.value.email;
  }

  hasStoredToken(): boolean {
    return !!this.authDataSubject.value.token;
  }
}
