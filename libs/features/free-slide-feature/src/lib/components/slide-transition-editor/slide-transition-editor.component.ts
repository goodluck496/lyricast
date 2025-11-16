import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { Store } from '@ngrx/store';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  selectFreeSlideSelected,
  selectGlobalTransition,
  selectSlideTransitions,
} from '@lyri-cast/free-slide-store';
import {
  DEFAULT_TRANSITION,
  SlideTransition,
  TRANSITION_PRESETS,
  TransitionEasing,
  TransitionPreset,
  TransitionType,
} from '@lyri-cast/entities';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, map, take } from 'rxjs';
import { ButtonDirective } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { SliderModule } from 'primeng/slider';
import { Ripple } from 'primeng/ripple';
import { SvgIconComponent } from '@lyri-cast/svg-icons';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { CheckboxModule } from 'primeng/checkbox';
import { NgScrollbar } from 'ngx-scrollbar';

@Component({
  selector: 'lyri-slide-transition-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonDirective,
    DropdownModule,
    InputNumberModule,
    SliderModule,
    Ripple,
    SvgIconComponent,
    ScrollPanelModule,
    CheckboxModule,
    NgScrollbar,
  ],
  templateUrl: './slide-transition-editor.component.html',
  styleUrls: ['./slide-transition-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlideTransitionEditorComponent {
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  readonly transitionPresets = TRANSITION_PRESETS;
  readonly transitionTypes: { label: string; value: TransitionType }[] = [
    { label: 'Без перехода', value: 'none' },
    { label: 'Затухание', value: 'fade' },
    { label: 'Сдвиг влево', value: 'slideLeft' },
    { label: 'Сдвиг вправо', value: 'slideRight' },
    { label: 'Сдвиг вверх', value: 'slideUp' },
    { label: 'Сдвиг вниз', value: 'slideDown' },
    { label: 'Приближение', value: 'zoomIn' },
    { label: 'Отдаление', value: 'zoomOut' },
    { label: 'Переворот по горизонтали', value: 'flipHorizontal' },
    { label: 'Переворот по вертикали', value: 'flipVertical' },
    { label: 'Вращение внутрь', value: 'rotateIn' },
    { label: 'Вращение наружу', value: 'rotateOut' },
    { label: 'Растворение', value: 'dissolve' },
    { label: 'Вытеснение слева', value: 'wipeLeft' },
    { label: 'Вытеснение справа', value: 'wipeRight' },
    { label: 'Вытеснение сверху', value: 'wipeUp' },
    { label: 'Вытеснение снизу', value: 'wipeDown' },
  ];

  readonly easingOptions: { label: string; value: TransitionEasing }[] = [
    { label: 'Линейный', value: 'linear' },
    { label: 'Ускорение', value: 'easeIn' },
    { label: 'Замедление', value: 'easeOut' },
    { label: 'Ускорение и замедление', value: 'easeInOut' },
    { label: 'Ускорение (квадрат)', value: 'easeInQuad' },
    { label: 'Замедление (квадрат)', value: 'easeOutQuad' },
    { label: 'Ускорение и замедление (квадрат)', value: 'easeInOutQuad' },
    { label: 'Ускорение (кубический)', value: 'easeInCubic' },
    { label: 'Замедление (кубический)', value: 'easeOutCubic' },
    { label: 'Ускорение и замедление (кубический)', value: 'easeInOutCubic' },
    { label: 'Ускорение (четвертая степень)', value: 'easeInQuart' },
    { label: 'Замедление (четвертая степень)', value: 'easeOutQuart' },
    {
      label: 'Ускорение и замедление (четвертая степень)',
      value: 'easeInOutQuart',
    },
  ];

  transitionForm = new FormGroup(
    {
      type: new FormControl<TransitionType>('none', { nonNullable: true }),
      duration: new FormControl<number>(500, { nonNullable: true }),
      easing: new FormControl<TransitionEasing>('easeInOut', {
        nonNullable: true,
      }),
      delay: new FormControl<number>(0, { nonNullable: true }),
    },
    { updateOn: 'change' }
  );

  currentSlideId = signal<string>('');
  hasTransition = signal<boolean>(false);
  useGlobalTransition = true; // Обычное свойство для работы с ngModel

  // Вычисляемое свойство для отображения времени выполнения
  get totalDuration(): number {
    const duration = this.transitionForm.value.duration || 0;
    const delay = this.transitionForm.value.delay || 0;
    return duration + delay;
  }

  constructor() {
    // Подписываемся на глобальный переход
    this.store
      .select(selectGlobalTransition)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((transition) => {
        if (this.useGlobalTransition) {
          this.hasTransition.set(transition.type !== 'none');
          this.transitionForm.patchValue(
            {
              type: transition.type,
              duration: transition.duration,
              easing: transition.easing,
              delay: transition.delay || 0,
            },
            { emitEvent: false }
          );
        }
      });

    combineLatest([
      this.store.select(selectFreeSlideSelected),
      this.store.select(selectSlideTransitions),
    ])
      .pipe(
        map(([selectedSlide, transitions]) => {
          if (!selectedSlide) {
            return { slideId: '', transition: DEFAULT_TRANSITION };
          }

          const transition =
            transitions.get(selectedSlide.id) || DEFAULT_TRANSITION;
          return { slideId: selectedSlide.id, transition };
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ slideId, transition }) => {
        this.currentSlideId.set(slideId);

        if (!this.useGlobalTransition) {
          this.hasTransition.set(transition.type !== 'none');
          this.transitionForm.patchValue(
            {
              type: transition.type,
              duration: transition.duration,
              easing: transition.easing,
              delay: transition.delay || 0,
            },
            { emitEvent: false }
          );
        }
      });

    this.transitionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((formValue) => {
        const type = (formValue.type || 'none') as TransitionType;
        const duration = Number(formValue.duration ?? 500);
        const easing = (formValue.easing || 'easeInOut') as TransitionEasing;
        const delay = Number(formValue.delay ?? 0);

        if (type && !Number.isNaN(duration) && easing) {
          const transition: SlideTransition = { type, duration, easing, delay };

          if (this.useGlobalTransition) {
            // Применяем глобально для всех слайдов
            this.store.dispatch(
              FreeSlideActions[FreeSlideActionsEnum.setGlobalTransition]({
                transition,
              })
            );
          } else {
            // Применяем только для текущего слайда
            const slideId = this.currentSlideId();
            if (slideId) {
              this.store.dispatch(
                FreeSlideActions[FreeSlideActionsEnum.setSlideTransition]({
                  slideId,
                  transition,
                })
              );
            }
          }
        }
      });
  }

  toggleGlobalTransition() {
    this.useGlobalTransition = !this.useGlobalTransition;

    // Перезагружаем текущий переход
    if (this.useGlobalTransition) {
      this.store
        .select(selectGlobalTransition)
        .pipe(take(1))
        .subscribe((transition) => {
          this.transitionForm.patchValue({
            type: transition.type,
            duration: transition.duration,
            easing: transition.easing,
            delay: transition.delay || 0,
          });
          // При включении глобального режима — зафиксировать глобальный переход
          this.store.dispatch(
            FreeSlideActions[FreeSlideActionsEnum.setGlobalTransition]({
              transition,
            })
          );
        });
    }
  }

  applyPreset(preset: TransitionPreset) {
    this.transitionForm.patchValue({
      type: preset.transition.type,
      duration: preset.transition.duration,
      easing: preset.transition.easing,
      delay: preset.transition.delay || 0,
    });
  }

  resetTransition() {
    this.transitionForm.patchValue({
      type: 'none',
      duration: 500,
      easing: 'easeInOut',
      delay: 0,
    });
  }

  protected readonly DEFAULT_TRANSITION = DEFAULT_TRANSITION;
}
