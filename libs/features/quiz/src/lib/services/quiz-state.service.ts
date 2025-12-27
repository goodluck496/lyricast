import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QuizApiService } from '@lyri-cast/shared-browser/data-access/quiz';
import { QuizState, QuizSummary } from '../quiz.types';

@Injectable({ providedIn: 'root' })
export class QuizStateService {
  private readonly api = inject(QuizApiService);

  async load(): Promise<QuizState | null> {
    // В новой архитектуре "текущая" викторина определяется на клиенте.
    // Этот метод можно использовать как обёртку над загрузкой выбранного quizId,
    // но пока оставляем заглушкой, чтобы не ломать существующие вызовы.
    return null;
  }

  async save(_state: QuizState): Promise<void> {
    // Сохранение конкретного квиза теперь делается через saveAsNew с явным meta.id
    // Этот метод оставлен для совместимости и сейчас ничего не делает.
    return;
  }

  // === Multi-quiz helpers ===

  async listQuizzes(): Promise<QuizSummary[]> {
    try {
      const items = await firstValueFrom(this.api.getQuizList());
      if (!Array.isArray(items)) {
        return [];
      }
      return items as QuizSummary[];
    } catch {
      return [];
    }
  }

  async loadById(id: string): Promise<QuizState | null> {
    if (!id) {
      return null;
    }

    try {
      const dto = await firstValueFrom(this.api.getQuiz(id));
      if (!dto || typeof dto !== 'object' || !dto.state) {
        return null;
      }

      const state = dto.state as any;
      if (!Array.isArray(state.teams) || !Array.isArray(state.topics)) {
        return null;
      }

      return {
        teams: state.teams,
        topics: state.topics,
      } as QuizState;
    } catch {
      return null;
    }
  }

  async saveAsNew(
    meta: { id?: string; title?: string; date?: string },
    state: QuizState,
  ): Promise<string | null> {
    try {
      const result = await firstValueFrom(
        this.api.saveQuiz({
          id: meta.id,
          title: meta.title,
          date: meta.date,
          state: state as any,
        }),
      );

      const id = (result && result.id) as string | undefined;
      return id || null;
    } catch {
      return null;
    }
  }

  async deleteById(id: string): Promise<void> {
    if (!id) {
      return;
    }

    try {
      await firstValueFrom(this.api.deleteQuiz(id));
    } catch {
      // ignore
    }
  }
}
