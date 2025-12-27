import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccordionModule } from 'primeng/accordion';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonDirective } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService } from 'primeng/api';
import { QuizGameService } from '../../services/quiz-game.service';

@Component({
  selector: 'lyri-quiz-teams-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AccordionModule,
    InputTextModule,
    InputNumberModule,
    ButtonDirective,
    TooltipModule,
  ],
  templateUrl: './quiz-teams-panel.component.html',
  styleUrl: './quiz-teams-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizTeamsPanelComponent {
  private readonly game = inject(QuizGameService);
  private readonly confirmationService = inject(ConfirmationService);

  newTeamName = '';
  newMemberNameByTeamId = new Map<string, string>();
  manualDeltaByTeamId = new Map<string, number | null>();

  get teams() {
    return this.game.teams();
  }

  addTeam(): void {
    const name = this.newTeamName?.trim() || `Команда ${this.teams.length + 1}`;
    this.game.addTeam(name);
    this.newTeamName = '';
  }

  private removeTeam(teamId: string): void {
    this.game.removeTeam(teamId);
    this.newMemberNameByTeamId.delete(teamId);
    this.manualDeltaByTeamId.delete(teamId);
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

  updateTeamName(teamId: string, name: string): void {
    this.game.updateTeamName(teamId, name.trim() || name);
  }

  addMember(teamId: string): void {
    const draft = (this.newMemberNameByTeamId.get(teamId) || '').trim();
    if (!draft) {
      return;
    }
    this.game.addMember(teamId, draft);
    this.newMemberNameByTeamId.set(teamId, '');
  }

  removeMember(teamId: string, memberId: string): void {
    this.game.removeMember(teamId, memberId);
  }

  applyManualBonus(teamId: string): void {
    this.applyManualDelta(teamId, 'manual_bonus');
  }

  applyManualPenalty(teamId: string): void {
    this.applyManualDelta(teamId, 'manual_penalty');
  }

  private applyManualDelta(
    teamId: string,
    kind: 'manual_bonus' | 'manual_penalty',
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

    this.game.updateTeamScore(teamId, signedDelta);

    this.game.addManualHistoryEntry(teamId, {
      kind,
      topicTitle: 'Ручная корректировка',
      questionText: '',
      points: signedDelta,
    });

    this.manualDeltaByTeamId.set(teamId, null);
  }
}
