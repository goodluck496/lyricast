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
import { DividerModule } from 'primeng/divider';
import { ContextMenuModule, ContextMenu } from 'primeng/contextmenu';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Toast, ToastModule } from 'primeng/toast';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { CardModule } from 'primeng/card';
import { QuizState, QuizStateService, QuizSummary } from '@lyri-cast/quiz-feature';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, skip } from 'rxjs/operators';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { QuizQuestionEditorComponent } from '../../components/quiz-question-editor/quiz-question-editor.component';
import { QuizStatsTableComponent } from '../../components/quiz-stats-table/quiz-stats-table.component';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { QuizSidebarComponent } from '../../components/quiz-sidebar/quiz-sidebar.component';
import { QuizSidebarService } from '../../services/quiz-sidebar.service';
import { QuizGameService } from '../../services/quiz-game.service';

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
    DividerModule,
    CardModule,
    QuizQuestionEditorComponent,
    QuizStatsTableComponent,
    AutoCompleteModule,
    ContextMenuModule,
    ProgressSpinnerModule,
    Toast,
    ConfirmPopup,
    QuizSidebarComponent,
  ],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService, ConfirmationService, QuizSidebarService],
})
export class QuizComponent implements OnInit {
  // левая часть: команды и участники
  newTeamName = '';
  newMemberNameByTeamId = new Map<string, string>();
  // ручная корректировка очков по командам (бонус/штраф)
  manualDeltaByTeamId = new Map<string, number | null>();

  isLoading = true;

  // === Multi-quiz management ===
  quizzes: QuizSummary[] = [];
  selectedQuiz: QuizSummary | null = null;
  newQuizTitle = '';
  filteredQuizzes: QuizSummary[] = [];

  // Открытые панели аккордеона с темами (для программного разворота при скролле к вопросу)
  openedTopicIds: string[] = [];

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
  // управление показом формы нового вопроса по теме
  private newQuestionFormOpenByTopicId = new Map<string, boolean>();

  // варианты типов вопросов и режимов штрафа
  readonly questionTypeOptions: {
    label: string;
    value: 'normal' | 'penalty' | 'bonus';
  }[] = [
    { label: 'Обычный', value: 'normal' },
    { label: 'Штраф', value: 'penalty' },
    { label: 'Бонус', value: 'bonus' },
  ];

