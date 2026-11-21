import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
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
export class NavigatorFeatureComponent implements OnInit {
  elRef = inject(ElementRef);

  historyService = inject(HistoryService);

  feature = input.required();
  hasSecondaryTranslation = input(false);
  activeTab = signal<string | number>('history');

  ngOnInit() {
    if (this.hasSecondaryTranslation()) {
      this.activeTab.set('secondary');
    }
  }
}
