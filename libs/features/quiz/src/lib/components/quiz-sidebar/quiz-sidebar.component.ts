import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonDirective, ButtonIcon } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  AutoCompleteCompleteEvent,
  AutoCompleteModule,
} from 'primeng/autocomplete';
import { QuizSidebarService } from '../../services/quiz-sidebar.service';
import { QuizGameService } from '../../services/quiz-game.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { QuizStateService } from '@lyri-cast/quiz-feature';
import { QuizSummary } from '../../quiz.types';
import { FloatLabel } from 'primeng/floatlabel';
import { QuizStatsTableComponent } from '../quiz-stats-table/quiz-stats-table.component';

@Component({
  selector: 'lyri-quiz-page-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonDirective,
    InputTextModule,
    SelectModule,
    AutoCompleteModule,
    TooltipModule,
    ProgressSpinnerModule,
    FloatLabel,
    ButtonIcon,
    QuizStatsTableComponent,
  ],
  templateUrl: './quiz-sidebar.component.html',
  styleUrl: './quiz-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizSidebarComponent implements OnInit {
  private readonly sidebarSrv = inject(QuizSidebarService);
  private readonly game = inject(QuizGameService);
  private readonly quizStateService = inject(QuizStateService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() selectOnly = false;

  isLoading = false;

  quizzes: QuizSummary[] = [];
  filteredQuizzes: QuizSummary[] = [];
  // Может быть как выбранным объектом викторины, так и введённой строкой (для создания новой).
  selectedQuiz: QuizSummary | string | null = null;

  ngOnInit(): void {
    this.loadQuizzes();
  }

  get teams() {
    return this.game.teams();
  }

  get teamsSortedByScore() {
    return this.game.teamsSortedByScore();
  }

  // Удобный геттер: выбранная викторина как объект (если действительно выбрана из списка),
  // иначе null, даже если в selectedQuiz лежит введённая строка.
  get selectedQuizObj(): QuizSummary | null {
    return this.selectedQuiz && typeof this.selectedQuiz !== 'string'
      ? (this.selectedQuiz as QuizSummary)
      : null;
  }

  get selectedTeamId(): string | null {
    return this.game.selectedTeamId();
  }

  set selectedTeamId(value: string | null) {
    this.game.setSelectedTeamId(value);
  }

  get canAnswer(): boolean {
    return this.game.canAnswer();
  }

  get isCastingActive(): boolean {
    return this.game.isCastingActive();
  }

  private async loadQuizzes(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.quizzes = await this.sidebarSrv.listQuizzes();
    this.filteredQuizzes = [...this.quizzes];
    const sharedSelected = this.sidebarSrv.getSelectedQuiz();
    if (sharedSelected) {
      this.selectedQuiz =
        this.quizzes.find((q) => q.id === sharedSelected.id) ?? null;
    }
    this.isLoading = false;
    this.cdr.markForCheck();
  }

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
      this.selectedQuiz = null;
      this.sidebarSrv.setSelectedQuiz(null);
      this.game.clearState();
      return;
    }
    this.isLoading = true;
    this.cdr.markForCheck();
    const state = await this.sidebarSrv.loadQuizById(quiz.id);
    if (state) {
      this.game.setState(state);
      this.selectedQuiz = quiz;
      this.sidebarSrv.setSelectedQuiz(quiz);
    }
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  async createQuiz(): Promise<void> {
    const value = this.selectedQuiz;
    const title = typeof value === 'string' ? value.trim() : '';

    if (!title) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Название не задано',
        detail: 'Введите название новой викторины.',
      });
      return;
    }

    const emptyState = { teams: [], topics: [] };
    const id = await this.sidebarSrv.createEmptyQuiz(title);
    if (!id) {
      return;
    }

    await this.loadQuizzes();
    const created = this.quizzes.find((q) => q.id === id) ?? null;
    this.selectedQuiz = created;
    this.sidebarSrv.setSelectedQuiz(created);
    this.game.setState(emptyState);
  }

  confirmDeleteQuiz(event: Event): void {
    const quiz = this.selectedQuizObj;
    if (!quiz) {
      return;
    }
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: `Удалить викторину "${quiz.title}"? Это действие нельзя отменить.`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-text p-button-sm',
      accept: () => this.deleteSelectedQuiz(),
    });
  }

  private async deleteSelectedQuiz(): Promise<void> {
    const quiz = this.selectedQuizObj;
    if (!quiz) {
      return;
    }
    const id = quiz.id;
    await this.sidebarSrv.deleteQuizById(id);
    await this.loadQuizzes();

    // Если после удаления в списке ещё остались викторины — автоматически
    // выбираем первую и подгружаем её состояние, чтобы интерфейс не
    // "схлопывался" до стартового экрана.
    if (this.quizzes.length > 0) {
      const next = this.quizzes[0];
      const state = await this.sidebarSrv.loadQuizById(next.id);
      if (state) {
        this.game.setState(state);
      } else {
        this.game.clearState();
      }
      this.selectedQuiz = next;
      this.sidebarSrv.setSelectedQuiz(next);
    } else {
      // Если это была последняя викторина — очищаем выбранную и состояние.
      this.selectedQuiz = null;
      this.sidebarSrv.setSelectedQuiz(null);
      this.game.clearState();
    }
  }

  async startQuizCasting(): Promise<void> {
    if (this.isCastingActive) {
      return;
    }

    const state = this.game.getState();
    await this.sidebarSrv.saveStateForQuiz(
      state,
      this.selectedQuizObj
        ? {
            id: this.selectedQuizObj.id,
            title: this.selectedQuizObj.title,
            date:
              this.selectedQuizObj.date ?? new Date().toISOString().slice(0, 10),
          }
        : null
    );

    this.game.setCastingActive(true);
    try {
      await this.sidebarSrv.openCastingWindow();
    } catch {
      this.game.setCastingActive(false);
    }
  }

  stopQuizCasting(): void {
    this.sidebarSrv.clearCastingScreen();
    this.game.setActiveQuestion(null, null);
    this.game.setSelectedTeamId(null);
  }

  async closeCastingWindow(): Promise<void> {
    await this.sidebarSrv.closeCastingWindow();
    this.game.setCastingActive(false);
  }

  answerCorrect(): void {
    this.game.answerCorrect();
  }

  answerWrong(): void {
    this.game.answerWrong();
  }

  showStatsOnCasting(): void {
    this.sidebarSrv.showStatsOnCasting(this.teams);
  }

  resetStatistics(): void {
    this.game.resetStatistics();
  }

  async saveState(): Promise<void> {
    const state = this.game.getState();
    await this.quizStateService.save(state);
  }

  async reloadState(): Promise<void> {
    const state = await this.sidebarSrv.loadLegacyState();
    if (state) {
      this.game.setState(state);
    }
  }
}

