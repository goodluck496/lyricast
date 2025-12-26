import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Ng2FittextModule } from 'ng2-fittext';
import { BridgeService } from '@lyri-cast/common-browser';
import { QuizState, QuizStateService } from '@lyri-cast/quiz-feature';
import { filter } from 'rxjs/operators';
import { QuizStatsTableComponent } from '../../components/quiz-stats-table/quiz-stats-table.component';

@Component({
  selector: 'lyri-quiz-casting',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule, QuizStatsTableComponent],
  templateUrl: './quiz-casting.component.html',
  styleUrl: './quiz-casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizCastingComponent implements OnInit, OnDestroy {
  private readonly quizStateService = inject(QuizStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly bridge = inject(BridgeService);

  state: QuizState | null = null;

  currentTopicTitle: string | null = null;
  currentQuestion: { id: string; text: string; answer: string; points: number | null; seconds: number | null } | null = null;
  currentTeamName: string | null = null;

  remainingSeconds: number | null = null;
  private timerId: number | null = null;

  // Сетка для "кубиков" подсветки (rows x cols ячеек на весь экран)
  private readonly overlayRows = 6;
  private readonly overlayCols = 10;
  gridCells: number[] = [];
  activeCellFlags: boolean[] = [];
  totalSeconds: number | null = null;
  timeExpired = false;

  // Состояние результата ответа для цветового фидбэка
  answerStatus: 'none' | 'correct' | 'wrong' = 'none';

  // Идентификаторы вопросов, которые уже были решены (для скрытия их баллов)
  readonly solvedQuestionIds = new Set<string>();
  // Идентификаторы "сгоревших" вопросов (неверный ответ / заблокированы)
  readonly burnedQuestionIds = new Set<string>();

  // Флаг показа ответа вместо вопроса
  showAnswer = false;

  // Режим отображения статистики команд
  showStats = false;
  statsTeams: { id: string; name: string; score: number }[] = [];
  statsHasWinner = false;

  // Тип текущего вопроса и данные о последнем верном ответе
  currentQuestionType: 'normal' | 'penalty' | 'bonus' | 'none' = 'none';
  lastCorrectType: 'normal' | 'penalty' | 'bonus' | 'none' = 'none';
  lastCorrectDelta: number | null = null;

  // Пока без реального таймера/выбора вопроса – просто плоское отображение данных
  async ngOnInit(): Promise<void> {
    const loaded = await this.quizStateService.load();
    this.state = loaded;

    // Восстанавливаем подсветку решённых/"сгоревших" вопросов из сохранённого состояния
    this.solvedQuestionIds.clear();
    this.burnedQuestionIds.clear();
    if (loaded?.topics) {
      for (const topic of loaded.topics) {
        for (const q of topic.questions ?? []) {
          if ((q as any).solved) {
            this.solvedQuestionIds.add(q.id);
          }
          if ((q as any).burned) {
            this.burnedQuestionIds.add(q.id);
          }
        }
      }
    }

    const totalCells = this.overlayRows * this.overlayCols;
    this.gridCells = Array.from({ length: totalCells }, (_, i) => i);
    this.activeCellFlags = Array(totalCells).fill(false);
    this.cdr.markForCheck();

    this.bridge.queueEvents.subscribe((event) => {
      if (!event) {
        return;
      }

      if (event.event === 'QUIZ_SHOW_QUESTION') {
        const payload = event.payload as any;
        const type = (payload?.type as 'normal' | 'penalty' | 'bonus' | undefined) ?? 'normal';
        this.currentQuestionType = type;
        this.lastCorrectType = 'none';
        this.lastCorrectDelta = null;
        this.showStats = false;
        this.showAnswer = false;
        this.answerStatus = 'none';
        this.currentTopicTitle = payload.topicTitle ?? null;
        this.currentTeamName = payload.team?.name ?? null;
        this.currentQuestion = payload.question
          ? {
              id: payload.question.id,
              text: payload.question.text,
              answer: payload.question.answer,
              points: payload.question.points,
              seconds: payload.question.seconds,
            }
          : null;

        // Запускаем таймер для вопроса или сразу включаем красный пульсирующий экран для штрафного вопроса
        this.clearTimer();
        this.activeCellFlags.fill(false);
        this.timeExpired = false;

        if (type === 'penalty') {
          // Для штрафного вопроса сразу заполняем все ячейки и включаем режим "как при истечении времени"
          const totalCells = this.overlayRows * this.overlayCols;
          this.activeCellFlags = Array(totalCells).fill(true);
          this.remainingSeconds = null;
          this.totalSeconds = null;
          this.timeExpired = true;
          this.cdr.markForCheck();
        } else {
          const total = (payload.question?.seconds as number | undefined) ?? 30;
          this.totalSeconds = total;
          this.remainingSeconds = total;

          if (total > 0) {
            this.timerId = window.setInterval(() => {
              if (this.remainingSeconds == null) {
                return;
              }
              this.remainingSeconds = Math.max(0, this.remainingSeconds - 1);

              // Обновляем заполненность "кубиками" пропорционально оставшемуся времени
              this.updateOverlayFill();
              this.cdr.markForCheck();

              if (this.remainingSeconds === 0) {
                this.clearTimer();
                this.timeExpired = true;
                this.cdr.markForCheck();
              }
            }, 1000);
          }
          this.cdr.markForCheck();
        }

        // Просим fittext пересчитать размер текста
        window.dispatchEvent(new Event('resize'));
      }

      if (event.event === 'QUIZ_CLEAR_QUESTION') {
        this.currentQuestion = null;
        this.currentTopicTitle = null;
        this.currentTeamName = null;
        this.remainingSeconds = null;
        this.totalSeconds = null;
        this.clearTimer();
        this.activeCellFlags.fill(false);
        this.timeExpired = false;
        this.answerStatus = 'none';
        this.showAnswer = false;
        this.showStats = false;
        this.statsHasWinner = false;
        this.currentQuestionType = 'none';
        this.lastCorrectType = 'none';
        this.lastCorrectDelta = null;
        this.cdr.markForCheck();
      }

      if (event.event === 'QUIZ_ANSWER_CORRECT') {
        // Помечаем вопрос как решённый — его баллы исчезают из таблицы
        const qId = (event.payload as any)?.questionId as string | undefined;
        if (qId) {
          this.solvedQuestionIds.add(qId);
        }

        // Останавливаем таймер и фиксируем текущее состояние
        this.clearTimer();
        this.timeExpired = false;

        const payload = event.payload as any;
        const type = (payload?.type as 'normal' | 'penalty' | 'bonus' | undefined) ?? 'normal';
        this.lastCorrectType = type;
        this.lastCorrectDelta = typeof payload?.delta === 'number' ? payload.delta : null;

        // Показываем зелёный фон и специальный текст
        this.answerStatus = 'correct';
        this.cdr.markForCheck();
      }

      if (event.event === 'QUIZ_ANSWER_WRONG') {
        const qId = (event.payload as any)?.questionId as string | undefined;
        if (qId) {
          this.burnedQuestionIds.add(qId);
        }

        this.answerStatus = 'wrong';
        this.lastCorrectType = 'none';
        this.lastCorrectDelta = null;
        this.cdr.markForCheck();
        setTimeout(() => {
          this.answerStatus = 'none';
          this.cdr.markForCheck();
        }, 1200);
      }

      if (event.event === 'QUIZ_UNLOCK_QUESTION') {
        const qId = (event.payload as any)?.questionId as string | undefined;
        if (qId) {
          this.burnedQuestionIds.delete(qId);
          this.cdr.markForCheck();
        }
      }

      if (event.event === 'QUIZ_SHOW_ANSWER') {
        const payload = event.payload as any;
        this.currentTopicTitle = payload.topicTitle ?? null;
        this.currentTeamName = payload.team?.name ?? null;
        this.showAnswer = true;
        // текст ответа берём из payload.answer, сам вопрос уже есть в currentQuestion
        if (this.currentQuestion) {
          this.currentQuestion = {
            ...this.currentQuestion,
            answer: payload.answer ?? this.currentQuestion.answer,
          };
        }
        this.cdr.markForCheck();
      }

      if (event.event === 'QUIZ_SHOW_STATS') {
        const payload = event.payload as any;
        const teams = Array.isArray(payload?.teams) ? payload.teams : [];

        this.statsTeams = [...teams].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

        // При показе статистики скрываем текущий вопрос и таймер
        this.currentQuestion = null;
        this.currentTopicTitle = null;
        this.currentTeamName = null;
        this.showAnswer = false;
        this.answerStatus = 'none';
        this.clearTimer();
        this.remainingSeconds = null;
        this.totalSeconds = null;
        this.timeExpired = false;

        this.showStats = true;
        this.statsHasWinner = this.statsTeams.length > 0 && (this.statsTeams[0].score ?? 0) > 0;
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timerId != null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private updateOverlayFill(): void {
    if (this.totalSeconds == null || this.remainingSeconds == null) {
      return;
    }

    const totalCells = this.gridCells.length;
    if (!totalCells || this.totalSeconds <= 0) {
      return;
    }

    const ratio = 1 - this.remainingSeconds / this.totalSeconds;
    const targetActive = Math.round(totalCells * ratio);

    let currentActive = this.activeCellFlags.filter(Boolean).length;
    if (targetActive <= currentActive) {
      return;
    }

    const availableIndices = this.gridCells.filter((_, idx) => !this.activeCellFlags[idx]);
    while (currentActive < targetActive && availableIndices.length) {
      const randIndex = Math.floor(Math.random() * availableIndices.length);
      const cellId = availableIndices[randIndex];
      const gridIndex = this.gridCells.indexOf(cellId);
      if (gridIndex >= 0 && !this.activeCellFlags[gridIndex]) {
        this.activeCellFlags[gridIndex] = true;
        currentActive++;
      }
      availableIndices.splice(randIndex, 1);
    }
  }
}
