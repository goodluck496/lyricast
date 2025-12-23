import {
  ChangeDetectionStrategy,
  Component,
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
  selectSelectedVersesRange,
} from '@lyri-cast/bible-store';
import { Store } from '@ngrx/store';
import { map, Observable, take, withLatestFrom } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { BibleBookTitle, BibleChapterSection } from '@lyri-cast/entities';
import { AppActions, selectOpenedWindow, SidebarService } from '@lyri-cast/common-browser';
import { BibleSidebarData } from '../../types';
import { SvgIconComponent } from '@lyri-cast/svg-icons';
import { AppWindowTypes } from '@lyri-cast/common-electron';

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
  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  private readonly sidebarService =
    inject<SidebarService<BibleSidebarData>>(SidebarService);

  openedCastingWindow$ = this.store.select(selectOpenedWindow).pipe(map((e) => !!e));
  castingIsPaused$ = this.store.select(selectCastingPaused);
  sectionList$: Observable<BibleChapterSection[]> = this.store.select(
    selectSelectedChapterSections
  );
  selectedRange$ = this.store.select(selectSelectedVersesRange);

  onStartCasting() {
    this.store
      .select(selectSelectedBibleVerse)
      .pipe(
        take(1),
        filterEmpty(),
        withLatestFrom(this.sectionList$, this.sidebarService.data$, this.selectedRange$)
      )
      .subscribe(([verse, sections, sidebarData, range]) => {
        if (!sidebarData || !sidebarData.bibleForm) {
          return;
        }
        const groupValue = sidebarData.bibleForm;

        if (groupValue.book && groupValue.chapter && sections.length) {
          const fromNumber = range?.from ?? verse.number;
          const toNumber = range?.to ?? verse.number;

          this.store.dispatch(
            BibleActions.openCasting({
              book: groupValue.book.baseEntity,
              chapter: groupValue.chapter.baseEntity,
              fromIndex: fromNumber,
              range: range ? { from: fromNumber, to: toNumber } : undefined,
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

  onCloseCasting() {
    this.store.dispatch(
      AppActions.closeWindow({
        windowType: AppWindowTypes.CASTING,
      })
    );
  }
}
