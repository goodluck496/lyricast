import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

import { TabsModule } from 'primeng/tabs';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { HistoryService } from '../services/history.service';
import { NavigatorHistoryComponent } from '../components';
import { TourAnchorPrimeNgDirective } from 'ngx-ui-tour-primeng';

@Component({
  selector: 'lyri-navigator-feature',
  standalone: true,
  imports: [
    TabsModule,
    NgScrollbarModule,
    NavigatorHistoryComponent,
    TourAnchorPrimeNgDirective,
  ],
  templateUrl: './navigator-feature.component.html',
  styleUrl: './navigator-feature.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigatorFeatureComponent {
  elRef = inject(ElementRef);

  historyService = inject(HistoryService);

  feature = input.required();
  activeTab = signal<string | number>('history');
}
