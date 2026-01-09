import {
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterModule,
} from '@angular/router';
import { MenuItem } from 'primeng/api';

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
  UserSettingsService,
} from '@lyri-cast/common-browser';
import { SnowfallManager } from '../services/common/snowfall.service';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthOverlayComponent } from './auth/auth-overlay.component';

@Component({
  standalone: true,
  imports: [RouterModule, SplashScreenComponent, AuthOverlayComponent],
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
  snowfall = inject(SnowfallManager);
  userSettings = inject(UserSettingsService);

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
    effect(
      () => {
        if (!this.loadingStatusService.isInitialLoading()) {
          this.isLoading.set(false);
        }
      },
    );
  }

  ngOnInit() {
    // Fallback: if initial data loading never completes (e.g. worker not started),
    // unblock UI so user can navigate to Settings and see errors.
    setTimeout(() => {
      if (this.loadingStatusService.isInitialLoading()) {
        this.loadingStatusService.finishInitialLoading();
        this.isLoading.set(false);
        this.cdr.detectChanges();
      }
    }, 8000);

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd
        ),
        take(1)
      )
      .subscribe((event: NavigationEnd) => {
        const isBibleFeature = event.urlAfterRedirects.includes(
          Pages.BIBLE_FEATURE
        );
        const isCastingPage = event.urlAfterRedirects.includes(Pages.CASTING);

        if (isCastingPage || !isBibleFeature) {
          this.isLoading.set(false);
        }

        if (event.urlAfterRedirects === '/') {
          this.onGo();
        }
      });

    this.settingsSrv.init();

    this.userSettings
      .loadAndApplyAppearance()
      .then((settings) => {
        if (settings && typeof settings.snowEnabled === 'boolean') {
          this.snowfall.setEnabled(settings.snowEnabled);
        }

        this.snowfall.ensureRunning();
      })
      .catch(() => {
        this.snowfall.ensureRunning();
      });

    this.store
      .select(selectAppInit)
      .subscribe(() => console.log('selectAppInit'));

    this.store.dispatch(AppActions.appInit());
  }

  onGo(url: string = ['/', Pages.MAIN, Pages.BIBLE_FEATURE].join('/')) {
    this.router.navigateByUrl(url);
  }
}
