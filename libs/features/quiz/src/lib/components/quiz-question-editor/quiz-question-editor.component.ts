import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ButtonDirective, ButtonIcon } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

export type QuizQuestionType = 'normal' | 'penalty' | 'bonus';
export type QuizPenaltyMode = 'subtract' | 'skip';

export interface QuizQuestionViewModel {
  id: string;
  text: string;
  answer: string;
  points: number;
  seconds: number;
  solved?: boolean;
  burned?: boolean;
  type?: QuizQuestionType;
  penaltyMode?: QuizPenaltyMode;
}

@Component({
  selector: 'lyri-quiz-question-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FloatLabelModule,
    InputNumberModule,
    InputTextModule,
    SelectButtonModule,
    ButtonDirective,
    Textarea,
    TooltipModule,
    ButtonIcon,
  ],
  templateUrl: './quiz-question-editor.component.html',
  styleUrl: './quiz-question-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizQuestionEditorComponent {
  @Input() topicId!: string;
  @Input() question!: QuizQuestionViewModel;
  @Input() questionTypeOptions: { label: string; value: QuizQuestionType }[] =
    [];
  @Input() penaltyModeOptions: { label: string; value: QuizPenaltyMode }[] = [];

  @Output() updateField = new EventEmitter<{
    field:
      | 'text'
      | 'answer'
      | 'points'
      | 'seconds'
      | 'type'
      | 'penaltyMode'
      | 'solved';
    value: string | number | boolean | null;
  }>();
  @Output() showQuestion = new EventEmitter<void>();
  @Output() showAnswer = new EventEmitter<void>();
  @Output() toggleLock = new EventEmitter<void>();
  @Output() toggleSolved = new EventEmitter<void>();
  @Output() remove = new EventEmitter<Event>();

  private readonly messageService = inject(MessageService);

  onUpdateField(
    field:
      | 'text'
      | 'answer'
      | 'points'
      | 'seconds'
      | 'type'
      | 'penaltyMode'
      | 'solved',
    value: string | number | boolean | null
  ): void {
    this.updateField.emit({ field, value });
  }

  onTypeChange(value: QuizQuestionType | null): void {
    this.onUpdateField('type', value ?? 'normal');

    if (value === 'penalty') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Штрафной вопрос',
        detail: 'На экране он сразу будет как при истечении времени.',
      });
    }
  }

  protected readonly event = event;
}
