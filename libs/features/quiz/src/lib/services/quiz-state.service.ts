import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QuizApiService } from '@lyri-cast/shared-browser/data-access/quiz';
import { QuizState, QuizSummary } from '../quiz.types';

@Injectable()
export class QuizStateService {
  private readonly api = inject(QuizApiService);

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
    state: QuizState
  ): Promise<string | null> {
    try {
      const result = await firstValueFrom(
        this.api.saveQuiz({
          id: meta.id,
          title: meta.title,
          date: meta.date,
          state: state as any,
        })
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
