import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccordionModule } from 'primeng/accordion';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonDirective } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { BridgeService } from '@lyri-cast/common-browser';
import { QuizGameService } from '../../services/quiz-game.service';
import { QuizQuestionEditorComponent } from '../quiz-question-editor/quiz-question-editor.component';

@Component({
  selector: 'lyri-quiz-topics-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AccordionModule,
    InputTextModule,
    InputNumberModule,
    ButtonDirective,
    DividerModule,
    TooltipModule,
    QuizQuestionEditorComponent,
  ],
  templateUrl: './quiz-topics-panel.component.html',
  styleUrl: './quiz-topics-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizTopicsPanelComponent {
  private readonly game = inject(QuizGameService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly bridge = inject(BridgeService);

  newTopicTitle = '';
  newQuestionDraftByTopicId = new Map<
    string,
    {
      text: string;
      answer: string;
      points: number | null;
      seconds: number | null;
    }
  >();
  private newQuestionFormOpenByTopicId = new Map<string, boolean>();
  openedTopicIds: string[] = [];

  readonly questionTypeOptions: {
    label: string;
    value: 'normal' | 'penalty' | 'bonus';
  }[] = [
    { label: 'Обычный', value: 'normal' },
    { label: 'Штраф', value: 'penalty' },
    { label: 'Бонус', value: 'bonus' },
  ];

  readonly penaltyModeOptions: { label: string; value: 'subtract' | 'skip' }[] = [
    { label: 'Вычитать баллы', value: 'subtract' },
    { label: 'Пропускать ход', value: 'skip' },
  ];

  get topics() {
    return this.game.topics();
  }

  get selectedTeamId(): string | null {
    return this.game.selectedTeamId();
  }

  get teams() {
    return this.game.teams();
  }

  addTopic(): void {
    const title = this.newTopicTitle?.trim() || `Тема ${this.topics.length + 1}`;
    this.game.addTopic(title);
    this.newTopicTitle = '';
  }

  private removeTopic(topicId: string): void {
    this.game.removeTopic(topicId);
    this.newQuestionDraftByTopicId.delete(topicId);
  }

  confirmRemoveTopic(event: Event, topicId: string): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: 'Удалить тему и все её вопросы? Это действие нельзя отменить.',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-text p-button-sm',
      accept: () => this.removeTopic(topicId),
    });
  }

  updateTopicTitle(topicId: string, title: string): void {
    this.game.updateTopicTitle(topicId, title.trim() || title);
  }

  addQuestion(topicId: string): void {
    const draft =
      this.newQuestionDraftByTopicId.get(topicId) ||
      ({ text: '', answer: '', points: null, seconds: null } as const);

    const text = draft.text.trim();
    if (!text) {
      return;
    }

    const points = draft.points ?? 0;
    const seconds = draft.seconds ?? 30;

    this.game.addQuestion(topicId, {
      text,
      answer: draft.answer.trim(),
      points,
      seconds,
    });

    this.newQuestionDraftByTopicId.set(topicId, {
      text: '',
      answer: '',
      points: null,
      seconds: null,
    });
    this.newQuestionFormOpenByTopicId.set(topicId, false);
  }

  removeQuestion(topicId: string, questionId: string): void {
    this.game.removeQuestion(topicId, questionId);
  }

  confirmRemoveQuestion(event: Event, topicId: string, questionId: string): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: 'Удалить вопрос? Это действие нельзя отменить.',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-text p-button-sm',
      accept: () => this.removeQuestion(topicId, questionId),
    });
  }

  updateQuestionField(
    topicId: string,
    questionId: string,
    field:
      | 'text'
      | 'answer'
      | 'points'
      | 'seconds'
      | 'type'
      | 'penaltyMode'
      | 'solved',
    value: string | number | boolean | null,
  ): void {
    const topics = this.topics;
    const topic = topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    if (!topic || !question) {
      return;
    }

    const changes: any = {};

    if (field === 'points' || field === 'seconds') {
      changes[field] = typeof value === 'number' ? value : Number(value ?? 0);
    } else if (field === 'type') {
      const allowed: Array<'normal' | 'penalty' | 'bonus'> = [
        'normal',
        'penalty',
        'bonus',
      ];
      const v = String(value ?? 'normal') as any;
      const nextType: 'normal' | 'penalty' | 'bonus' = allowed.includes(v)
        ? v
        : 'normal';

      changes.type = nextType;
      changes.penaltyMode =
        nextType === 'penalty' ? question.penaltyMode ?? 'subtract' : undefined;
    } else if (field === 'penaltyMode') {
      const allowed: Array<'subtract' | 'skip'> = ['subtract', 'skip'];
      const v = String(value ?? 'subtract') as any;
      const nextMode: 'subtract' | 'skip' = allowed.includes(v)
        ? v
        : 'subtract';
      changes.penaltyMode = nextMode;
    } else if (field === 'solved') {
      const bool = value === true || value === 'true';
      changes.solved = bool;
    } else {
      changes[field] = String(value ?? '');
    }

    this.game.updateQuestion(topicId, questionId, changes);
  }

  getQuestionDraft(topicId: string) {
    if (!this.newQuestionDraftByTopicId.has(topicId)) {
      this.newQuestionDraftByTopicId.set(topicId, {
        text: '',
        answer: '',
        points: null,
        seconds: null,
      });
    }
    return this.newQuestionDraftByTopicId.get(topicId)!;
  }

  isNewQuestionFormOpen(topicId: string): boolean {
    return this.newQuestionFormOpenByTopicId.get(topicId) === true;
  }

  onNewQuestionButtonClick(topicId: string): void {
    const isOpen = this.isNewQuestionFormOpen(topicId);
    if (!isOpen) {
      this.getQuestionDraft(topicId);
      this.newQuestionFormOpenByTopicId.set(topicId, true);
      return;
    }

    this.addQuestion(topicId);
  }

  // ===== Question actions (casting-related) =====

  onShowQuestion(topicId: string, questionId: string): void {
    if (!this.selectedTeamId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Команда не выбрана',
        detail: 'Сначала выберите команду для текущего вопроса.',
      });
      return;
    }

    const topic = this.topics.find((t) => t.id === topicId);
    if (!topic) {
      return;
    }

    const question = topic.questions.find((q) => q.id === questionId);
    if (!question) {
      return;
    }

    this.game.setActiveQuestion(topicId, questionId);

    const team = this.teams.find((t) => t.id === this.selectedTeamId) ?? null;
    const type = question.type ?? 'normal';

    this.bridge.send(
      'QUIZ_SHOW_QUESTION' as any,
      {
        topicTitle: topic.title,
        question: {
          id: question.id,
          text: question.text,
          answer: question.answer,
          points: question.points,
          seconds: question.seconds,
        },
        type,
        team: team ? { id: team.id, name: team.name, score: team.score } : null,
      } as any,
    );

    if (type === 'penalty') {
      this.game.answerWrong();
    } else if (type === 'bonus') {
      this.game.answerCorrect();
    }
  }

  onShowAnswer(topicId: string, questionId: string): void {
    if (!this.selectedTeamId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Команда не выбрана',
        detail: 'Сначала выберите команду для текущего вопроса.',
      });
      return;
    }

    const topic = this.topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    if (!topic || !question) {
      return;
    }

    const team = this.teams.find((t) => t.id === this.selectedTeamId) ?? null;

    this.bridge.send(
      'QUIZ_SHOW_ANSWER' as any,
      {
        topicTitle: topic.title,
        answer: question.answer,
        team: team ? { id: team.id, name: team.name, score: team.score } : null,
      } as any,
    );
  }

  onToggleLock(topicId: string, questionId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    if (!topic || !question) {
      return;
    }

    const newBurned = !question.burned;
    this.game.updateQuestion(topic.id, question.id, { burned: newBurned });

    if (newBurned) {
      this.bridge.send(
        'QUIZ_ANSWER_WRONG' as any,
        {
          teamId: this.selectedTeamId,
          topicId,
          questionId,
        } as any,
      );
    } else {
      this.bridge.send(
        'QUIZ_UNLOCK_QUESTION' as any,
        {
          topicId,
          questionId,
        } as any,
      );
    }
  }

  onToggleSolved(topicId: string, questionId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    if (!topic || !question) {
      return;
    }

    const newSolved = !question.solved;
    this.game.updateQuestion(topic.id, question.id, { solved: newSolved });
  }
}
