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
  SettingsService,
} from '@lyri-cast/common-browser';
import { AsyncPipe } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  standalone: true,
  imports: [
    RouterModule,
    TabMenuModule,
    TabViewModule,
    AsyncPipe,
    ButtonDirective,
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

  firstRun = false;

  isNotCastingPage$ = this.router.events.pipe(
    filter((route) => route instanceof NavigationEnd),
    map((data) => !data.url.includes(Pages.CASTING))
  );

  constructor(iconRegistry: MatIconRegistry, sanitizer: DomSanitizer) {
    iconRegistry.addSvgIcon(
      'song-lyric-icon',
      sanitizer.bypassSecurityTrustResourceUrl('/assets/icons/song-lyrics.svg')
    );
    iconRegistry.addSvgIcon('bible-icon', sanitizer.bypassSecurityTrustResourceUrl('/assets/icons/bible.svg'))
    iconRegistry.addSvgIcon('settings-icon', sanitizer.bypassSecurityTrustResourceUrl('/assets/icons/control.svg'))
    iconRegistry.addSvgIcon('programs-icon', sanitizer.bypassSecurityTrustResourceUrl('/assets/icons/storyboard.svg'))
  }

  ngOnInit() {
    this.isNotCastingPage$.pipe(filter(() => !this.firstRun)).subscribe(() => {
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
    });

    this.settingsSrv.init();

    this.store
      .select(selectAppInit)
      .subscribe(() => console.log('selectAppInit'));

    this.store.dispatch(AppActions.appInit());
  }

  onGo(url: string = ['/', Pages.MAIN, Pages.BIBLE_FEATURE].join('/')) {
    this.firstRun = true;
    this.router.navigateByUrl(url);
  }
}
