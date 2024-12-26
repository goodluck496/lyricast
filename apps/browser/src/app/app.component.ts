import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterModule,
} from '@angular/router';
import { BridgeService } from '../services/bridge.service';
import { CastingService } from '../services/casting.service';
import { MenuItem, PrimeTemplate } from 'primeng/api';
import { Pages, PageTitlesMap } from './pages/page.types';
import { TabMenuModule } from 'primeng/tabmenu';
import { TabViewModule } from 'primeng/tabview';
import { filter, map, tap } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { SongsApiService } from '../services/songs-api.service';

@Component({
  standalone: true,
  imports: [
    RouterModule,
    PrimeTemplate,
    TabMenuModule,
    TabViewModule,
    AsyncPipe,
  ],
  selector: 'lyri-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  //не удалять
  bridge = inject(BridgeService);
  casting = inject(CastingService);
  // songApiService =  inject(SongsApiService);

  cdr = inject(ChangeDetectorRef);
  route = inject(ActivatedRoute);
  router = inject(Router);

  activePage?: MenuItem;

  pages: MenuItem[] = [
    {
      routerLink: ['./', Pages.BIBLE],
      label: PageTitlesMap.get(Pages.BIBLE) || Pages.BIBLE,
    },
    {
      routerLink: ['./', Pages.SONGS],
      label: PageTitlesMap.get(Pages.SONGS) || Pages.SONGS,
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

  isNotCastingPage$ = this.router.events.pipe(
    // tap((v) => console.log('route', this.route, v)),
    filter((route) => route instanceof NavigationEnd),
    map((data) => !data.url.includes(Pages.CASTING))
  );

  ngOnInit() {
    this.isNotCastingPage$.subscribe();
  }
}
