import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SplitterModule } from 'primeng/splitter';
import { AccordionModule } from 'primeng/accordion';
import { FormsModule } from '@angular/forms';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import {
  BridgeService,
  PAGE_CONTAINER_TEMPLATES,
  Pages,
} from '@lyri-cast/common-browser';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FloatLabelModule } from 'primeng/floatlabel';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { ContextMenu, ContextMenuModule } from 'primeng/contextmenu';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Toast } from 'primeng/toast';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { CardModule } from 'primeng/card';
import { QuizState, QuizSummary } from '../../quiz.types';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { QuizSidebarComponent } from '../../components/quiz-sidebar/quiz-sidebar.component';
import { QuizTeamsPanelComponent } from '../../components/quiz-teams-panel/quiz-teams-panel.component';
import { QuizTopicsPanelComponent } from '../../components/quiz-topics-panel/quiz-topics-panel.component';
import {
  QuizGameService,
  QuizSidebarService,
  QuizStateService,
} from '../../services';
import { NgScrollbarModule } from 'ngx-scrollbar';

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
    SelectModule,
    SelectButtonModule,
    FloatLabelModule,
    CheckboxModule,
    TooltipModule,
    DividerModule,
    CardModule,
    AutoCompleteModule,
    ContextMenuModule,
    ProgressSpinnerModule,
    NgScrollbarModule,
    Toast,
    ConfirmPopup,
    QuizSidebarComponent,
    QuizTeamsPanelComponent,
    QuizTopicsPanelComponent,
  ],
  templateUrl: './quiz.component.html',
  styleUrls: ['./quiz.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService, QuizSidebarService, QuizStateService, QuizGameService],
})
export class QuizComponent implements OnInit {
  isLoading = true;

  // === Multi-quiz management ===
  quizzes: QuizSummary[] = [];
  filteredQuizzes: QuizSummary[] = [];

  protected readonly Pages = Pages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;

  private readonly quizStateService = inject(QuizStateService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly bridge = inject(BridgeService);
  private readonly messageService = inject(MessageService);
  private readonly game = inject(QuizGameService);

  // Контекстное меню для нижней таблицы вопросов
  quizTableMenuItems: MenuItem[] = [];
  private contextTopicId: string | null = null;
  private contextQuestionId: string | null = null;
  @ViewChild('quizTableCm') private quizTableCm?: ContextMenu;

  // Тайминги для перехода "К вопросу":
  // задержка перед началом поиска вопроса (даём аккордеону открыться),
  // интервал между попытками поиска элемента и максимальное число попыток.
  private static readonly SCROLL_POLL_DELAY_MS = 200;
  private static readonly SCROLL_POLL_INTERVAL_MS = 120;
  private static readonly SCROLL_POLL_MAX_ATTEMPTS = 40;

  // Темы, для которых мы уже программно открывали панель аккордеона при переходе "К вопросу".
  // Нужно, чтобы повторные переходы к другим вопросам той же темы не схлопывали панель.
  private topicsOpenedByScroll = new Set<string>();

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

  get activeTopicId(): string | null {
    return this.game.activeTopicId();
  }

  get activeQuestionId(): string | null {
    return this.game.activeQuestionId();
  }

  get hasGameState(): boolean {
    return this.game.hasState();
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

  applyState(state: QuizState) {
    this.game.setState(state);
    this.cdr.markForCheck();
  }

  private withContextQuestion(
    handler: (topicId: string, questionId: string) => void
  ): void {
    if (!this.contextTopicId || !this.contextQuestionId) {
      return;
    }
    handler(this.contextTopicId, this.contextQuestionId);
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
      // даём Angular/PrimeNG тик на обновление состояния и DOM, затем скроллим
      setTimeout(() => this.scrollToQuestion(topicId, questionId), 0);
    });
  }

  private triggerShowAnswerFromContext(): void {
    this.withContextQuestion((topicId, questionId) => {
      this.showAnswerOnCasting(topicId, questionId);
    });
  }

  private scrollToQuestion(topicId: string, questionId: string): void {
    const questionSelector = `[data-question-id="${questionId}"]`;

    // Сначала пробуем открыть панель нужной темы: кликаем по заголовку
    // только один раз для каждой темы, чтобы не схлопнуть её при повторных
    // переходах "К вопросу" внутри той же темы.
    if (!this.topicsOpenedByScroll.has(topicId)) {
      const headerEl = document.querySelector<HTMLElement>(
        `.quiz-topic__header[data-topic-id="${topicId}"]`
      );

      headerEl?.click();

      if (headerEl) {
        this.topicsOpenedByScroll.add(topicId);
      }
    }

    // Дополнительно панель темы может открываться через QuizGameService.activeTopicId -> openedTopicIds
    // в QuizTopicsPanelComponent (effect в конструкторе). Ниже только ждём
    // появления нужного элемента и скроллим к нему.

    // ждём, пока Angular/PrimeNG дорендерят содержимое панели, затем скроллим к вопросу
    const maxAttempts = QuizComponent.SCROLL_POLL_MAX_ATTEMPTS;
    let attempts = 0;

    const tryScroll = () => {
      // Ищем вопрос только внутри панели нужной темы, чтобы не попасть
      // на одинаковые вопросы в других темах (например, при дублирующихся id).
      const topicHeader = document.querySelector<HTMLElement>(
        `.quiz-topic__header[data-topic-id="${topicId}"]`
      );
      const topicPanel =
        topicHeader?.closest<HTMLElement>('.p-accordion-panel');

      const searchRoot: ParentNode = topicPanel ?? document;
      const el = searchRoot.querySelector<HTMLElement>(questionSelector);

      if (el) {
        // Пытаемся прокрутить именно контейнер ngx-scrollbar, если он есть
        const scrollContainer = el.closest<HTMLElement>('.ng-scroll-viewport');

        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const offset =
            elRect.top -
            containerRect.top -
            containerRect.height / 2 +
            elRect.height / 2;

          scrollContainer.scrollBy({ top: offset, behavior: 'smooth' });
        } else {
          // fallback: прокручиваем весь документ
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        el.classList.add('quiz-question--highlight');
        setTimeout(() => {
          el.classList.remove('quiz-question--highlight');
        }, 1500);
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryScroll, QuizComponent.SCROLL_POLL_INTERVAL_MS);
      }
    };

    // даём аккордеону чуть больше времени на открытие и рендер, затем начинаем попытки скролла
    setTimeout(tryScroll, QuizComponent.SCROLL_POLL_DELAY_MS);
  }
}
