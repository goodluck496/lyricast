import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';

import {
  AppUpdateService,
  FreeSlidePages,
  MainComponentService,
  OnboardingHelpService,
  PAGE_CONTAINER_TEMPLATES,
  Pages,
  PageTitlesMap,
} from '@lyri-cast/common-browser';
import { HttpClient } from '@angular/common/http';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Badge } from 'primeng/badge';
import { ButtonDirective } from 'primeng/button';
import {
  catchError,
  filter,
  first,
  fromEvent,
  merge,
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
import { AmbientBackgroundComponent } from '../../components/ambient-background/ambient-background.component';
import { lyriBible } from '@lyri-cast/svg-icons/lyri-icons/lyri-bible.icon';
import { lyriControl } from '@lyri-cast/svg-icons/lyri-icons/lyri-control.icon';
import { lyriStoryboard } from '@lyri-cast/svg-icons/lyri-icons/lyri-storyboard.icon';
import { lyriSongLyrics } from '@lyri-cast/svg-icons/lyri-icons/lyri-song-lyrics.icon';
import { lyriOpenedBook } from '@lyri-cast/svg-icons/lyri-icons/lyri-opened-book.icon';
import { lyriGrid } from '@lyri-cast/svg-icons/lyri-icons/lyri-grid.icon';
import { lyriBulletList } from '@lyri-cast/svg-icons/lyri-icons/lyri-bullet-list.icon';
import { IStepOption, TourPrimeNgModule, TourService } from 'ngx-ui-tour-primeng';

// import lyricSvg from '@styles/assets/icons/song-lyrics.svg';

@Component({
  selector: 'lyri-main-page',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ProgressSpinnerModule,
    SearchFeatureComponent,
    NgTemplateOutlet,
    AsyncPipe,
    SvgIconComponent,
    AmbientBackgroundComponent,
    TourPrimeNgModule,
    Badge,
    ButtonDirective,
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

  private readonly tourService = inject(TourService);
  private readonly onboardingHelpService = inject(OnboardingHelpService);

  private canTourEnd(tourService: unknown): tourService is { end: () => void } {
    return typeof (tourService as { end: () => void }).end === 'function';
  }

  mainCompService = inject(MainComponentService);
  readonly appUpdateService = inject(AppUpdateService);

  sidebarWidth = signal<number>(
    typeof localStorage !== 'undefined'
      ? parseInt(localStorage.getItem('lyricast.sidebarWidth') || '460', 10) || 460
      : 460
  );
  isResizingSidebar = signal<boolean>(false);

  startSidebarResize(event: MouseEvent): void {
    event.preventDefault();
    this.isResizingSidebar.set(true);
    const startX = event.clientX;
    const startWidth = this.sidebarWidth();

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX;
      const minWidth = 360;
      const maxWidth =
        typeof window !== 'undefined'
          ? Math.max(minWidth, window.innerWidth - 420)
          : 750;
      const newWidth = Math.min(Math.max(startWidth + deltaX, minWidth), maxWidth);
      this.sidebarWidth.set(newWidth);
      this.cdr.markForCheck();
    };

    const onMouseUp = () => {
      this.isResizingSidebar.set(false);
      this.cdr.markForCheck();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('lyricast.sidebarWidth', String(this.sidebarWidth()));
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  isUpdateOverlayVisible = false;
  isOverlayPinned = false;
  overlayTop = 0;
  private overlayHideTimer: ReturnType<typeof setTimeout> | null = null;

  activePage?: MenuItem;

  readonly menuAnchors = {
    bible: 'menu:bible',
    songs: 'menu:songs',
    freeSlide: 'menu:free-slide',
    programs: 'menu:programs',
    quiz: 'menu:quiz',
    settings: 'menu:settings',
  } as const;

  readonly onboardingMenuSteps: IStepOption[] = [
    {
      anchorId: this.menuAnchors.bible,
      title: 'Библия',
      content: 'Модуль для отображения текста Библии.',
    },
    {
      anchorId: this.menuAnchors.songs,
      title: 'Песни',
      content: 'Мудуль для отображения песен на проекторе',
    },
    {
      anchorId: this.menuAnchors.freeSlide,
      title: 'Слайды',
      content: 'Модуль презентаций/слайдов: создание и показ контента на проектор.',
    },
    {
      anchorId: this.menuAnchors.quiz,
      title: 'Викторина',
      content: 'Раздел викторин (настройка и проведение).',
    },
    {
      anchorId: this.menuAnchors.settings,
      title: 'Настройки',
      content: 'Глобальные настройки приложения (темы, поведение, интеграции).',
    },
  ];

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
      routerLink: ['./', Pages.FREE_SLIDE_FEATURE, FreeSlidePages.MAIN],
      label: PageTitlesMap.get(Pages.FREE_SLIDE) ?? FreeSlidePages.SLIDE,
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
      routerLink: ['./', Pages.QUIZ_FEATURE, Pages.QUIZ],
      label: PageTitlesMap.get(Pages.QUIZ) ?? 'Викторина',
      icon: 'grid',
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
      visible: false,
    },
  ];

  getMenuAnchorId(page: MenuItem): string | null {
    const feature = page.routerLink?.[1];
    const leaf = page.routerLink?.[2] ?? page.routerLink?.[1];

    if (feature === Pages.BIBLE_FEATURE || leaf === Pages.BIBLE) {
      return this.menuAnchors.bible;
    }

    if (feature === Pages.SONGS_FEATURE || leaf === Pages.SONGS) {
      return this.menuAnchors.songs;
    }

    if (feature === Pages.FREE_SLIDE_FEATURE || leaf === Pages.FREE_SLIDE) {
      return this.menuAnchors.freeSlide;
    }

    if (leaf === Pages.PROGRAMS) {
      return this.menuAnchors.programs;
    }

    if (feature === Pages.QUIZ_FEATURE || leaf === Pages.QUIZ) {
      return this.menuAnchors.quiz;
    }

    if (leaf === Pages.SETTINGS) {
      return this.menuAnchors.settings;
    }

    return null;
  }

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;

  constructor(icons: IconsService) {
    icons.registerIcons([
      lyriBible,
      lyriControl,
      lyriStoryboard,
      lyriSongLyrics,
      lyriOpenedBook,
      lyriGrid,
      lyriBulletList,
    ]);
    this.destroyRef.onDestroy(() => this.clearOverlayHideTimer());
  }

  isSettingsPage(page: MenuItem): boolean {
    const leaf = page.routerLink?.[2] ?? page.routerLink?.[1];
    return leaf === Pages.SETTINGS;
  }

  onMenuItemMouseEnter(page: MenuItem, event?: MouseEvent) {
    if (this.isSettingsPage(page) && this.appUpdateService.isUpdateDownloaded()) {
      this.clearOverlayHideTimer();
      const target = (event?.currentTarget as HTMLElement) ?? document.querySelector('#menu-settings-item');
      if (target) {
        const rect = target.getBoundingClientRect();
        const popupHeight = 130;
        const maxTop = Math.max(10, window.innerHeight - popupHeight - 16);
        this.overlayTop = Math.min(rect.top, maxTop);
      }
      this.isUpdateOverlayVisible = true;
      this.cdr.markForCheck();
    }
  }

  onMenuItemMouseLeave(page: MenuItem) {
    if (this.isSettingsPage(page) && !this.isOverlayPinned) {
      this.scheduleOverlayHide();
    }
  }

  onBadgeClick(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    this.clearOverlayHideTimer();
    const target = (event.currentTarget as HTMLElement).closest('.page__menu-item') as HTMLElement
      ?? document.querySelector('#menu-settings-item');
    if (target) {
      const rect = target.getBoundingClientRect();
      const popupHeight = 130;
      const maxTop = Math.max(10, window.innerHeight - popupHeight - 16);
      this.overlayTop = Math.min(rect.top, maxTop);
    }
    this.isOverlayPinned = !this.isOverlayPinned;
    this.isUpdateOverlayVisible = this.isOverlayPinned;
    this.cdr.markForCheck();
  }

  onOverlayMouseEnter() {
    this.clearOverlayHideTimer();
  }

  onOverlayMouseLeave() {
    if (!this.isOverlayPinned) {
      this.scheduleOverlayHide();
    }
  }

  private scheduleOverlayHide() {
    this.clearOverlayHideTimer();
    this.overlayHideTimer = setTimeout(() => {
      if (!this.isOverlayPinned) {
        this.isUpdateOverlayVisible = false;
        this.cdr.markForCheck();
      }
    }, 400);
  }

  private clearOverlayHideTimer() {
    if (this.overlayHideTimer) {
      clearTimeout(this.overlayHideTimer);
      this.overlayHideTimer = null;
    }
  }

  onApplyUpdate() {
    this.isUpdateOverlayVisible = false;
    this.isOverlayPinned = false;
    this.appUpdateService.quitAndInstall();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.isUpdateOverlayVisible) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.page__update-flyout') && !target.closest('#menu-settings-item')) {
      this.isUpdateOverlayVisible = false;
      this.isOverlayPinned = false;
      this.cdr.markForCheck();
    }
  }

  ngOnInit() {
    this.cdr.detectChanges();

    merge(
      this.router.events.pipe(filter((e) => e instanceof NavigationStart)),
      fromEvent(document, 'visibilitychange').pipe(
        filter(() => document.visibilityState === 'hidden')
      ),
      fromEvent<KeyboardEvent>(window, 'keydown').pipe(
        filter((e) => e.key === 'Escape')
      )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.mainCompService.clearTemplates([
            PAGE_CONTAINER_TEMPLATES.PAGE_HEADER,
          ]);
        }

        this.isUpdateOverlayVisible = false;
        this.isOverlayPinned = false;
        this.cdr.markForCheck();

        if (this.canTourEnd(this.tourService)) {
          this.tourService.end();
        }
      });

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

  onHelpClick(): void {
    if (this.router.url.includes(Pages.BIBLE_FEATURE)) {
      this.onboardingHelpService.requestHelp('bible');
      return;
    }

    if (this.router.url.includes(Pages.SONGS_FEATURE)) {
      this.onboardingHelpService.requestHelp('songs');
      return;
    }

    if (this.canTourEnd(this.tourService)) {
      this.tourService.end();
    }
    this.tourService.initialize(this.onboardingMenuSteps);
    this.tourService.start();
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
