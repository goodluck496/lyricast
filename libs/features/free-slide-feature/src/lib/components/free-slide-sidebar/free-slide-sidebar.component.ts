import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import {
  catchError,
  debounceTime,
  filter,
  first,
  firstValueFrom,
  map,
  of,
  take,
  timeout,
  withLatestFrom,
} from 'rxjs';
import {
  AppActions,
  selectOpenedWindow,
} from '@lyri-cast/common-browser';
import { AppWindowTypes } from '@lyri-cast/common-electron';

import { SvgIconComponent } from '@lyri-cast/svg-icons';
import { FreeSlideCastingPreviewComponent } from '../casting-preview/free-slide-casting-preview.component';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  FreeSlideState,
  selectFreeSlideCastingPaused,
  selectFreeSlideSelected,
  selectGlobalTransition,
  selectSlideTransitions,
  selectFreeSlideCastingFrozen,
} from '@lyri-cast/free-slide-store';
import { FreeSlideService } from '../../pages/free-slide-page/free-slide.service';
import { filterEmpty } from '@lyri-cast/common';
import { FreeSlideApiService } from '@lyri-cast/free-slide';

import { ToggleButtonModule } from 'primeng/togglebutton';
import { FormsModule } from '@angular/forms';
import { TabsModule } from 'primeng/tabs';
import { SlideTransitionEditorComponent } from '../slide-transition-editor/slide-transition-editor.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PptxFacadeService } from '../../services/pptx-facade.service';
import { PptxProgressDialogComponent, PptxProgressState } from '../../components/pptx-progress-dialog/pptx-progress-dialog.component';

