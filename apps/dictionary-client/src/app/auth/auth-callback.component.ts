import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AuthStorageService } from '@lyri-cast/common-browser';
import { AuthApiService } from '@lyri-cast/shared-browser/data-access/dictionaries';

@Component({
  standalone: true,
  selector: 'app-auth-callback',
  imports: [CommonModule, ButtonModule, CardModule, MessageModule, ProgressSpinnerModule],
  template: `
    <div class="callback-container">
      <div class="callback-card">
        @if (isLoading) {
          <div class="loading-box">
            <p-progressSpinner [style]="{ width: '48px', height: '48px' }"></p-progressSpinner>
            <p>Завершение авторизации...</p>
          </div>
        } @else if (errorMessage) {
          <div class="error-box">
            <i class="pi pi-shield error-icon"></i>
            <h2>{{ errorTitle }}</h2>
            <p class="error-text">{{ errorMessage }}</p>
            @if (userEmail) {
              <div class="email-badge">
                <i class="pi pi-user"></i> {{ userEmail }}
              </div>
            }
            <div class="actions">
              <p-button
                label="Войти под другим Google-аккаунтом"
                icon="pi pi-google"
                severity="primary"
                (onClick)="retryGoogleLogin()"
              ></p-button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .callback-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 80vh;
        padding: 20px;
      }
      .callback-card {
        background: #ffffff;
        border-radius: 12px;
        padding: 36px 32px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
        max-width: 480px;
        width: 100%;
        text-align: center;
      }
      .loading-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        color: #555;
      }
      .error-box {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .error-icon {
        font-size: 48px;
        color: #e24c4c;
        margin-bottom: 16px;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 22px;
        color: #1a1a1a;
      }
      .error-text {
        font-size: 15px;
        line-height: 1.5;
        color: #555;
        margin-bottom: 16px;
      }
      .email-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        background: #f1f5f9;
        border-radius: 20px;
        font-size: 14px;
        color: #334155;
        margin-bottom: 24px;
      }
      .actions {
        display: flex;
        justify-content: center;
        width: 100%;
      }
    `,
  ],
})
export class AuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authStorage = inject(AuthStorageService);
  private readonly authApi = inject(AuthApiService);

  isLoading = true;
  errorTitle = 'Ошибка входа';
  errorMessage = '';
  userEmail = '';

  async ngOnInit(): Promise<void> {
    const queryParams = this.route.snapshot.queryParamMap;
    const fragment = this.route.snapshot.fragment || '';
    const fragParams = new URLSearchParams(fragment);

    let rawParams: URLSearchParams | null = null;
    if (typeof window !== 'undefined' && window.location.hash) {
      const qIndex = window.location.hash.indexOf('?');
      if (qIndex !== -1) {
        rawParams = new URLSearchParams(window.location.hash.slice(qIndex + 1));
      }
    }

    const token =
      fragParams.get('token') ||
      queryParams.get('token') ||
      rawParams?.get('token');

    const email =
      fragParams.get('email') ||
      queryParams.get('email') ||
      rawParams?.get('email') ||
      '';

    const error =
      queryParams.get('error') ||
      fragParams.get('error') ||
      rawParams?.get('error');

    const returnPath =
      fragParams.get('return_path') ||
      queryParams.get('return_path') ||
      rawParams?.get('return_path');

    this.userEmail = email;

    if (error) {
      this.isLoading = false;
      if (error === 'forbidden') {
        this.errorTitle = 'Доступ ограничен';
        this.errorMessage =
          'Редактирование справочников разрешено только администратору (nikita.a.kalinin@gmail.com).';
      } else if (error === 'blocked') {
        this.errorTitle = 'Доступ заблокирован';
        this.errorMessage = 'Ваш аккаунт был заблокирован администратором системы.';
      } else if (error === 'google_oauth_not_configured') {
        this.errorTitle = 'OAuth не настроен';
        this.errorMessage =
          'На сервере ещё не заданы ключи GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.';
      } else {
        this.errorTitle = 'Ошибка авторизации';
        this.errorMessage = `Не удалось завершить вход через Google (${error}).`;
      }
      return;
    }

    if (token) {
      await this.authStorage.saveToken(token);
      if (email) {
        await this.authStorage.saveEmail(email);
      }
      this.isLoading = false;
      if (returnPath) {
        const cleanPath = returnPath.replace(/^#\/?/, '/');
        this.router.navigateByUrl(cleanPath, { replaceUrl: true });
      } else {
        this.router.navigate(['/songs'], { replaceUrl: true });
      }
      return;
    }

    // Если нет ни ошибки, ни токена
    this.isLoading = false;
    this.errorMessage = 'Параметры авторизации не найдены в ответе сервера.';
  }

  retryGoogleLogin(): void {
    window.location.href = this.authApi.getGoogleAuthUrl('web');
  }
}
