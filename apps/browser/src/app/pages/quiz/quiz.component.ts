import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SplitterModule } from 'primeng/splitter';
import { AccordionModule } from 'primeng/accordion';
import { FormsModule } from '@angular/forms';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { PAGE_CONTAINER_TEMPLATES, Pages, WindowService, DEFAULT_CASTING_PAGE_CONFIG, SettingsService, BridgeService } from '@lyri-cast/common-browser';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonDirective } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FloatLabelModule } from 'primeng/floatlabel';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { ContextMenuModule, ContextMenu } from 'primeng/contextmenu';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Toast, ToastModule } from 'primeng/toast';
import { QuizState, QuizStateService } from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, skip } from 'rxjs/operators';
import { Textarea } from 'primeng/textarea';
import { MenuItem, MessageService } from 'primeng/api';

@Component({
  selector: 'lyri-quiz-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SplitterModule,
    AccordionModule,
    PageContainerComponent,
    InputTextModule,
    InputNumberModule,
    ButtonDirective,
    SelectModule,
    SelectButtonModule,
    FloatLabelModule,
    CheckboxModule,
    TooltipModule,
    Textarea,
    ContextMenuModule,
    ProgressSpinnerModule,
    Toast,
  ],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
})
export class QuizComponent implements OnInit {
  // левая часть: команды и участники
  teams: {
    id: string;
    name: string;
    score: number;
    members: { id: string; name: string }[];
  }[] = [];

  newTeamName = '';
  newMemberNameByTeamId = new Map<string, string>();
  selectedTeamId: string | null = null;
  // ручная корректировка очков по командам (бонус/штраф)
  manualDeltaByTeamId = new Map<string, number | null>();

  isLoading = true;

  // Текущий показываемый на экране вопрос
  // Делается публичным, чтобы использовать в шаблоне нижней таблицы
  activeTopicId: string | null = null;
  activeQuestionId: string | null = null;

  // Открытые панели аккордеона с темами (для программного разворота при скролле к вопросу)
  openedTopicIds: string[] = [];

  isCastingActive = false;

  // правая часть: тематики и вопросы
  topics: {
    id: string;
    title: string;
    questions: {
      id: string;
      text: string;
      answer: string;
      points: number;
      seconds: number;
      solved?: boolean;
      burned?: boolean;
      type?: 'normal' | 'penalty' | 'bonus';
      penaltyMode?: 'subtract' | 'skip';
    }[];
  }[] = [];

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

  // варианты типов вопросов и режимов штрафа
  readonly questionTypeOptions: { label: string; value: 'normal' | 'penalty' | 'bonus' }[] = [
    { label: 'Обычный', value: 'normal' },
    { label: 'Штраф', value: 'penalty' },
    { label: 'Бонус', value: 'bonus' },
  ];

  readonly penaltyModeOptions: { label: string; value: 'subtract' | 'skip' }[] = [
    { label: 'Вычитать баллы', value: 'subtract' },
    { label: 'Пропускать ход', value: 'skip' },
  ];

  private withContextQuestion(
    handler: (topicId: string, questionId: string) => void
  ): void {
    if (!this.contextTopicId || !this.contextQuestionId) {
      return;
    }
    handler(this.contextTopicId, this.contextQuestionId);
  }

  onPointsCellContextMenu(
    event: MouseEvent,
    topicId: string,
    questionId: string
  ): void {
    event.preventDefault();
    this.contextTopicId = topicId;
    this.contextQuestionId = questionId;

    // дизейблим пункты "Верно" / "Неверно" для уже отвеченных или сгоревших вопросов
    const topic = this.topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    const answered = !!question && (question.solved || question.burned);
    if (this.quizTableMenuItems[1]) {
      this.quizTableMenuItems[1].disabled = answered;
    }
    if (this.quizTableMenuItems[2]) {
      this.quizTableMenuItems[2].disabled = answered;
    }

    this.quizTableCm?.show(event);
  }

