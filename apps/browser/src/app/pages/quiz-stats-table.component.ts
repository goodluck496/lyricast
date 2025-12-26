import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface QuizStatsTeamRow {
  id?: string;
  name: string;
  score: number | null | undefined;
}

@Component({
  selector: 'lyri-quiz-stats-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quiz-stats-table.component.html',
  styleUrl: './quiz-stats-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizStatsTableComponent {
  @Input() teams: QuizStatsTeamRow[] = [];
  @Input() tableClass = '';
  @Input() winnerRowClass = '';
  /**
   * Если true, подсвечиваем первую команду с положительным счётом
   * с использованием класса winnerRowClass.
   */
  @Input() highlightFirstPositive = true;

  trackByTeam(_index: number, team: QuizStatsTeamRow): string {
    return team.id ?? team.name;
  }
}