@Component({
  selector: 'lyri-free-slide-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    NavigatorFeatureComponent,
    SvgIconComponent,
    FreeSlideCastingPreviewComponent,
    ToggleButtonModule,
    FormsModule,
    TabsModule,
    SlideTransitionEditorComponent,
    PptxProgressDialogComponent,
  ],
  templateUrl: './free-slide-sidebar.component.html',
  styleUrl: './free-slide-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideSidebarComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly freeSlideApi = inject(FreeSlideApiService);
  private readonly store = inject<Store<FreeSlideState>>(Store<FreeSlideState>);
  private readonly actions$ = inject(Actions);
  private readonly slideService = inject(FreeSlideService);
  private applyingLoadedSettings = false;

  slideTransitionEditor = viewChild(SlideTransitionEditorComponent);
  exportProgress = signal<PptxProgressState | null>(null);
  private cdr = inject(ChangeDetectorRef);

  openedCastingWindow$ = this.store.select(selectOpenedWindow).pipe(
    map((e) => {
      return !!e;
    })
  );
  castingIsPaused$ = this.store.select(selectFreeSlideCastingPaused);
  castingIsFrozen$ = this.store.select(selectFreeSlideCastingFrozen);
  liveSyncEnabled$ = this.slideService.liveSyncEnabled$.asObservable();

  onLiveSyncToggle(event: any) {
    const isEnabled = !!event.checked;
    this.slideService.toggleLiveSync(isEnabled);

    if (isEnabled) {
      this.slideService.requestSaveCurrentSlide$.next();
    }
  }

  onStartCasting() {
    // Listen for the save to complete, then proceed with casting
    this.slideService.saveCompleted$.pipe(take(1)).subscribe(() => {
      this.store
        .select(selectFreeSlideSelected)
        .pipe(filterEmpty(), take(1))
        .subscribe((slide) => {
          // Get the latest slides data from the service
          const currentSlides = this.slideService.slides$.value;

          this.store.dispatch(
            FreeSlideActions[FreeSlideActionsEnum.openCasting]({
              slideId: slide.id,
              slides: currentSlides,
              fromIndex: slide.index,
            })
          );
        });

      // this.actions$.pipe(ofType(FreeSlideActions[FreeSlideActionsEnum.openCasting])).pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      //   console.log('openedPage?');
      // })
      // this.store.select(selectFreeSlideCastingStarted).pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      //   console.log('started?');
      //   const transitionEditor = this.slideTransitionEditor();
      //   if (transitionEditor) {
      //     transitionEditor.transitionForm.updateValueAndValidity();
      //   }
      // })
    });

    // Request the current slide to be saved
    this.slideService.requestSaveCurrentSlide$.next();
  }

  onStopCasting() {
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.stopCasting]());
  }

  onCloseCasting() {
    this.store.dispatch(
      AppActions.closeWindow({
        windowType: AppWindowTypes.CASTING,
      })
    );
  }

  onPauseCasting() {
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.pauseCasting]());
  }

  onFreezeToggle(event: any) {
    const frozen = !!event.checked;
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.setFreezeCasting]({ frozen }));
  }

  private readonly pptxFacade = inject(PptxFacadeService);

  async onExportPptx() {
    let presentationName = 'Presentation';
    this.slideService.currentPresentation$.pipe(take(1)).subscribe((pres: any) => {
      if (pres && pres.title) presentationName = pres.title;
    });

    this.exportProgress.set({
      busy: true,
      fileName: presentationName,
      percent: 10,
      message: 'Подготовка к экспорту...',
      steps: [
        { label: 'Чтение данных', status: 'active' },
        { label: 'Подготовка слайдов', status: 'pending' },
        { label: 'Экспорт PPTX', status: 'pending' },
      ],
    });
    this.cdr.markForCheck();

    try {
      const saveCompleted = firstValueFrom(
        this.slideService.saveCompleted$.pipe(
          take(1),
          timeout(3000),
          catchError(() => of(undefined))
        )
      );
      this.slideService.requestSaveCurrentSlide$.next();
      await saveCompleted;

      this.exportProgress.update(prev => prev ? {
        ...prev,
        percent: 30,
        message: 'Обработка слайдов...',
        steps: [
          { label: 'Чтение данных', status: 'done' },
          { label: 'Подготовка слайдов', status: 'active' },
          { label: 'Экспорт PPTX', status: 'pending' },
        ]
      } : prev);

      const slides = Array.from(this.slideService.slidesMap.values());
      const states = slides
        .sort((a, b) => a.index - b.index)
        .map(slide => JSON.parse(slide.content));

      this.exportProgress.update(prev => prev ? {
        ...prev,
        percent: 60,
        message: 'Генерация файла презентации (это может занять некоторое время)...',
        steps: [
          { label: 'Чтение данных', status: 'done' },
          { label: 'Подготовка слайдов', status: 'done' },
          { label: 'Экспорт PPTX', status: 'active' },
        ]
      } : prev);

      const blob = await firstValueFrom(this.pptxFacade.exportPptx(presentationName, states));
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${presentationName}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 5000);

      this.exportProgress.update(prev => prev ? {
        ...prev,
        busy: false,
        percent: 100,
        message: 'Экспорт завершён',
        steps: [
          { label: 'Чтение данных', status: 'done' },
          { label: 'Подготовка слайдов', status: 'done' },
          { label: 'Экспорт PPTX', status: 'done' },
        ]
      } : prev);

      setTimeout(() => {
        this.closeExportProgress();
      }, 700);

    } catch (err) {
      console.error('Failed to export PPTX', err);
      this.exportProgress.update(prev => prev ? {
        ...prev,
        busy: false,
        percent: 100,
        message: 'Экспорт завершился с ошибкой',
        steps: prev.steps.map(s => s.status === 'active' ? { ...s, status: 'error' } : s)
      } : prev);
    }
  }

  closeExportProgress() {
    const current = this.exportProgress();
    if (current && !current.busy) {
      this.exportProgress.set(null);
      this.cdr.markForCheck();
    }
  }

  ngOnInit(): void {
    this.slideService.currentPresentation$
      .pipe(
        filter((p: any) => !!p?.id),
        first()
      )
      .subscribe((p: any) => {
      this.freeSlideApi
        .getTransitionSettings(p.id)
        .pipe(
          first(),
          catchError(() => of({}))
        )
        .subscribe((settings: any) => {
          // Применяем настройки из БД и игнорируем автосохранение на это время
          this.applyingLoadedSettings = true;
          const gt = settings?.globalTransition;
          if (gt) {
            this.store.dispatch(
              FreeSlideActions[FreeSlideActionsEnum.setGlobalTransition]({ transition: gt })
            );
            const editor = this.slideTransitionEditor?.();
            if (editor && editor.useGlobalTransition && editor.transitionForm) {
              editor.transitionForm.patchValue({
                type: gt.type,
                duration: gt.duration,
                easing: gt.easing,
                delay: gt.delay || 0,
              }, { emitEvent: false });
            }
          }
          const st = settings?.slideTransitions;
          if (st && typeof st === 'object') {
            for (const key of Object.keys(st)) {
              this.store.dispatch(
                FreeSlideActions[FreeSlideActionsEnum.setSlideTransition]({ slideId: key, transition: st[key] })
              );
            }
          }
          // Определяем режим редактора и патчим форму для отображения значений
          const editor = this.slideTransitionEditor?.();
          if (editor && editor.transitionForm) {
            const hasGlobal = !!gt && gt.type !== 'none';
            if (hasGlobal) {
              editor.useGlobalTransition = true;
              editor.transitionForm.patchValue({
                type: gt.type,
                duration: gt.duration,
                easing: gt.easing,
                delay: gt.delay || 0,
              }, { emitEvent: false });
            } else if (st && typeof st === 'object') {
              this.store.select(selectFreeSlideSelected).pipe(first()).subscribe((sel: any) => {
                const t = sel?.id ? st[sel.id] : undefined;
                if (t) {
                  editor.useGlobalTransition = false;
                  editor.transitionForm.patchValue({
                    type: t.type,
                    duration: t.duration,
                    easing: t.easing,
                    delay: t.delay || 0,
                  }, { emitEvent: false });
                }
              });
            }
          }
          // Снимаем флаг после применения (микрозадача, чтобы actions$ успел обработать очереди)
          setTimeout(() => { this.applyingLoadedSettings = false; }, 0);
        });
    });

    this.actions$
      .pipe(
        ofType(
          FreeSlideActions[FreeSlideActionsEnum.setGlobalTransition],
          FreeSlideActions[FreeSlideActionsEnum.setSlideTransition]
        ),
        debounceTime(500),
        withLatestFrom(
          this.store.select(selectGlobalTransition),
          this.store.select(selectSlideTransitions),
          this.slideService.currentPresentation$
        ),
        filter(([_, __gt, __st, pres]) => !this.applyingLoadedSettings && !!pres?.id),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(([__, globalTransition, slideTransitions, pres]: any) => {
        if (!pres?.id) return;
        const payload = {
          globalTransition,
          slideTransitions: slideTransitions instanceof Map ? Object.fromEntries(slideTransitions.entries()) : slideTransitions,
        };
        this.freeSlideApi
          .setTransitionSettings(pres.id, payload)
          .pipe(first())
          .subscribe();
      });
  }
}
