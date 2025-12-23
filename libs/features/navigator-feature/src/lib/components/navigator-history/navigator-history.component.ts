import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListboxModule } from 'primeng/listbox';
import { HistoryItem, HistoryType } from '../../services/history.types';
import { FormsModule } from '@angular/forms';
import { HistoryService } from '../../services/history.service';
import { combineLatest, delay, map, Observable, startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GroupedHistoryItem, groupHistoryItems } from './helpers';
import { AccordionModule } from 'primeng/accordion';
import { IconsService, SvgIconComponent } from '@lyri-cast/svg-icons';
import { lyriSong } from '@lyri-cast/svg-icons/lyri-icons/lyri-song.icon';
import { lyriOpenedBook } from '@lyri-cast/svg-icons/lyri-icons/lyri-opened-book.icon';
import { DomSanitizer } from '@angular/platform-browser';
import { NgScrollbar } from 'ngx-scrollbar';
import { EmptyStateComponent } from '@lyri-cast/ui-lib';
import { Store } from '@ngrx/store';
import { selectSelectedHistoryKey } from '../../store';

@Component({
  selector: 'lyri-navigator-history',
  standalone: true,
  imports: [
    CommonModule,
    ListboxModule,
    FormsModule,
    AccordionModule,
    SvgIconComponent,
    NgScrollbar,
    EmptyStateComponent,
  ],
  templateUrl: './navigator-history.component.html',
  styleUrl: './navigator-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigatorHistoryComponent {
  historyService = inject(HistoryService);
  private readonly store = inject(Store);

  historyItems: Observable<HistoryItem[]> = this.historyService.getAll();
  selectedHistoryKey$ = this.store.select(selectSelectedHistoryKey);

  groupedItems$: Observable<GroupedHistoryItem[]>;
  openedGroupKeys$: Observable<string[]>;

  constructor(iconService: IconsService, public sanitizer: DomSanitizer) {
    iconService.registerIcons([lyriSong, lyriOpenedBook]);


    this.groupedItems$ = this.historyItems.pipe(
      takeUntilDestroyed(),
      delay(0),
      map((items) => groupHistoryItems(items))
    );

    this.openedGroupKeys$ = combineLatest([
      this.groupedItems$,
      this.selectedHistoryKey$.pipe(startWith(null)),
    ]).pipe(
      map(([groups, selectedKey]) => {
        if (!selectedKey) {
          return [];
        }
        const group = groups.find((g) => {
          if (g.payload.key === selectedKey) return true;
          return (g.children ?? []).some((c) => c.payload.key === selectedKey);
        });
        return group ? [group.payload.key] : [];
      })
    );
  }

  onSelectHistoryItem(item: HistoryItem) {
    this.historyService.selectHistoryItem(item);
  }

  protected readonly HistoryType = HistoryType;
}