  private triggerShowQuestionFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      this.showQuestionOnCasting(topicId, questionId);
    });
  }

  private triggerMarkCorrectFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      this.activeTopicId = topicId;
      this.activeQuestionId = questionId;
      this.answerCorrect();
    });
  }

  private triggerMarkWrongFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      this.activeTopicId = topicId;
      this.activeQuestionId = questionId;
      this.answerWrong();
    });
  }

  private triggerScrollToQuestionFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      // при переходе к вопросу с нижней таблицы также подсвечиваем его как активный
      this.activeTopicId = topicId;
      this.activeQuestionId = questionId;
      this.scrollToQuestion(topicId, questionId);
    });
  }

  private triggerShowAnswerFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      this.showAnswerOnCasting(topicId, questionId);
    });
  }

  private scrollToQuestion(topicId: string, questionId: string): void {
    // раскрываем панель аккордеона с нужной темой, если она была свернута
    if (!this.openedTopicIds.includes(topicId)) {
      this.openedTopicIds = [...this.openedTopicIds, topicId];
    }

    // ждём, пока Angular/PrimeNG дорендерят содержимое панели, затем скроллим к элементу
    const maxAttempts = 10;
    let attempts = 0;

    const tryScroll = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-question-id="${questionId}"]`
      );

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('quiz-question--highlight');
        setTimeout(() => {
          el.classList.remove('quiz-question--highlight');
        }, 1500);
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryScroll, 50);
      }
    };

    setTimeout(tryScroll, 0);
  }

  protected readonly Pages = Pages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;

  private readonly quizStateService = inject(QuizStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly windowSrv = inject(WindowService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly bridge = inject(BridgeService);
  private readonly messageService = inject(MessageService);

  // Контекстное меню для нижней таблицы вопросов
  quizTableMenuItems: MenuItem[] = [];
  private contextTopicId: string | null = null;
  private contextQuestionId: string | null = null;
  @ViewChild('quizTableCm') private quizTableCm?: ContextMenu;

  get canAnswer(): boolean {
    if (!this.selectedTeamId || !this.activeTopicId || !this.activeQuestionId) {
      return false;
    }

    const topic = this.topics.find((t) => t.id === this.activeTopicId);
    const question = topic?.questions.find(
      (q) => q.id === this.activeQuestionId
    );

    return !!question && !question.solved;
  }

  get maxTeamScore(): number {
    if (!this.teams || this.teams.length === 0) {
      return 0;
    }
    return Math.max(...this.teams.map((t) => t.score ?? 0));
  }

  async ngOnInit(): Promise<void> {
    const state = await this.quizStateService.load();
    if (state) {
      this.applyState(state);
    }
    this.isLoading = false;
    this.cdr.markForCheck();

    this.quizTableMenuItems = [
      {
        label: 'Показать на экране',
        icon: 'pi pi-desktop',
        command: () => this.triggerShowQuestionFromContext(),
      },
      {
        label: 'Верно',
        icon: 'pi pi-check',
        command: () => this.triggerMarkCorrectFromContext(),
      },
      {
        label: 'Неверно',
        icon: 'pi pi-times',
        command: () => this.triggerMarkWrongFromContext(),
      },
      {
        label: 'Показать ответ',
        icon: 'pi pi-comment',
        command: () => this.triggerShowAnswerFromContext(),
      },
      {
        label: 'К вопросу',
        icon: 'pi pi-arrow-down',
        command: () => this.triggerScrollToQuestionFromContext(),
      },
    ];
  }

  showStatsOnCasting(): void {
    // Показываем на экране таблицу результатов команд
    this.bridge.send(
      'QUIZ_SHOW_STATS' as any,
      {
        teams: this.teams.map((t) => ({
          id: t.id,
          name: t.name,
          score: t.score,
        })),
      } as any
    );
  }

  // ===== Casting interaction =====

  showQuestionOnCasting(topicId: string, questionId: string): void {
    // Нельзя показывать вопрос без выбранной команды
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

    // Запоминаем текущий вопрос как активный для дальнейшей обработки (верно/неверно)
    this.activeTopicId = topicId;
    this.activeQuestionId = questionId;

    const team = this.teams.find((t) => t.id === this.selectedTeamId) ?? null;

    // Пока без ngrx: напрямую шлём данные текущего вопроса в кастинг-окно
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
        type: question.type ?? 'normal',
        team: team ? { id: team.id, name: team.name, score: team.score } : null,
      } as any
    );
  }

  showAnswerOnCasting(topicId: string, questionId: string): void {
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
      } as any
    );
  }

  answerCorrect(): void {
    if (!this.selectedTeamId || !this.activeTopicId || !this.activeQuestionId) {
      return;
    }

    const topic = this.topics.find((t) => t.id === this.activeTopicId);
    const question = topic?.questions.find(
      (q) => q.id === this.activeQuestionId
    );
    const team = this.teams.find((t) => t.id === this.selectedTeamId);

    if (!topic || !question || !team || question.solved) {
      return;
    }

    const basePoints = question.points ?? 0;
    if (basePoints === 0) {
      return;
    }

    const type = question.type ?? 'normal';
    const penaltyMode = question.penaltyMode ?? 'subtract';

    let delta = 0;

    if (type === 'normal') {
      delta = basePoints;
    } else if (type === 'penalty') {
      // для штрафного вопроса при "Верно" применяем ту же механику, что и для "Неверно":
      // либо вычитаем баллы, либо просто фиксируем пропуск хода без изменения счёта
      if (penaltyMode === 'subtract') {
        delta = -basePoints;
      } else {
        delta = 0;
      }
    } else if (type === 'bonus') {
      // бонусный вопрос всегда добавляет очки
      delta = basePoints;
    }

    if (delta === 0 && type !== 'penalty') {
      // для обычных и бонусных вопросов нулевой delta не имеет смысла
      return;
    }

    if (delta !== 0) {
      this.teams = this.teams.map((t) =>
        t.id === team.id ? { ...t, score: t.score + delta } : t
      );
    }

    // История: фиксируем верный ответ (в том числе бонусный/штрафной)
    this.appendTeamHistoryEntry(team.id, {
      kind: 'correct',
      topicTitle: topic.title,
      questionText: question.text,
      points: delta,
    });

    // Помечаем вопрос как решённый в локальном состоянии викторины
    this.topics = this.topics.map((t) =>
      t.id === topic.id
        ? {
            ...t,
            questions: t.questions.map((q) =>
              q.id === question.id ? { ...q, solved: true } : q
            ),
          }
        : t
    );
    this.cdr.markForCheck();

    // Сообщаем кастинг-окну о верном ответе
    this.bridge.send(
      'QUIZ_ANSWER_CORRECT' as any,
      {
        teamId: team.id,
        topicId: topic.id,
        questionId: question.id,
        delta,
        type,
      } as any
    );
  }

  answerWrong(): void {
    // Пока без изменения счёта, только заглушка под будущую логику передачи очков
    if (!this.selectedTeamId || !this.activeTopicId || !this.activeQuestionId) {
      return;
    }

    const topic = this.topics.find((t) => t.id === this.activeTopicId);
    const question = topic?.questions.find(
      (q) => q.id === this.activeQuestionId
    );
    if (!topic || !question || question.solved || question.burned) {
      return;
    }

    const type = question.type ?? 'normal';
    const penaltyMode = question.penaltyMode ?? 'subtract';

    // для бонусного вопроса кнопка "Неверно" должна быть заблокирована в UI,
    // но на всякий случай здесь тоже ничего не делаем
    if (type === 'bonus') {
      return;
    }

    // помечаем вопрос как "сгоревший" (заблокированным)
    const targetTopicId = topic.id;

    this.topics = this.topics.map((t) =>
      t.id === targetTopicId
        ? {
            ...t,
            questions: t.questions.map((q) =>
              q.id === question.id ? { ...q, burned: true } : q
            ),
          }
        : t
    );

    // для штрафных вопросов при неверном ответе применяем ту же механику, что и при верном
    let delta = 0;
    const basePoints = question.points ?? 0;

    if (type === 'normal') {
      // пока без изменения счёта
      delta = 0;
    } else if (type === 'penalty') {
      if (penaltyMode === 'subtract') {
        delta = -basePoints;
      } else {
        delta = 0;
      }
    }

    if (delta !== 0 && this.selectedTeamId) {
      this.teams = this.teams.map((t) =>
        t.id === this.selectedTeamId ? { ...t, score: t.score + delta } : t
      );
    }

    // История: фиксируем неверный ответ / сгорание вопроса
    if (this.selectedTeamId) {
      this.appendTeamHistoryEntry(this.selectedTeamId, {
        kind: 'wrong',
        topicTitle: topic.title,
        questionText: question.text,
        points: delta,
      });
    }

    this.bridge.send(
      'QUIZ_ANSWER_WRONG' as any,
      {
        teamId: this.selectedTeamId,
        topicId: this.activeTopicId,
        questionId: this.activeQuestionId,
        delta,
        type,
      } as any
    );
    this.cdr.markForCheck();
  }

  private appendTeamHistoryEntry(
    teamId: string,
    entry: { kind: 'correct' | 'wrong' | 'manual_bonus' | 'manual_penalty'; topicTitle: string; questionText: string; points: number }
  ): void {
    this.teams = this.teams.map((t) => {
      if (t.id !== teamId) {
        return t;
      }

      const history = Array.isArray((t as any).history)
        ? ([...(t as any).history] as any[])
        : [];

      const fullEntry = {
        id: this.generateId('history'),
        timestamp: Date.now(),
        topicTitle: entry.topicTitle,
        questionText: entry.questionText,
        points: entry.points,
        kind: entry.kind,
      } as any;

      return {
        ...t,
        history: [...history, fullEntry],
      } as any;
    });
  }

  toggleQuestionLock(topicId: string, questionId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    if (!topic || !question) {
      return;
    }

    const newBurned = !question.burned;

    const targetTopicId = topic.id;

    this.topics = this.topics.map((t) =>
      t.id === targetTopicId
        ? {
            ...t,
            questions: t.questions.map((q) =>
              q.id === question.id ? { ...q, burned: newBurned } : q
            ),
          }
        : t
    );

    if (newBurned) {
      // при ручной блокировке шлём такое же событие, как при неверном ответе
      this.bridge.send(
        'QUIZ_ANSWER_WRONG' as any,
        {
          teamId: this.selectedTeamId,
          topicId,
          questionId,
        } as any
      );
    } else {
      // разблокировка вопроса
      this.bridge.send(
        'QUIZ_UNLOCK_QUESTION' as any,
        {
          topicId,
          questionId,
        } as any
      );
    }

    this.cdr.markForCheck();
  }

  // ==== Teams ====
  addTeam() {
    const name = this.newTeamName?.trim() || `Команда ${this.teams.length + 1}`;
    this.teams = [
      ...this.teams,
      {
        id: this.generateId('team'),
        name,
        score: 0,
        members: [],
      },
    ];
    this.newTeamName = '';
  }

  removeTeam(teamId: string) {
    this.teams = this.teams.filter((t) => t.id !== teamId);
    this.newMemberNameByTeamId.delete(teamId);
  }

  updateTeamName(teamId: string, name: string) {
    this.teams = this.teams.map((t) =>
      t.id === teamId ? { ...t, name: name.trim() || t.name } : t
    );
  }

  addMember(teamId: string) {
    const draft = (this.newMemberNameByTeamId.get(teamId) || '').trim();
    if (!draft) {
      return;
    }
    this.teams = this.teams.map((t) =>
      t.id === teamId
        ? {
            ...t,
            members: [
              ...t.members,
              { id: this.generateId('member'), name: draft },
            ],
          }
        : t
    );
    this.newMemberNameByTeamId.set(teamId, '');
  }

  removeMember(teamId: string, memberId: string) {
    this.teams = this.teams.map((t) =>
      t.id === teamId
        ? {
            ...t,
            members: t.members.filter((m) => m.id !== memberId),
          }
        : t
    );
  }

  // ==== Topics ====
  addTopic() {
    const title =
      this.newTopicTitle?.trim() || `Тема ${this.topics.length + 1}`;
    this.topics = [
      ...this.topics,
      {
        id: this.generateId('topic'),
        title,
        questions: [],
      },
    ];
    this.newTopicTitle = '';
  }

  removeTopic(topicId: string) {
    this.topics = this.topics.filter((t) => t.id !== topicId);
    this.newQuestionDraftByTopicId.delete(topicId);
  }

  updateTopicTitle(topicId: string, title: string) {
    this.topics = this.topics.map((t) =>
      t.id === topicId ? { ...t, title: title.trim() || t.title } : t
    );
  }

  addQuestion(topicId: string) {
    const draft =
      this.newQuestionDraftByTopicId.get(topicId) ||
      ({ text: '', answer: '', points: null, seconds: null } as const);

    const text = draft.text.trim();
    if (!text) {
      return;
    }

    const points = draft.points ?? 0;
    const seconds = draft.seconds ?? 30;

    this.topics = this.topics.map((topic) => {
      if (topic.id !== topicId) {
        return topic;
      }

      if (topic.questions.length >= 5) {
        return topic;
      }

      return {
        ...topic,
        questions: [
          ...topic.questions,
          {
            id: this.generateId('question'),
            text,
            answer: draft.answer.trim(),
            points,
            seconds,
            solved: false,
          },
        ],
      };
    });

    this.newQuestionDraftByTopicId.set(topicId, {
      text: '',
      answer: '',
      points: null,
      seconds: null,
    });
  }

  removeQuestion(topicId: string, questionId: string) {
    this.topics = this.topics.map((topic) =>
      topic.id === topicId
        ? {
            ...topic,
            questions: topic.questions.filter((q) => q.id !== questionId),
          }
        : topic
    );
  }

  updateQuestionField(
    topicId: string,
    questionId: string,
    field: 'text' | 'answer' | 'points' | 'seconds' | 'type' | 'penaltyMode' | 'solved',
    value: string | number | boolean | null
  ) {
    this.topics = this.topics.map((topic) => {
      if (topic.id !== topicId) {
        return topic;
      }

      return {
        ...topic,
        questions: topic.questions.map((q) => {
          if (q.id !== questionId) {
            return q;
          }
          if (field === 'points' || field === 'seconds') {
            const num = typeof value === 'number' ? value : Number(value ?? 0);
            return { ...q, [field]: num } as typeof q;
          }

          if (field === 'type') {
            const allowed: Array<'normal' | 'penalty' | 'bonus'> = [
              'normal',
              'penalty',
              'bonus',
            ];
            const v = String(value ?? 'normal') as any;
            const nextType: 'normal' | 'penalty' | 'bonus' = allowed.includes(v)
              ? v
              : 'normal';

            // при смене типа сбрасываем режим штрафа к значению по умолчанию
            return {
              ...q,
              type: nextType,
              penaltyMode: nextType === 'penalty' ? (q.penaltyMode ?? 'subtract') : undefined,
            } as typeof q;
          }

          if (field === 'penaltyMode') {
            const allowed: Array<'subtract' | 'skip'> = ['subtract', 'skip'];
            const v = String(value ?? 'subtract') as any;
            const nextMode: 'subtract' | 'skip' = allowed.includes(v)
              ? v
              : 'subtract';
            return { ...q, penaltyMode: nextMode } as typeof q;
          }
          if (field === 'solved') {
            const bool = value === true || value === 'true';
            return { ...q, solved: bool } as typeof q;
          }
          return { ...q, [field]: String(value ?? '') } as typeof q;
        }),
      };
    });
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

  private generateId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  getState(): QuizState {
    return {
      teams: this.teams,
      topics: this.topics,
    } satisfies QuizState;
  }

  applyState(state: QuizState) {
    this.teams = Array.isArray(state.teams) ? state.teams : [];
    this.topics = Array.isArray(state.topics) ? state.topics : [];
    this.cdr.markForCheck();
  }

  async saveState(): Promise<void> {
    await this.quizStateService.save(this.getState());
  }

  async reloadState(): Promise<void> {
    const state = await this.quizStateService.load();
    if (state) {
      this.applyState(state);
    }
  }

  resetStatistics(): void {
    // Обнуляем счёт и историю команд, но сохраняем сами команды и вопросы
    this.teams = this.teams.map((t) => ({
      ...t,
      score: 0,
      history: [],
    } as any));

    // Сбрасываем флаги solved/burned у всех вопросов
    this.topics = this.topics.map((topic) => ({
      ...topic,
      questions: topic.questions.map((q) => ({
        ...q,
        solved: false,
        burned: false,
      })),
    }));

    // Сбрасываем выбор и временные значения
    this.selectedTeamId = null;
    this.activeTopicId = null;
    this.activeQuestionId = null;
    this.manualDeltaByTeamId.clear();

    this.cdr.markForCheck();
  }

  applyManualBonus(teamId: string): void {
    this.applyManualDelta(teamId, 'manual_bonus');
  }

  applyManualPenalty(teamId: string): void {
    this.applyManualDelta(teamId, 'manual_penalty');
  }

  private applyManualDelta(
    teamId: string,
    kind: 'manual_bonus' | 'manual_penalty'
  ): void {
    const raw = this.manualDeltaByTeamId.get(teamId);
    const delta = typeof raw === 'number' ? raw : Number(raw ?? 0);
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    const team = this.teams.find((t) => t.id === teamId);
    if (!team) {
      return;
    }

    const signedDelta = kind === 'manual_bonus' ? Math.abs(delta) : -Math.abs(delta);

    this.teams = this.teams.map((t) =>
      t.id === teamId ? { ...t, score: t.score + signedDelta } : t
    );

    // История: фиксируем ручную корректировку счёта
    this.appendTeamHistoryEntry(teamId, {
      kind,
      topicTitle: 'Ручная корректировка',
      questionText: '',
      points: signedDelta,
    });

    // сбрасываем ввод
    this.manualDeltaByTeamId.set(teamId, null);
  }

  async startQuizCasting(): Promise<void> {
    if (this.isCastingActive) {
      return;
    }

    // Перед запуском кастинга сохраняем актуальное состояние викторины,
    // чтобы кастинговое окно загрузило свежие команды, темы и баллы
    await this.saveState();

    this.isCastingActive = true;
    this.cdr.markForCheck();
    // Если нет Electron-контекста (браузерный режим) — просто навигируемся внутри текущего окна
    if (!this.windowSrv.hasElectron) {
      this.router.navigate(['/quiz-casting']);
      return;
    }

    try {
      // Берём дисплей из настроек (тот же, что используют остальные фичи кастинга)
      await this.settingsSrv.init();
      const display = await firstValueFrom(
        this.settingsSrv.getDisplayForCasting()
      );

      if (!display) {
        this.router.navigate(['/quiz-casting']);
        return;
      }

      // На всякий случай закрываем предыдущее окно кастинга, если оно "зависло" в App.openedWindows
      try {
        await this.windowSrv.electronContext.closeWindow({
          type: AppWindowTypes.CASTING,
        });
      } catch {
        // игнорируем ошибки, если окна реально нет
      }

      await this.windowSrv.electronContext.openWindow({
        ...DEFAULT_CASTING_PAGE_CONFIG,
        display,
        title: 'Quiz Casting',
      });

      // Дожидаемся, когда новое окно инициализируется (APP_INIT),
      // и только потом просим его открыть страницу quiz-casting.
      await firstValueFrom(
        this.bridge.queueEvents.pipe(
          skip(1),
          filter(
            (event): event is { event: string; payload: unknown } =>
              !!event && event.event === APP_COMMON_ACTIONS.appInit
          )
        )
      );

      await this.windowSrv.electronContext.send({
        event: APP_COMMON_ACTIONS.openPage,
        payload: { path: ['quiz-casting'] } as any,
      });
    } catch {
      // в случае ошибки откатываемся к переходу в этом же окне
      this.router.navigate(['/quiz-casting']);
      this.isCastingActive = false;
      this.cdr.markForCheck();
    }
  }

  // Пока без сложной логики: заглушка под будущую реализацию паузы/остановки кастинга
  stopQuizCasting(): void {
    // Скрываем текущий вопрос в окне кастинга
    this.bridge.send('QUIZ_CLEAR_QUESTION' as any, {} as any);

    // Сбрасываем выбранную команду и активный вопрос
    this.selectedTeamId = null;
    this.activeTopicId = null;
    this.activeQuestionId = null;
    this.cdr.markForCheck();
  }

  async closeCastingWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron) {
      return;
    }

    await this.windowSrv.electronContext.closeWindow({
      type: AppWindowTypes.CASTING,
    });
    this.isCastingActive = false;
    this.cdr.markForCheck();
  }
}
