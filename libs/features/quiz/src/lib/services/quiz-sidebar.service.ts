import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import {
  BridgeService,
  DEFAULT_CASTING_PAGE_CONFIG,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import { firstValueFrom } from 'rxjs';
import { filter, skip } from 'rxjs/operators';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Pages } from '@lyri-cast/common-browser';
import { QuizStateService } from './quiz-state.service';
import { QuizState, QuizSummary } from '../quiz.types';

@Injectable({ providedIn: 'root' })
export class QuizSidebarService {
  private readonly quizStateService = inject(QuizStateService);
  private readonly windowSrv = inject(WindowService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly bridge = inject(BridgeService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  private _selectedQuiz: QuizSummary | null = null;

  getSelectedQuiz(): QuizSummary | null {
    return this._selectedQuiz;
  }

  setSelectedQuiz(quiz: QuizSummary | null): void {
    this._selectedQuiz = quiz;
  }

  async listQuizzes() {
    return this.quizStateService.listQuizzes();
  }

  async loadQuizById(id: string) {
    return this.quizStateService.loadById(id);
  }

  async createEmptyQuiz(title: string): Promise<string | null> {
    const trimmed = title.trim();
    if (!trimmed) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Название не задано',
        detail: 'Введите название новой викторины.',
      });
      return null;
    }

    const emptyState: QuizState = {
      teams: [],
      topics: [],
    };

    return this.quizStateService.saveAsNew(
      {
        title: trimmed,
        date: new Date().toISOString().slice(0, 10),
      },
      emptyState,
    );
  }

  confirmDeleteQuiz(event: Event, cb: () => void): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: 'Удалить викторину? Это действие нельзя отменить.',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-text p-button-sm',
      accept: cb,
    });
  }

  async deleteQuizById(id: string): Promise<void> {
    await this.quizStateService.deleteById(id);
  }

  async saveStateForQuiz(
    state: QuizState,
    selectedQuiz: { id: string; title: string; date: string } | null,
  ): Promise<string | null> {
    if (selectedQuiz) {
      const savedId = await this.quizStateService.saveAsNew(
        {
          id: selectedQuiz.id,
          title: selectedQuiz.title,
          date: selectedQuiz.date,
        },
        state,
      );

      if (!savedId) {
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка сохранения',
          detail: 'Не удалось сохранить викторину.',
        });
        return null;
      }

      return savedId;
    }

    await this.quizStateService.save(state);
    return null;
  }

  async loadLegacyState(): Promise<QuizState | null> {
    return this.quizStateService.load();
  }

  async openCastingWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron) {
      await this.router.navigate([Pages.QUIZ_FEATURE, Pages.CASTING]);
      return;
    }

    await this.settingsSrv.init();
    const display = await firstValueFrom(this.settingsSrv.getDisplayForCasting());

    if (!display) {
      await this.router.navigate([Pages.QUIZ_FEATURE, Pages.CASTING]);
      return;
    }

    try {
      try {
        await this.windowSrv.electronContext.closeWindow({
          type: AppWindowTypes.CASTING,
        });
      } catch {
        // ignore
      }

      await this.windowSrv.electronContext.openWindow({
        ...DEFAULT_CASTING_PAGE_CONFIG,
        display,
        title: 'Quiz Casting',
      });

      await firstValueFrom(
        this.bridge.queueEvents.pipe(
          skip(1),
          filter(
            (event): event is { event: string; payload: unknown } =>
              !!event && event.event === APP_COMMON_ACTIONS.appInit,
          ),
        ),
      );

      await this.windowSrv.electronContext.send({
        event: APP_COMMON_ACTIONS.openPage,
        payload: { path: [Pages.QUIZ_FEATURE, Pages.CASTING] } as any,
      });
    } catch {
      await this.router.navigate([Pages.QUIZ_FEATURE, Pages.CASTING]);
      throw new Error('casting-open-failed');
    }
  }

  async closeCastingWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron) {
      return;
    }

    await this.windowSrv.electronContext.closeWindow({
      type: AppWindowTypes.CASTING,
    });
  }

  showStatsOnCasting(teams: { id: string; name: string; score: number }[]): void {
    this.bridge.send(
      'QUIZ_SHOW_STATS' as any,
      {
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          score: t.score,
        })),
      } as any,
    );
  }

  clearCastingScreen(): void {
    this.bridge.send('QUIZ_CLEAR_QUESTION' as any, {} as any);
  }
}
