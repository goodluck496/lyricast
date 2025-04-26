import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListboxModule } from 'primeng/listbox';
import { HistoryItem, HistoryType } from '../../services/history.types';
import { FormsModule } from '@angular/forms';
import { HistoryService } from '../../services/history.service';
import { delay, map, Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GroupedHistoryItem, groupHistoryItems } from './helpers';
import { AccordionModule } from 'primeng/accordion';
import { IconsService, SvgIconComponent } from '@lyri-cast/svg-icons';
import { lyriSong } from '@lyri-cast/svg-icons/lyri-icons/lyri-song.icon';
import { lyriOpenedBook } from '@lyri-cast/svg-icons/lyri-icons/lyri-opened-book.icon';
import { DomSanitizer } from '@angular/platform-browser';
import { NgScrollbar } from 'ngx-scrollbar';
import { EmptyStateComponent } from '@lyri-cast/ui-lib';

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

  historyItems: Observable<HistoryItem[]> = this.historyService.getAll();
  selectedHistory?: HistoryItem;

  groupedItems$: Observable<GroupedHistoryItem[]>;

  constructor(iconService: IconsService, public sanitizer: DomSanitizer) {
    iconService.registerIcons([lyriSong, lyriOpenedBook]);


    this.groupedItems$ = this.historyItems.pipe(
      takeUntilDestroyed(),
      delay(0),
      map((items) => groupHistoryItems(items))
    );
  }

  onSelectHistoryItem(item: HistoryItem) {
    this.historyService.selectHistoryItem(item);
  }

  protected readonly HistoryType = HistoryType;
}
