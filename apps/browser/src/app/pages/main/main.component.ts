import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { TabViewModule } from 'primeng/tabview';

import { MenuItem, PrimeTemplate } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';
import { Pages, PageTitlesMap } from '@lyri-cast/common-browser';

@Component({
  selector: 'lyri-main-page',
  standalone: true,
  imports: [RouterOutlet, TabViewModule, PrimeTemplate, TabMenuModule],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainComponent implements OnInit {
  cdr = inject(ChangeDetectorRef);
  route = inject(ActivatedRoute);

  activePage?: MenuItem;

  pages: MenuItem[] = [
    {
      routerLink: ['./', Pages.BIBLE],
      label: PageTitlesMap.get(Pages.BIBLE) || Pages.BIBLE,
    },
    {
      routerLink: ['./', Pages.SONGS_NEW],
      label: PageTitlesMap.get(Pages.SONGS_NEW) || Pages.SONGS_NEW,
    },
    {
      routerLink: ['./', Pages.PROGRAMS],
      label: PageTitlesMap.get(Pages.PROGRAMS) || Pages.PROGRAMS,
    },
    {
      routerLink: ['./', Pages.TEST],
      label: PageTitlesMap.get(Pages.TEST) || Pages.TEST,
    },
  ];

  ngOnInit() {
    this.cdr.detectChanges();
  }
}
