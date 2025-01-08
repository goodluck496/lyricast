import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterModule,
} from '@angular/router';
import { MenuItem } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';
import { TabViewModule } from 'primeng/tabview';
import { filter, map } from 'rxjs';
import { Store } from '@ngrx/store';
import {
  AppActions,
  BridgeService,
  Pages,
  PageTitlesMap,
  selectAppInit,
} from '@lyri-cast/common-browser';

@Component({
  standalone: true,
  imports: [RouterModule, TabMenuModule, TabViewModule],
  selector: 'lyri-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  //не удалять
  bridge = inject(BridgeService);
  store = inject(Store);
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
    map(
      (data) =>
        !data.url.includes(Pages.CASTING) ||
        !data.url.includes(Pages.CASTING_NEW)
    )
  );

  ngOnInit() {
    this.isNotCastingPage$.subscribe();

    this.store
      .select(selectAppInit)
      .subscribe(() => console.log('selectAppInit'));

    this.store.dispatch(AppActions.appInit());

    /**
     * todo переделать на ngrx action + effect
     */
    // this.bridge.queueEvents.pipe().subscribe(async (data) => {
    //   if (!this.bridge.windowType) {
    //     this.bridge.windowType =
    //       await this.bridge.windowSrv.electronContext.getWindowType();
    //   }
    //
    //   console.log('events', data);
    //   if (!data) {
    //     return;
    //   }
    //   if (
    //     this.bridge.windowType !== AppWindowTypes.MAIN &&
    //     data.event === SONG_ACTIONS.openPage
    //   ) {
    //     console.log('route', data);
    //     const payload = data.payload as { name: string };
    //     this.router
    //       .navigate([Pages.SONGS_FEATURE, payload?.name])
    //       .then((d) => console.log('1111111111', d));
    //   }
    // });
  }
}
