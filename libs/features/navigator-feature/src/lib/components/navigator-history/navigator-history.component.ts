import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Listbox, ListboxModule } from 'primeng/listbox';
import { HistoryItem, HistoryType } from '../../services/history.types';
import { FormsModule } from '@angular/forms';
import { HistoryService } from '../../services/history.service';
import { delay, Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from 'primeng/button';

@Component({
  selector: 'lyri-navigator-history',
  standalone: true,
  imports: [CommonModule, ListboxModule, FormsModule, Button],
  templateUrl: './navigator-history.component.html',
  styleUrl: './navigator-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigatorHistoryComponent {
  historyService = inject(HistoryService);

  historyItems: Observable<HistoryItem[]> = this.historyService.getAll();
  selectedHistory?: HistoryItem;

  listboxRef: Signal<Listbox> = viewChild.required('listboxRef');

  constructor() {
    this.historyItems
      .pipe(takeUntilDestroyed(), delay(550))
      .subscribe((data: HistoryItem[]) => {
        this.listboxRef().scrollInView(data.length - 1);
      });
  }

  onChange() {
    if (!this.selectedHistory) {
      return;
    }

    this.historyService.selectHistoryItem(this.selectedHistory);
  }
}
