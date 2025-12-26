import { Injectable, computed, signal } from '@angular/core';
import { QuizState } from '@lyri-cast/quiz-feature';

export interface QuizTeam {
  id: string;
  name: string;
  score: number;
  members: { id: string; name: string }[];
  history?: any[]; // Типизируем строже при необходимости
}

export interface QuizQuestion {
  id: string;
  text: string;
  answer: string;
  points: number;
  seconds: number;
  solved?: boolean;
  burned?: boolean;
  type?: 'normal' | 'penalty' | 'bonus';
  penaltyMode?: 'subtract' | 'skip';
}

export interface QuizTopic {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

@Injectable({ providedIn: 'root' })
export class QuizGameService {
  // === State Signals ===
  readonly teams = signal<QuizTeam[]>([]);
  readonly topics = signal<QuizTopic[]>([]);

  readonly selectedTeamId = signal<string | null>(null);
  readonly activeTopicId = signal<string | null>(null);
  readonly activeQuestionId = signal<string | null>(null);

  readonly isCastingActive = signal(false);

  // === Computed ===
  readonly teamsSortedByScore = computed(() =>
    [...this.teams()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  );

  readonly maxTeamScore = computed(() =>
    this.teams().reduce((max, t) => Math.max(max, t.score), 0)
  );

  readonly canAnswer = computed(() => {
    const tId = this.selectedTeamId();
    const topId = this.activeTopicId();
    const qId = this.activeQuestionId();

    if (!tId || !topId || !qId) return false;

    const topic = this.topics().find((t) => t.id === topId);
    const question = topic?.questions.find((q) => q.id === qId);

    return !!question && !question.solved; // Можно добавить проверку на burned, если нужно
  });

  // === Actions ===

  setState(state: QuizState) {
    // Мапим стейт из БД/файла в стейт игры
    // Приводим типы, если они отличаются
    this.teams.set(
      (state.teams || []).map((t: any) => ({
        ...t,
        score: t.score ?? 0,
        members: t.members ?? [],
      }))
    );
    this.topics.set(
      (state.topics || []).map((t: any) => ({
        ...t,
        questions: (t.questions || []).map((q: any) => ({
          ...q,
          points: q.points ?? 0,
          seconds: q.seconds ?? 30,
        })),
      }))
    );
    // Сбрасываем выбор
    this.selectedTeamId.set(null);
    this.activeTopicId.set(null);
    this.activeQuestionId.set(null);
  }

  getState(): QuizState {
    return {
      teams: this.teams(),
      topics: this.topics(),
    };
  }

  // --- Teams ---
  addTeam(name: string) {
    const newTeam: QuizTeam = {
      id: this.generateId('team'),
      name,
      score: 0,
      members: [],
    };
    this.teams.update((teams) => [...teams, newTeam]);
  }

  removeTeam(teamId: string) {
    this.teams.update((teams) => teams.filter((t) => t.id !== teamId));
    if (this.selectedTeamId() === teamId) {
      this.selectedTeamId.set(null);
    }
  }

  updateTeamName(teamId: string, name: string) {
    this.teams.update((teams) =>
      teams.map((t) => (t.id === teamId ? { ...t, name } : t))
    );
  }

  updateTeamScore(teamId: string, delta: number) {
    this.teams.update((teams) =>
      teams.map((t) => (t.id === teamId ? { ...t, score: t.score + delta } : t))
    );
  }

  setSelectedTeamId(id: string | null) {
    this.selectedTeamId.set(id);
  }

  // --- Members ---
  addMember(teamId: string, name: string) {
    if (!name.trim()) return;
    this.teams.update((teams) =>
      teams.map((t) =>
        t.id === teamId
          ? {
              ...t,
              members: [
                ...t.members,
                { id: this.generateId('member'), name: name.trim() },
              ],
            }
          : t
      )
    );
  }

  removeMember(teamId: string, memberId: string) {
    this.teams.update((teams) =>
      teams.map((t) =>
        t.id === teamId
          ? { ...t, members: t.members.filter((m) => m.id !== memberId) }
          : t
      )
    );
  }

  // --- Topics ---
  addTopic(title: string) {
    const newTopic: QuizTopic = {
      id: this.generateId('topic'),
      title,
      questions: [],
    };
    this.topics.update((topics) => [...topics, newTopic]);
  }

  removeTopic(topicId: string) {
    this.topics.update((topics) => topics.filter((t) => t.id !== topicId));
  }

  updateTopicTitle(topicId: string, title: string) {
    this.topics.update((topics) =>
      topics.map((t) => (t.id === topicId ? { ...t, title } : t))
    );
  }

  // --- Questions ---
  addQuestion(topicId: string, draft: Partial<QuizQuestion>) {
    this.topics.update((topics) =>
      topics.map((t) => {
        if (t.id !== topicId) return t;
        if (t.questions.length >= 5) return t;

        const newQ: QuizQuestion = {
          id: this.generateId('question'),
          text: draft.text || '',
          answer: draft.answer || '',
          points: draft.points ?? 0,
          seconds: draft.seconds ?? 30,
          solved: false,
          type: draft.type || 'normal',
          penaltyMode: draft.penaltyMode,
        };
        return { ...t, questions: [...t.questions, newQ] };
      })
    );
  }

  removeQuestion(topicId: string, questionId: string) {
    this.topics.update((topics) =>
      topics.map((t) =>
        t.id === topicId
          ? { ...t, questions: t.questions.filter((q) => q.id !== questionId) }
          : t
      )
    );
  }

  updateQuestion(
    topicId: string,
    questionId: string,
    changes: Partial<QuizQuestion>
  ) {
    this.topics.update((topics) =>
      topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              questions: t.questions.map((q) =>
                q.id === questionId ? { ...q, ...changes } : q
              ),
            }
          : t
      )
    );
  }

  setActiveQuestion(topicId: string | null, questionId: string | null) {
    this.activeTopicId.set(topicId);
    this.activeQuestionId.set(questionId);
  }

  setCastingActive(active: boolean) {
    this.isCastingActive.set(active);
  }

  resetStatistics() {
    this.teams.update((teams) =>
      teams.map((t) => ({ ...t, score: 0, history: [] }))
    );
    this.topics.update((topics) =>
      topics.map((t) => ({
        ...t,
        questions: t.questions.map((q) => ({
          ...q,
          solved: false,
          burned: false,
        })),
      }))
    );
  }

  // --- Utils ---
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
