import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import {
  catchError,
  BehaviorSubject,
  combineLatest,
  debounceTime,
  filter,
  first,
  firstValueFrom,
  map,
  Observable,
  of,
  skip,
  take,
  withLatestFrom,
} from 'rxjs';
import {
  AppActions,
  BridgeService,
  DEFAULT_CASTING_PAGE_CONFIG,
  Pages,
  selectOpenedWindow,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';

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

import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { FormsModule } from '@angular/forms';
import { TabsModule } from 'primeng/tabs';
import { SlideTransitionEditorComponent } from '../slide-transition-editor/slide-transition-editor.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SplitButtonModule } from 'primeng/splitbutton';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'lyri-free-slide-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    NavigatorFeatureComponent,
    FreeSlideCastingPreviewComponent,
    ToggleSwitchModule,
    FormsModule,
    TabsModule,
    SlideTransitionEditorComponent,
    SplitButtonModule,
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
  private readonly windowSrv = inject(WindowService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly bridge = inject(BridgeService);
  private applyingLoadedSettings = false;

  slideTransitionEditor = viewChild(SlideTransitionEditorComponent);

  openedCastingWindow$ = this.store.select(selectOpenedWindow).pipe(
    map((e) => {
      return !!e;
    })
  );
  castingIsPaused$ = this.store.select(selectFreeSlideCastingPaused);
  castingIsFrozen$ = this.store.select(selectFreeSlideCastingFrozen);
  liveSyncEnabled$ = this.slideService.liveSyncEnabled$.asObservable();
  isOpeningWindow = new BehaviorSubject<boolean>(false);

  closeMenuItems$: Observable<MenuItem[]> = combineLatest([
    this.openedCastingWindow$,
    this.isOpeningWindow,
  ]).pipe(
    map(([isOpen, isOpening]) => [
      {
        label: isOpening ? 'Открываем...' : 'Открыть окно',
        icon: isOpening ? 'pi pi-spin pi-spinner' : 'pi pi-external-link',
        command: () => this.onOpenEmptyWindow(),
        disabled: isOpen || isOpening,
      },
      {
        label: 'Закрыть',
        icon: 'pi pi-times',
        command: () => this.onCloseCasting(),
        disabled: !isOpen || isOpening,
      },
    ])
  );

  onLiveSyncToggle(isEnabled: boolean) {
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

  onFreezeToggle(frozen: boolean) {
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.setFreezeCasting]({ frozen }));
  }

  async onOpenEmptyWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron || this.isOpeningWindow.value) {
      return;
    }

    this.isOpeningWindow.next(true);
    try {
      await this.settingsSrv.init();
      const display = await firstValueFrom(this.settingsSrv.getDisplayForCasting());
      if (!display) {
        return;
      }

      this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.stopCasting]());

      const procId = await this.windowSrv.electronContext.openWindow({
        ...DEFAULT_CASTING_PAGE_CONFIG,
        display,
        title: 'Casting Window',
        type: AppWindowTypes.CASTING,
      });

      this.store.dispatch(AppActions.setProcId({ procId, pageType: AppWindowTypes.CASTING }));

      await firstValueFrom(
        this.bridge.queueEvents.pipe(
          skip(1),
          filter((event): event is { event: string; payload: unknown } => !!event && event.event === APP_COMMON_ACTIONS.appInit)
        )
      );

      await this.windowSrv.electronContext.send({
        event: APP_COMMON_ACTIONS.openPage,
        payload: { path: [Pages.FREE_SLIDE_FEATURE, Pages.CASTING] },
      });
    } finally {
      this.isOpeningWindow.next(false);
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
