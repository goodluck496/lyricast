import { inject, Injectable } from '@angular/core';
import { WindowService } from '@lyri-cast/common-browser';

export type QuizTeamHistoryKind = 'correct' | 'wrong' | 'manual_bonus' | 'manual_penalty';

export interface QuizTeamHistoryEntry {
  id: string;
  timestamp: number;
  topicTitle: string;
  questionText: string;
  points: number;
  kind: QuizTeamHistoryKind;
}

export interface QuizTeamState {
  id: string;
  name: string;
  score: number;
  members: { id: string; name: string }[];
  history?: QuizTeamHistoryEntry[];
}

export interface QuizTopicQuestionState {
  id: string;
  text: string;
  answer: string;
  points: number;
  seconds: number;
}

export interface QuizTopicState {
  id: string;
  title: string;
  questions: QuizTopicQuestionState[];
}

export interface QuizState {
  teams: QuizTeamState[];
  topics: QuizTopicState[];
}

export interface QuizSummary {
  id: string;
  title: string;
  date?: string;
}

@Injectable({ providedIn: 'root' })
export class QuizStateService {
  private windowSrv = inject(WindowService);

  async load(): Promise<QuizState | null> {
    try {
      const raw = await this.windowSrv.electronContext.loadQuizState();
      if (!raw || typeof raw !== 'object') {
        return null;
      }
      const data = raw as any;
      if (!Array.isArray(data.teams) || !Array.isArray(data.topics)) {
        return null;
      }
      return {
        teams: data.teams,
        topics: data.topics,
      } as QuizState;
    } catch {
      return null;
    }
  }

  async save(state: QuizState): Promise<void> {
    try {
      await this.windowSrv.electronContext.saveQuizState(state);
    } catch {
      // ignore persistence errors
    }
  }

  // === Multi-quiz helpers ===

  async listQuizzes(): Promise<QuizSummary[]> {
    const ctx: any = this.windowSrv.electronContext as any;
    if (!ctx.listQuizzes) {
      return [];
    }
    try {
      const items = await ctx.listQuizzes();
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
    const ctx: any = this.windowSrv.electronContext as any;
    if (!ctx.loadQuizById) {
      return null;
    }
    try {
      const raw = await ctx.loadQuizById(id);
      if (!raw || typeof raw !== 'object') {
        return null;
      }
      const data = raw as any;
      if (!Array.isArray(data.teams) || !Array.isArray(data.topics)) {
        return null;
      }
      return {
        teams: data.teams,
        topics: data.topics,
      } as QuizState;
    } catch {
      return null;
    }
  }

  async saveAsNew(
    meta: { id?: string; title?: string; date?: string },
    state: QuizState,
  ): Promise<string | null> {
    const ctx: any = this.windowSrv.electronContext as any;
    if (!ctx.saveQuizAsNew) {
      return null;
    }
    try {
      const result = await ctx.saveQuizAsNew({
        id: meta.id,
        title: meta.title,
        date: meta.date,
        state,
      });

      // Обновляем "текущую" викторину для обратной совместимости
      if (ctx.saveQuizState) {
        await ctx.saveQuizState(state);
      }

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
    const ctx: any = this.windowSrv.electronContext as any;
    if (!ctx.deleteQuiz) {
      return;
    }
    try {
      await ctx.deleteQuiz(id);
    } catch {
      // ignore
    }
  }
}
