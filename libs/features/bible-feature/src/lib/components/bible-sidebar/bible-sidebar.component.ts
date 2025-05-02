import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BibleCastingPreviewComponent } from '../casting-preview/bible-casting-preview.component';
import { ButtonDirective } from 'primeng/button';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import {
  BibleActions,
  BibleState,
  selectCastingPaused,
  selectSelectedBibleVerse,
  selectSelectedChapterSections,
} from '@lyri-cast/bible-store';
import { Router } from '@angular/router';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { Store } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { map, Observable, take, withLatestFrom } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { BibleBookTitle, BibleChapterSection } from '@lyri-cast/entities';
import { selectOpenedWindow, SidebarService } from '@lyri-cast/common-browser';
import { BibleSidebarData } from '../../types';
import { SvgIconComponent } from '@lyri-cast/svg-icons';

@Component({
  selector: 'lyri-bible-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    BibleCastingPreviewComponent,
    ButtonDirective,
    NavigatorFeatureComponent,
    SvgIconComponent,
  ],
  templateUrl: './bible-sidebar.component.html',
  styleUrl: './bible-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleSidebarComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);
  private readonly apiSrv = inject(BibleApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  private readonly actions$ = inject(Actions);
  private readonly sidebarService =
    inject<SidebarService<BibleSidebarData>>(SidebarService);

  windowHasClose$ = this.store
    .select(selectOpenedWindow)
    .pipe(map((data) => !data));
  castingIsPaused$ = this.store.select(selectCastingPaused);
  sectionList$: Observable<BibleChapterSection[]> = this.store.select(
    selectSelectedChapterSections
  );

  onStartCasting() {
    this.store
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
      });
  }

  onStopCasting() {
    this.store.dispatch(BibleActions.stopCasting());
  }

  onPauseCasting() {
    this.store.dispatch(BibleActions.pauseCasting());
  }
}
