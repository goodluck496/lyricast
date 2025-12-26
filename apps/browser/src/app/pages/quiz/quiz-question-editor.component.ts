import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ButtonDirective } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

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
  ],
  templateUrl: './quiz-question-editor.component.html',
  styleUrl: './quiz-question-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizQuestionEditorComponent {
  @Input() topicId!: string;
  @Input() question!: QuizQuestionViewModel;
  @Input() questionTypeOptions: { label: string; value: QuizQuestionType }[] = [];
  @Input() penaltyModeOptions: { label: string; value: QuizPenaltyMode }[] = [];

  @Output() updateField = new EventEmitter<{ field: 'text' | 'answer' | 'points' | 'seconds' | 'type' | 'penaltyMode' | 'solved'; value: string | number | boolean | null }>();
  @Output() showQuestion = new EventEmitter<void>();
  @Output() showAnswer = new EventEmitter<void>();
  @Output() toggleLock = new EventEmitter<void>();
  @Output() toggleSolved = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  onUpdateField(field: 'text' | 'answer' | 'points' | 'seconds' | 'type' | 'penaltyMode' | 'solved', value: string | number | boolean | null): void {
    this.updateField.emit({ field, value });
  }
}
