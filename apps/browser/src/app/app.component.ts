import { ChangeDetectorRef, Component, effect, inject, OnInit, signal } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterModule,
} from '@angular/router';
import { MenuItem } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';
import { TabViewModule } from 'primeng/tabview';
import { filter, map, take } from 'rxjs';
import { Store } from '@ngrx/store';
import {
  AppActions,
  BridgeService,
  LoadingStatusService,
  Pages,
  PageTitlesMap,
  selectAppInit,
  SettingsService,
} from '@lyri-cast/common-browser';
import { AsyncPipe } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  standalone: true,
  imports: [
    RouterModule,
    TabMenuModule,
    TabViewModule,
    AsyncPipe,
    ButtonDirective,
    SplashScreenComponent,
  ],
  selector: 'lyri-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  //не удалять
  bridge = inject(BridgeService);
  store = inject(Store);
  settingsSrv = inject(SettingsService);
  loadingStatusService = inject(LoadingStatusService);

  cdr = inject(ChangeDetectorRef);
  route = inject(ActivatedRoute);
  router = inject(Router);

  isLoading = signal(true);


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
    filter((route) => route instanceof NavigationEnd),
    map((data) => !data.url.includes(Pages.CASTING))
  );
  $isNotCastingPage = toSignal(this.isNotCastingPage$);

  constructor() {
    effect(() => {
      if (!this.loadingStatusService.isInitialLoading()) {
        this.isLoading.set(false);
      }
    }, {allowSignalWrites: true});
  }

  ngOnInit() {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      take(1)
    ).subscribe((event: NavigationEnd) => {
      const isBibleFeature = event.urlAfterRedirects.includes(Pages.BIBLE_FEATURE);
      const isCastingPage = event.urlAfterRedirects.includes(Pages.CASTING);

      if (isCastingPage || !isBibleFeature) {
        this.isLoading.set(false);
      }
    });

    const isRoot = this.router.isActive('/', {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
    if (isRoot) {
      this.onGo();
    } else {
      this.onGo(this.router.url);
    }

    this.settingsSrv.init();

    this.store
      .select(selectAppInit)
      .subscribe(() => console.log('selectAppInit'));

    this.store.dispatch(AppActions.appInit());
  }

  onGo(url: string = ['/', Pages.MAIN, Pages.BIBLE_FEATURE].join('/')) {
    this.router.navigateByUrl(url);
  }
}
