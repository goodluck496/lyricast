import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import { BibleState } from '@lyri-cast/bible-store';
import { Router } from '@angular/router';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { map, take, debounceTime, combineLatest, first } from 'rxjs';
import {
  AppActions,
  selectOpenedWindow,
  SidebarService,
} from '@lyri-cast/common-browser';
import { AppWindowTypes } from '@lyri-cast/common-electron';

import { SvgIconComponent } from '@lyri-cast/svg-icons';
import { FreeSlideCastingPreviewComponent } from '../casting-preview/free-slide-casting-preview.component';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  selectFreeSlideCastingPaused,
  selectFreeSlideCastingStarted,
  selectFreeSlideSelected,
  selectGlobalTransition,
  selectSlideTransitions,
} from '@lyri-cast/free-slide-store';
import { FreeSlideService } from '../../pages/free-slide-page/free-slide.service';
import { filterEmpty } from '@lyri-cast/common';
import { FreeSlideApiService } from '@lyri-cast/free-slide';

import { ToggleButtonModule } from 'primeng/togglebutton';
import { FormsModule } from '@angular/forms';
import { ToggleButtonChangeEvent } from 'primeng/togglebutton/togglebutton.interface';
import { TabViewModule } from 'primeng/tabview';
import { SlideTransitionEditorComponent } from '../slide-transition-editor/slide-transition-editor.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
    TabViewModule,
    SlideTransitionEditorComponent,
  ],
  templateUrl: './free-slide-sidebar.component.html',
  styleUrl: './free-slide-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideSidebarComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);
  private readonly apiSrv = inject(BibleApiService);
  private readonly freeSlideApi = inject(FreeSlideApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  private readonly actions$ = inject(Actions);
  private readonly sidebarService = inject<SidebarService<any>>(SidebarService);
  private readonly slideService = inject(FreeSlideService);

  slideTransitionEditor = viewChild(SlideTransitionEditorComponent);

  openedCastingWindow$ = this.store.select(selectOpenedWindow).pipe(
    map((e) => {
      return !!e;
    })
  );
  castingIsPaused$ = this.store.select(selectFreeSlideCastingPaused);
  liveSyncEnabled$ = this.slideService.liveSyncEnabled$.asObservable();

  onLiveSyncToggle(event: ToggleButtonChangeEvent) {
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
    // Закрываем окно кастинга
    this.store.dispatch(
      AppActions.closeWindow({
        windowType: AppWindowTypes.CASTING,
      })
    );
  }

  onPauseCasting() {
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.pauseCasting]());
  }

  ngOnInit(): void {
    this.slideService.currentPresentation$.pipe(first()).subscribe((p: any) => {
      if (!p?.id) return;
      this.freeSlideApi.getTransitionSettings(p.id).pipe(first()).subscribe((settings: any) => {
        const gt = settings?.globalTransition;
        if (gt) {
          this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.setGlobalTransition]({ transition: gt }));
        }
        const st = settings?.slideTransitions;
        if (st && typeof st === 'object') {
          for (const key of Object.keys(st)) {
            this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.setSlideTransition]({ slideId: key, transition: st[key] }));
          }
        }
      });
    });

    combineLatest([
      this.store.select(selectGlobalTransition),
      this.store.select(selectSlideTransitions),
      this.slideService.currentPresentation$,
    ])
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(([globalTransition, slideTransitions, pres]: any) => {
        if (!pres?.id) return;
        const payload = {
          globalTransition,
          slideTransitions: slideTransitions instanceof Map ? Object.fromEntries(slideTransitions.entries()) : slideTransitions,
        };
        this.freeSlideApi.setTransitionSettings(pres.id, payload).pipe(first()).subscribe();
      });
  }
}
