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
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { selectFreeSlideCastingProcess } from '@lyri-cast/free-slide-store';
import { SONG_ACTIONS } from '@lyri-cast/song-store';
import { AppActions, BridgeService, Pages } from '@lyri-cast/common-browser';
import { filterEmpty } from '@lyri-cast/common';
import { filter, map, Observable, tap } from 'rxjs';
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

  slides$: Observable<FreeSlide[]> = this.selectCastingProcess$.pipe(
    filterEmpty(),
    map((data) => {
      return data.slides;
    })
  );

  fitTexts = viewChildren(Ng2FittextDirective);

  ngOnInit() {
    this.selectCastingProcess$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        console.log('selectCastingProcess', e);

        /**
         * ХАК!!! надо рефачить
         */
        setTimeout(() => {
          window.dispatchEvent(new Event('resize', {}));
        }, 100);

        setTimeout(() => {
          this.openIframeFullscreen();
        }, 1000);
      });

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
    // await this.initReveal();
    console.log('afterViewInit');

    this.bridge.windowSrv.electronContext.send({
      event: SONG_ACTIONS.openedPage,
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

    // this.deckRef.layout();
    this.updateTextSize();
  }

  updateTextSize() {
    this.fitTexts().forEach((el) => {
      el.onResize(new Event('resize'));
    });
  }

  async initReveal(): Promise<Api> {
    this.deckRef = new Reveal(this.elRef.nativeElement);

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
  }
}
