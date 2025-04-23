import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  Injector,
  OnInit,
} from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { TabViewModule } from 'primeng/tabview';

import { MenuItem, PrimeTemplate } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';
import {
  MainComponentService,
  PAGE_CONTAINER_TEMPLATES,
  Pages,
  PageTitlesMap,
  SidebarService,
} from '@lyri-cast/common-browser';
import { HttpClient } from '@angular/common/http';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  catchError,
  filter,
  first,
  Observable,
  of,
  switchMap,
  timer,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchFeatureComponent } from '@lyri-cast/search-feature';
import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { ComponentType } from '@angular/cdk/portal';
import { MatIcon } from '@angular/material/icon';

// import lyricSvg from '@styles/assets/icons/song-lyrics.svg';

@Component({
  selector: 'lyri-main-page',
  standalone: true,
  imports: [
    RouterOutlet,
    TabViewModule,
    PrimeTemplate,
    TabMenuModule,
    ProgressSpinnerModule,
    SearchFeatureComponent,
    NgTemplateOutlet,
    MatIcon,
    AsyncPipe,
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainComponent implements OnInit {
  cdr = inject(ChangeDetectorRef);
  route = inject(ActivatedRoute);
  router = inject(Router);
  http = inject(HttpClient);
  destroyRef = inject(DestroyRef);
  BASE_API_TOKEN = inject(BASE_API_TOKEN);

  mainCompService = inject(MainComponentService);

  activePage?: MenuItem;

  pages: MenuItem[] = [
    {
      routerLink: ['./', Pages.BIBLE_FEATURE, Pages.BIBLE],
      label: PageTitlesMap.get(Pages.BIBLE) ?? Pages.BIBLE,
      icon: 'bible-icon',
    },
    {
      routerLink: ['./', Pages.SONGS_FEATURE, Pages.SONGS],
      label: PageTitlesMap.get(Pages.SONGS) ?? Pages.SONGS,
      // icon: 'pi-volume-up'
      icon: 'song-lyric-icon',
    },
    {
      routerLink: ['./', Pages.PROGRAMS],
      label: PageTitlesMap.get(Pages.PROGRAMS) ?? Pages.PROGRAMS,
      disabled: true,
      icon: 'programs-icon',
    },
    {
      routerLink: ['./', Pages.SETTINGS],
      label: PageTitlesMap.get(Pages.SETTINGS) ?? Pages.SETTINGS,
      icon: 'settings-icon',
    },
    // {
    //   routerLink: ['./', Pages.TEST],
    //   label: PageTitlesMap.get(Pages.TEST) || Pages.TEST,
    // },
  ];

  backendReady = false;

  ngOnInit() {
    this.cdr.detectChanges();

    this.router.events
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter((e) => e instanceof NavigationEnd)
      )
      .subscribe(() => {
        window.dispatchEvent(new Event('resize'));
      });

    this.repeatCheckBackend().subscribe((res) => {
      this.backendReady = !!res;
      if (this.backendReady) {
        this.cdr.detectChanges();
      }
    });
  }

  onChangeTabs(tab: any) {
    this.activePage = tab;
    this.cdr.detectChanges();
  }

  getBackendReady(): Observable<boolean | null> {
    return this.http
      .get<boolean>(`${this.BASE_API_TOKEN}/ready`)
      .pipe(catchError(() => of(null)));
  }

  repeatCheckBackend(): Observable<boolean | null> {
    return timer(0, 2000).pipe(
      // Запускаем немедленно, затем каждые 2 секунды
      switchMap(() => this.getBackendReady()),
      first((response) => !!response) // Останавливаем на успешном ответе
    );
  }

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
}
