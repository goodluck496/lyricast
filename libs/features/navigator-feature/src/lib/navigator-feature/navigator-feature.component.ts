import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
} from '@angular/core';

import { TabsModule } from 'primeng/tabs';
import { HistoryService } from '../services/history.service';
import { NavigatorHistoryComponent } from '../components';

@Component({
  selector: 'lyri-navigator-feature',
  standalone: true,
  imports: [TabsModule, NavigatorHistoryComponent],
  templateUrl: './navigator-feature.component.html',
  styleUrl: './navigator-feature.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigatorFeatureComponent {
  elRef = inject(ElementRef);

  historyService = inject(HistoryService);
}
