import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import { BibleState } from '@lyri-cast/bible-store';
import { Router } from '@angular/router';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { Store } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { map, take } from 'rxjs';
import { selectOpenedWindow, SidebarService, AppActions } from '@lyri-cast/common-browser';
import { AppWindowTypes } from '@lyri-cast/common-electron';

import { SvgIconComponent } from '@lyri-cast/svg-icons';
import { FreeSlideCastingPreviewComponent } from '../casting-preview/free-slide-casting-preview.component';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  selectFreeSlideCastingPaused,
  selectFreeSlideSelected,
} from '@lyri-cast/free-slide-store';
import { FreeSlideService } from '../../pages/free-slide-page/free-slide.service';
import { filterEmpty } from '@lyri-cast/common';

@Component({
  selector: 'lyri-free-slide-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    NavigatorFeatureComponent,
    SvgIconComponent,
    FreeSlideCastingPreviewComponent,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  private readonly actions$ = inject(Actions);
  private readonly sidebarService = inject<SidebarService<any>>(SidebarService);
  private slideService = inject(FreeSlideService);

  openedCastingWindow$ = this.store
    .select(selectOpenedWindow)
    .pipe(
      map((e) => {
        console.log('openedCastingWindow$', e, !!e);
        return !!e;
      })
    );
  castingIsPaused$ = this.store.select(selectFreeSlideCastingPaused);

  onStartCasting() {
    console.log('[Sidebar] Starting casting...');
    // Запрашиваем сохранение текущего слайда перед трансляцией
    this.slideService.requestSaveCurrentSlide$.next();

    // Даём время на сохранение, затем запускаем трансляцию
    setTimeout(() => {
      this.store
        .select(selectFreeSlideSelected)
        .pipe(filterEmpty(), take(1))
        .subscribe((slide) => {
          // Получаем актуальные данные слайдов из сервиса
          const currentSlides = this.slideService.slides$.value;

          console.log('[Sidebar] Selected slide:', slide);
          console.log('[Sidebar] Total slides:', currentSlides.length);
          console.log('[Sidebar] Slide htmlString length:', slide.htmlString?.length);

          this.store.dispatch(
            FreeSlideActions[FreeSlideActionsEnum.openCasting]({
              slideId: slide.id,
              slides: currentSlides,
              fromIndex: slide.index,
            })
          );
        });
    }, 50);

    /*this.store
      .select(selectSelectedBibleVerse)
      .pipe(
        take(1),
        filterEmpty(),
        withLatestFrom(this.sectionList$, this.sidebarService.data$)
      )
      .subscribe(([verse, sections, sidebarData]) => {
        if (!sidebarData || !sidebarData.bibleForm) {
          return;
        }
        const groupValue = sidebarData.bibleForm;

        if (groupValue.book && groupValue.chapter && sections.length) {
          this.store.dispatch(
            BibleActions.openCasting({
              book: groupValue.book.baseEntity,
              chapter: groupValue.chapter.baseEntity,
              fromIndex: verse.number,
              content: sections[0].content.map((el) => {
                return {
                  ...el,
                  text: [el.text],
                  bookTitle: groupValue?.book?.baseEntity
                    ?.title as BibleBookTitle,
                };
              }),
            })
          );
        }
      });*/
  }

  onStopCasting() {
    console.log('onStopCasting called');
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.stopCasting]());
    // Закрываем окно кастинга
    this.store.dispatch(AppActions.closeWindow({
      windowType: AppWindowTypes.CASTING,
    }));
  }

  onPauseCasting() {
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.pauseCasting]());
  }
}
