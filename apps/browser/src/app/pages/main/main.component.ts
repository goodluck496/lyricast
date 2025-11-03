import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { TabViewModule } from 'primeng/tabview';

import { TabMenuModule } from 'primeng/tabmenu';
import {
  MainComponentService,
  PAGE_CONTAINER_TEMPLATES,
  Pages,
  PageTitlesMap,
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
import { IconsService, SvgIconComponent } from '@lyri-cast/svg-icons';
import { MenuItem } from '../../types';
import { lyriBible } from '@lyri-cast/svg-icons/lyri-icons/lyri-bible.icon';
import { lyriControl } from '@lyri-cast/svg-icons/lyri-icons/lyri-control.icon';
import { lyriStoryboard } from '@lyri-cast/svg-icons/lyri-icons/lyri-storyboard.icon';
import { lyriSongLyrics } from '@lyri-cast/svg-icons/lyri-icons/lyri-song-lyrics.icon';
import { lyriOpenedBook } from '@lyri-cast/svg-icons/lyri-icons/lyri-opened-book.icon';
import { lyriGrid } from '@lyri-cast/svg-icons/lyri-icons/lyri-grid.icon';
import { lyriBulletList } from '@lyri-cast/svg-icons/lyri-icons/lyri-bullet-list.icon';

// import lyricSvg from '@styles/assets/icons/song-lyrics.svg';

@Component({
  selector: 'lyri-main-page',
  standalone: true,
  imports: [
    RouterOutlet,
    TabViewModule,
    TabMenuModule,
    ProgressSpinnerModule,
    SearchFeatureComponent,
    NgTemplateOutlet,
    AsyncPipe,
    SvgIconComponent,
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
  iconService = inject(IconsService);

  mainCompService = inject(MainComponentService);

  activePage?: MenuItem;

  pages: MenuItem[] = [
    {
      routerLink: ['./', Pages.BIBLE_FEATURE, Pages.BIBLE],
      label: PageTitlesMap.get(Pages.BIBLE) ?? Pages.BIBLE,
      icon: 'bible',
      visible: true,
    },
    {
      routerLink: ['./', Pages.SONGS_FEATURE, Pages.SONGS],
      label: PageTitlesMap.get(Pages.SONGS) ?? Pages.SONGS,
      // icon: 'pi-volume-up'
      icon: 'song_lyrics',
      visible: true,
    },
    {
      routerLink: ['./', Pages.FREE_SLIDE_FEATURE, Pages.FREE_SLIDE],
      label: PageTitlesMap.get(Pages.FREE_SLIDE) ?? Pages.FREE_SLIDE,
      icon: 'storyboard',
      visible: true,
    },
    {
      routerLink: ['./', Pages.PROGRAMS],
      label: PageTitlesMap.get(Pages.PROGRAMS) ?? Pages.PROGRAMS,
      disabled: true,
      icon: 'storyboard',
      visible: true,
    },
    {
      routerLink: ['./', Pages.SETTINGS],
      label: PageTitlesMap.get(Pages.SETTINGS) ?? Pages.SETTINGS,
      icon: 'control',
      visible: true,
    },
    {
      routerLink: ['./', Pages.TEST],
      label: PageTitlesMap.get(Pages.TEST) || Pages.TEST,
      icon: 'opened_book',
      visible: true,
    },
  ];

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;

  constructor(icons: IconsService) {
    icons.registerIcons([
      lyriBible,
      lyriControl,
      lyriStoryboard,
      lyriSongLyrics,
      lyriOpenedBook,
      lyriGrid,
      lyriBulletList
    ]);
  }

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

    // убрать т.к. воркеры стартуют до открытия фронта
    // this.repeatCheckBackend().subscribe((res) => {
    //   this.backendReady = !!res;
    //   if (this.backendReady) {
    //     this.cdr.detectChanges();
    //   }
    // });
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
}
