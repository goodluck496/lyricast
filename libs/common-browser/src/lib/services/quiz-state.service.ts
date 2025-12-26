import { inject, Injectable } from '@angular/core';
import { WindowService } from './window.service';

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
}
