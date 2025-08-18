import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import {
  FreeSlideNavigatePayload,
  FreeSlideStartCastingPayload,
  selectFreeSlideCastingPaused,
  selectFreeSlideCastingProcess,
  selectFreeSlideCastingStarted,
  selectFreeSlideNavigateState,
} from '@lyri-cast/free-slide-store';
import { AppActions, BridgeService, Pages } from '@lyri-cast/common-browser';
import { filterEmpty } from '@lyri-cast/common';
import {
  combineLatest,
  debounceTime,
  filter,
  map,
  Observable,
  tap,
  withLatestFrom,
} from 'rxjs';
import { FreeSlide } from '@lyri-cast/entities';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Actions, ofType } from '@ngrx/effects';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';

@Component({
  selector: 'lyri-free-slide-casting',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './free-slide-casting.component.html',
  styleUrls: ['./free-slide-casting.component.scss'],
  // encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideCastingComponent implements OnInit, AfterViewInit {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly bridge = inject(BridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly sanitizer = inject(DomSanitizer);

  deckRef?: Reveal.Api;

  selectCastingProcess$ = this.store.select(selectFreeSlideCastingProcess);
  selectCastingStarted$ = this.store.select(selectFreeSlideCastingStarted);
  slideNavigate$ = this.store.select(selectFreeSlideNavigateState);
  castingPaused$ = this.store.select(selectFreeSlideCastingPaused);

  slides$: Observable<FreeSlide[]> = this.selectCastingProcess$.pipe(
    filterEmpty(),
    map((data) => {
      console.log('FreeSlideCastingComponent', data);
      return data.slides;
    })
  );

  started = signal(false);
  hideContent = signal(false);
  showedSlideIndex = signal(0);

  fitTexts = viewChildren(Ng2FittextDirective);

  ngOnInit() {
    console.log('FreeSlideCastingComponent ngOnInit', this);

    this.selectCastingStarted$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.hideContent.set(data);
      });

    combineLatest([
      this.selectCastingStarted$,
      this.selectCastingProcess$.pipe(debounceTime(300), filterEmpty()),
      this.slideNavigate$,
    ]).subscribe(([started, process, navigate]) => {
      if (!started) {
        return;
      }
      this.started.set(started);

      if (navigate) {
        this.navigateSlideHandler(navigate);
        if (navigate.index !== undefined) {
          this.showedSlideIndex.set(navigate.index);
        }
        console.log('navigate', navigate);
      } else if (process) {
        console.log('process', process);
        this.startCastingHandler(process);
        this.showedSlideIndex.set(process.fromIndex);
      }

      setTimeout(() => {
        this.openIframeFullscreen();
      }, 300);
    });
    /*
    this.selectCastingProcess$
      .pipe(
        debounceTime(300),
        filterEmpty(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data) => {
        this.startCastingHandler(data);
        /!**
         * ХАК!!! надо рефачить
         *!/
        // setTimeout(() => {
        //   window.dispatchEvent(new Event('resize', {}));
        // }, 100);

        setTimeout(() => {
          this.openIframeFullscreen();
        }, 1000);
      });*/

    /*  this.slideNavigate$
        .pipe(
          filterEmpty(),
          withLatestFrom(this.selectCastingStarted$),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(([data, started]) => {
          if (started) {
            console.log('navigate');
            this.navigateSlideHandler(data);
          }
        });*/

    this.actions$
      .pipe(
        ofType(AppActions.openPage),
        tap((data) => {
          console.log('AppActions.openPage', data);
        }),
        filter(() => this.bridge.windowType !== AppWindowTypes.MAIN),
        tap((data) => {
          console.log('openPage', data);
          // this.router
          //   .navigate([...data.path], { replaceUrl: true })
          //   .then((r) => console.log('open page', r));
        }),
        map((data) => ({ type: APP_COMMON_ACTIONS.openPage, payload: data })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data) => {
        console.log('-----------------open page', data);
        this.initReveal();
      });

    this.castingPaused$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((paused) => {
        console.log('paused???', paused);
        if (this.started()) {
          this.hideContent.set(paused);
        }
      });
  }

  openIframeFullscreen() {
    /**
     * todo
     * нужно обновить модель сообщения, чтобы принимать тип контента,
     * и если есть видео или еще какое-то медиа c iframe - чтобы срабатывала эта функция
     */

    // Находим первое iframe внутри #preview
    const iframe: HTMLIFrameElement | null =
      this.elRef.nativeElement.querySelector('iframe');
    if (!iframe) {
      console.warn('Iframe не найден в контейнере превью');
      return;
    }

    // Функция, учитывающая разные браузеры
    const elem: any = iframe; // casting для поддержки префиксов
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      // Firefox
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      // Chrome, Safari, Opera
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      // IE/Edge
      elem.msRequestFullscreen();
    } else {
      console.error('Fullscreen API не поддерживается этим браузером');
    }
  }

  async ngAfterViewInit() {
    await this.initReveal();
    console.log('afterViewInit');

    this.bridge.windowSrv.electronContext.send({
      event: 'OPENED_PAGE',
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  sanitizeHtml(rawHtml: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  }

  @HostListener('window:resize', ['$event'])
  resizeHandler() {
    if (!this.deckRef) {
      return;
    }

    this.deckRef.layout();
    this.updateTextSize();
  }

  updateTextSize() {
    this.fitTexts().forEach((el) => {
      el.onResize(new Event('resize'));
    });
  }

  startCastingHandler(payload: FreeSlideStartCastingPayload) {
    if (!this.deckRef) {
      return;
    }
    // this.clearSlides();
    // await this.initReveal();

    // if (payload.fromIndex !== undefined) {
    this.deckRef.slide(undefined, payload.fromIndex);
    // }

    this.cdr.detectChanges();
    this.updateTextSize();
    this.hideContent.set(false);
  }

  navigateSlideHandler(payload: FreeSlideNavigatePayload) {
    if (!this.deckRef) {
      return;
    }

    this.deckRef.slide(undefined, payload.index);
    this.updateTextSize();
  }

  clearSlides(): void {
    this.deckRef?.destroy();

    this.hideContent.set(true);
  }

  async initReveal(): Promise<Api> {
    /*this.deckRef = new Reveal(this.elRef.nativeElement);

    const deck = await this.deckRef?.initialize({
      margin: -1,
      disableLayout: true,
      transition: 'fade', //todo можно сделать событие, которое будет изменять тип переходов между слайдами
      // center: true,
      embedded: true,
      progress: false,
      controls: false,
      overview: false,
      // controlsBackArrows: 'hidden',
    });

    return deck;
  }*/

    return new Promise((res, rej) => {
      setTimeout(async () => {
        const revealContainer =
          this.elRef.nativeElement.querySelector('.reveal');
        this.deckRef = new Reveal(revealContainer, {
          margin: -1,
          disableLayout: true,
          transition: 'fade', //todo можно сделать событие, которое будет изменять тип переходов между слайдами
          center: true,
          embedded: true,
        });

        const deck = await this.deckRef?.initialize();

        res(deck);
      }, 300);
    });
  }
}