  readonly penaltyModeOptions: { label: string; value: 'subtract' | 'skip' }[] =
    [
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
      this.game.setActiveQuestion(topicId, questionId);
      this.answerCorrect();
    });
  }

  private triggerMarkWrongFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      this.game.setActiveQuestion(topicId, questionId);
      this.answerWrong();
    });
  }

  private triggerScrollToQuestionFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      // при переходе к вопросу с нижней таблицы также подсвечиваем его как активный
      this.game.setActiveQuestion(topicId, questionId);
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
  private readonly confirmationService = inject(ConfirmationService);
  private readonly game = inject(QuizGameService);

  // Контекстное меню для нижней таблицы вопросов
  quizTableMenuItems: MenuItem[] = [];
  private contextTopicId: string | null = null;
  private contextQuestionId: string | null = null;
  @ViewChild('quizTableCm') private quizTableCm?: ContextMenu;

  get canAnswer(): boolean {
    return this.game.canAnswer();
  }

  get maxTeamScore(): number {
    return this.game.maxTeamScore();
  }

  get teamsSortedByScore(): {
    id: string;
    name: string;
    score: number;
    members: { id: string; name: string }[];
  }[] {
    return this.game.teamsSortedByScore();
  }

  // Обёртки над состоянием игры, чтобы шаблон продолжал использовать старые имена
  get teams() {
    return this.game.teams();
  }

  get topics() {
    return this.game.topics();
  }

  get selectedTeamId(): string | null {
    return this.game.selectedTeamId();
  }

  set selectedTeamId(value: string | null) {
    this.game.setSelectedTeamId(value);
  }

  get activeTopicId(): string | null {
    return this.game.activeTopicId();
  }

  get activeQuestionId(): string | null {
    return this.game.activeQuestionId();
  }

  get isCastingActive(): boolean {
    return this.game.isCastingActive();
  }

  async ngOnInit(): Promise<void> {
    // Не загружаем quiz.json автоматически, только список доступных викторин
    this.quizzes = await this.quizStateService.listQuizzes();
    this.filteredQuizzes = [...this.quizzes];

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

  // === Multi-quiz management helpers ===

  filterQuizzes(event: AutoCompleteCompleteEvent): void {
    const query = (event.query || '').toLowerCase();
    if (!query) {
      this.filteredQuizzes = [...this.quizzes];
      return;
    }
    this.filteredQuizzes = this.quizzes.filter((q) =>
      q.title.toLowerCase().includes(query)
    );
  }

  async onQuizSelected(quiz: QuizSummary | null): Promise<void> {
    if (!quiz) {
      return;
    }
    const state = await this.quizStateService.loadById(quiz.id);
    if (state) {
      this.applyState(state);
      this.selectedQuiz = quiz;
    }
  }

  async createQuiz(): Promise<void> {
    const title = this.newQuizTitle.trim();
    if (!title) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Название не задано',
        detail: 'Введите название новой викторины.',
      });
      return;
    }

    // Новая викторина должна начинаться с пустого состояния (без команд и вопросов)
    const emptyState: QuizState = {
      teams: [],
      topics: [],
    };
    const id = await this.quizStateService.saveAsNew(
      {
        title,
        date: new Date().toISOString().slice(0, 10),
      },
      emptyState
    );

    if (!id) {
      this.messageService.add({
        severity: 'error',
        summary: 'Ошибка сохранения',
        detail: 'Не удалось сохранить викторину.',
      });
      return;
    }

    this.newQuizTitle = '';
    this.quizzes = await this.quizStateService.listQuizzes();
    this.filteredQuizzes = [...this.quizzes];
    const justCreated = this.quizzes.find((q) => q.id === id) ?? null;
    this.selectedQuiz = justCreated;

    // Применяем пустое состояние к UI, чтобы очистить команды и вопросы
    this.applyState(emptyState);
  }

  confirmDeleteQuiz(event: Event): void {
    if (!this.selectedQuiz) {
      return;
    }
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: `Удалить викторину "${this.selectedQuiz.title}"? Это действие нельзя отменить.`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-text p-button-sm',
      accept: () => this.deleteSelectedQuiz(),
    });
  }

  private async deleteSelectedQuiz(): Promise<void> {
    if (!this.selectedQuiz) {
      return;
    }
    const id = this.selectedQuiz.id;
    await this.quizStateService.deleteById(id);
    this.quizzes = await this.quizStateService.listQuizzes();
    this.filteredQuizzes = [...this.quizzes];
    this.selectedQuiz = null;
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
    this.game.setActiveQuestion(topicId, questionId);

    const team = this.teams.find((t) => t.id === this.selectedTeamId) ?? null;

    const type = question.type ?? 'normal';

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
        type,
        team: team ? { id: team.id, name: team.name, score: team.score } : null,
      } as any
    );

    // Для штрафных и бонусных вопросов логика ответа срабатывает сразу при показе
    if (type === 'penalty') {
      this.game.answerWrong();
      this.cdr.markForCheck();
    } else if (type === 'bonus') {
      this.game.answerCorrect();
      this.cdr.markForCheck();
    }
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
    this.game.answerCorrect();
    this.cdr.markForCheck();
  }

  answerWrong(): void {
    this.game.answerWrong();
    this.cdr.markForCheck();
  }

  toggleQuestionLock(topicId: string, questionId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    if (!topic || !question) {
      return;
    }

    const newBurned = !question.burned;

    this.game.updateQuestion(topic.id, question.id, { burned: newBurned });

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
    this.game.addTeam(name);
    this.newTeamName = '';
  }

  removeTeam(teamId: string) {
    this.game.removeTeam(teamId);
    this.newMemberNameByTeamId.delete(teamId);
  }

  confirmRemoveTeam(event: Event, teamId: string): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: 'Удалить команду? Это действие нельзя отменить.',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-text p-button-sm',
      accept: () => this.removeTeam(teamId),
    });
  }

  updateTeamName(teamId: string, name: string) {
    this.game.updateTeamName(teamId, name.trim() || name);
  }

  addMember(teamId: string) {
    const draft = (this.newMemberNameByTeamId.get(teamId) || '').trim();
    if (!draft) {
      return;
    }
    this.game.addMember(teamId, draft);
    this.newMemberNameByTeamId.set(teamId, '');
  }

  removeMember(teamId: string, memberId: string) {
    this.game.removeMember(teamId, memberId);
  }

  // ==== Topics ====
  addTopic() {
    const title =
      this.newTopicTitle?.trim() || `Тема ${this.topics.length + 1}`;
    this.game.addTopic(title);
    this.newTopicTitle = '';
  }

  removeTopic(topicId: string) {
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

  updateTopicTitle(topicId: string, title: string) {
    this.game.updateTopicTitle(topicId, title.trim() || title);
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

    const beforeCount =
      this.topics.find((t) => t.id === topicId)?.questions.length ?? 0;

    this.game.addQuestion(topicId, {
      text,
      answer: draft.answer.trim(),
      points,
      seconds,
    });

    const afterCount =
      this.topics.find((t) => t.id === topicId)?.questions.length ?? 0;

    this.newQuestionDraftByTopicId.set(topicId, {
      text: '',
      answer: '',
      points: null,
      seconds: null,
    });

    if (afterCount > beforeCount) {
      this.newQuestionFormOpenByTopicId.set(topicId, false);
    }
  }

  removeQuestion(topicId: string, questionId: string) {
    this.game.removeQuestion(topicId, questionId);
  }

  confirmRemoveQuestion(
    event: Event,
    topicId: string,
    questionId: string
  ): void {
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
    value: string | number | boolean | null
  ) {
    const topics = this.topics;
    const topic = topics.find((t) => t.id === topicId);
    const question = topic?.questions.find((q) => q.id === questionId);
    if (!topic || !question) {
      return;
    }

    const changes: any = {};

    if (field === 'points' || field === 'seconds') {
      changes[field] =
        typeof value === 'number' ? value : Number(value ?? 0);
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
        nextType === 'penalty'
          ? question.penaltyMode ?? 'subtract'
          : undefined;
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
      // Открываем форму и инициализируем черновик
      this.getQuestionDraft(topicId);
      this.newQuestionFormOpenByTopicId.set(topicId, true);
      return;
    }

    // Пытаемся сохранить вопрос
    this.addQuestion(topicId);
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  getState(): QuizState {
    return this.game.getState();
  }

  applyState(state: QuizState) {
    this.game.setState(state);
    this.cdr.markForCheck();
  }

  async saveState(): Promise<void> {
    const state = this.getState();

    if (this.selectedQuiz) {
      const id = this.selectedQuiz.id;
      const title = this.selectedQuiz.title;
      const date = this.selectedQuiz.date;

      const savedId = await this.quizStateService.saveAsNew(
        { id, title, date },
        state
      );

      if (!savedId) {
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка сохранения',
          detail: 'Не удалось сохранить викторину.',
        });
        return;
      }

      // Обновляем список викторин и выбранную
      this.quizzes = await this.quizStateService.listQuizzes();
      this.filteredQuizzes = [...this.quizzes];
      this.selectedQuiz =
        this.quizzes.find((q) => q.id === savedId) ?? this.selectedQuiz;
      return;
    }

    // Обратная совместимость: если викторина не выбрана, сохраняем в quiz.json
    await this.quizStateService.save(state);
  }

  async reloadState(): Promise<void> {
    const state = await this.quizStateService.load();
    if (state) {
      this.applyState(state);
    }
  }

  resetStatistics(): void {
    this.game.resetStatistics();
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

    const signedDelta =
      kind === 'manual_bonus' ? Math.abs(delta) : -Math.abs(delta);

    this.game.updateTeamScore(teamId, signedDelta);

    // История: фиксируем ручную корректировку счёта
    this.game.addManualHistoryEntry(teamId, {
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

    this.game.setCastingActive(true);
    this.cdr.markForCheck();
    // Если нет Electron-контекста (браузерный режим) — просто навигируемся внутри текущего окна
    if (!this.windowSrv.hasElectron) {
      this.router.navigate([Pages.CASTING]);
      return;
    }

    try {
      // Берём дисплей из настроек (тот же, что используют остальные фичи кастинга)
      await this.settingsSrv.init();
      const display = await firstValueFrom(
        this.settingsSrv.getDisplayForCasting()
      );

      if (!display) {
        this.router.navigate([Pages.CASTING]);
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
        payload: { path: [Pages.QUIZ_FEATURE, Pages.CASTING] } as any,
      });
    } catch {
      // в случае ошибки откатываемся к переходу в этом же окне
      this.router.navigate([Pages.QUIZ_FEATURE, Pages.CASTING]);
      this.game.setCastingActive(false);
      this.cdr.markForCheck();
    }
  }

  // Пока без сложной логики: заглушка под будущую реализацию паузы/остановки кастинга
  stopQuizCasting(): void {
    // Скрываем текущий вопрос в окне кастинга
    this.bridge.send('QUIZ_CLEAR_QUESTION' as any, {} as any);

    // Сбрасываем выбранную команду и активный вопрос
    this.game.setSelectedTeamId(null);
    this.game.setActiveQuestion(null, null);
    this.cdr.markForCheck();
  }

  async closeCastingWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron) {
      return;
    }

    await this.windowSrv.electronContext.closeWindow({
      type: AppWindowTypes.CASTING,
    });
    this.game.setCastingActive(false);
    this.cdr.markForCheck();
  }
}
