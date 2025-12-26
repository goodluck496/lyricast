import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import {
  AutoCompleteCompleteEvent,
  AutoCompleteModule,
} from 'primeng/autocomplete';
import { QuizStateService, QuizSummary } from '@lyri-cast/quiz-feature';
import { QuizSidebarService } from '../../services/quiz-sidebar.service';
import { QuizGameService } from '../../services/quiz-game.service';
import { MessageService, ConfirmationService } from 'primeng/api';

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

  isLoading = false;

  quizzes: QuizSummary[] = [];
  filteredQuizzes: QuizSummary[] = [];
  selectedQuiz: QuizSummary | null = null;
  newQuizTitle = '';

  ngOnInit(): void {
    this.loadQuizzes();
  }

  get teams() {
    return this.game.teams();
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
      q.title.toLowerCase().includes(query),
    );
  }

  async onQuizSelected(quiz: QuizSummary | null): Promise<void> {
    if (!quiz) {
      this.selectedQuiz = null;
      return;
    }
    const state = await this.sidebarSrv.loadQuizById(quiz.id);
    if (state) {
      this.game.setState(state);
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

    const emptyState = { teams: [], topics: [] };
    const id = await this.sidebarSrv.createEmptyQuiz(title);
    if (!id) {
      return;
    }

    this.newQuizTitle = '';
    await this.loadQuizzes();
    this.selectedQuiz = this.quizzes.find((q) => q.id === id) ?? null;
    this.game.setState(emptyState);
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
    await this.sidebarSrv.deleteQuizById(id);
    await this.loadQuizzes();
    this.selectedQuiz = null;
  }

  async startQuizCasting(): Promise<void> {
    if (this.isCastingActive) {
      return;
    }

    const state = this.game.getState();
    await this.sidebarSrv.saveStateForQuiz(
      state,
      this.selectedQuiz
        ? {
            id: this.selectedQuiz.id,
            title: this.selectedQuiz.title,
            date: this.selectedQuiz.date ?? new Date().toISOString().slice(0, 10),
          }
        : null,
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

