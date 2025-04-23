import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabViewModule } from 'primeng/tabview';
import { HistoryService } from '../services/history.service';
import { HistoryItem } from '../services/history.types';
import { NavigatorHistoryComponent } from '../components';

@Component({
  selector: 'lyri-navigator-feature',
  standalone: true,
  imports: [CommonModule, TabViewModule, NavigatorHistoryComponent],
  templateUrl: './navigator-feature.component.html',
  styleUrl: './navigator-feature.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigatorFeatureComponent {
  historyService = inject(HistoryService);


  constructor() {

    this.historyService.getAll().subscribe((historyItems: HistoryItem[]) => {
      console.log('historyItems', historyItems);
    })
  }
}
