import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { BridgeService } from '../../../services/bridge.service';
import { filterEmpty } from '@lyri-cast/common';
import { ElectronEvents, EventPayloadItem } from '@lyri-cast/common-electron';
import { ISong, LyricForCasting, LyricLine } from '@lyri-cast/entities';

// import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import { NgxFitTextModule } from '@pikselin/ngx-fittext';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';

@Component({
  selector: 'lyri-casting-new-page',
  standalone: true,
  imports: [NgxFitTextModule, Ng2FittextModule],
  templateUrl: './casting-new.component.html',
  styleUrl: './casting-new.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastingNewComponent implements OnInit, AfterViewInit {
  bridge = inject(BridgeService);
  cdr = inject(ChangeDetectorRef);

  public elRef = inject(ElementRef<HTMLElement>);

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  tmpSlide = '';

  slideText = '';
  selectedLine?: LyricLine;

  // fitTextDirective = viewChild(Ng2FittextDirective);

  selectedSong = signal<ISong | null>(null);
  selectedLyric = signal<LyricForCasting | null>(null);
  selectedLyrics = signal<LyricForCasting[]>([]);

  showingContent = signal(false);

  lines = signal<string[]>([]);

  slides = viewChild.required<HTMLElement>('slidesContainerRef');
  fitTexts = viewChildren(Ng2FittextDirective);

  @HostListener('window:resize', ['$event'])
  resizeHandler(event: Event) {
    if (!this.deckRef) {
      return;
    }

    this.deckRef.layout();
    this.fitTexts().forEach((el) => el.onResize(event));
  }

  constructor() {
    effect(() => {
      // const fit = this.fitTextDirective()!;
      // fit.setFontSize(fit.getStartFontSizeFromHeight())
      // fit.ngAfterViewInit();
      // const slides = this.slides();
      const fitTexts = this.fitTexts();
      if (fitTexts) {
        fitTexts.forEach((el) => {
          console.log('fitTexts', el);
          setTimeout(() => {
            // el.setFontSize(100);
            window.dispatchEvent(new Event('resize'));
          }, 500);
        });
      }
    });
  }

  ngOnInit() {
    this.bridge.queueEvents.pipe(filterEmpty()).subscribe(async (data) => {
      if (data.event === ElectronEvents.SONG__START_CASTING) {
        this.clearSlides();

        const payload =
          data.payload as EventPayloadItem<ElectronEvents.SONG__START_CASTING>;

        this.selectedSong.set(payload.song);
        this.selectedLyrics.set(payload.lyrics);
        this.selectedLyric.set(payload.currentLyric);
        this.showingContent.set(true);
        this.cdr.detectChanges();

        await this.initReveal();
        console.log('init reveal', payload, this.deckRef);
        this.deckRef?.layout();
        this.deckRef?.sync();

        if (payload.fromIndex) {
          // this.showingContent.set(false);
          // this.deckRef?.slide(undefined, payload.fromIndex);
          this.deckRef?.slide(payload.fromIndex, payload.fromIndex);
          // this.showingContent.set(true);
        } else {
          this.deckRef?.slide(0, 0);
        }
      }

      if (data.event === ElectronEvents.SONG__STOP_CASTING) {
        if (!this.deckRef) {
          return;
        }

        this.deckRef.destroy();
        this.showingContent.set(false);
        this.cdr.detectChanges();
      }

      if (data.event === ElectronEvents.SONG__SLIDE_NAVIGATE) {
        if (!this.deckRef) {
          return;
        }
        const payload =
          data.payload as EventPayloadItem<ElectronEvents.SONG__SLIDE_NAVIGATE>;
        if (payload.direction) {
          this.deckRef[payload.direction]();
        } else if (payload.index !== undefined) {
          this.deckRef.slide(undefined, payload.index);
        }

        this.selectedLyric.set(payload.currentLyric);
        this.cdr.detectChanges();
      }
      this.fitTexts().forEach((el) => {
        el.onResize(new Event('resize'));
      });

      // todo для срабатывания директивы подсройки текста, нужно вызывать событие window.resize
      window.dispatchEvent(new Event('resize'));
    });
  }

  ngAfterViewInit() {
    this.initReveal();
  }

  async initReveal(): Promise<Api> {
    // setTimeout(async () => {
    this.deckRef = new Reveal(this.elRef.nativeElement);

    const deck = await this.deckRef?.initialize({
      // width: 400,
      // height: 300,
      margin: -1,
      // view: 'scroll',
      // hash: true,
      // overview: true,
      disableLayout: true,
      center: true,
      embedded: true,
    });

    return deck;

    return new Promise(async (resolve, reject) => {
      // setTimeout(async () => {
      try {
        const deck = await this.deckRef?.initialize({
          // width: 400,
          // height: 300,
          margin: -1,
          // view: 'scroll',
          // hash: true,
          // overview: true,
          disableLayout: true,
          center: true,
          embedded: true,
        });
        if (deck) {
          console.log('this.deckRef', this.deckRef);
          resolve(deck);
        }
      } catch (e) {
        console.log('error', e);
      }
      // }, 100);
    });
    // }, 100);
  }

  clearSlides(): void {
    this.deckRef?.destroy();
    // const children = this.slides().children || [];
    // for (const child of Array.from(children)) {
    //   this.slides().removeChild(child);
    // }
    this.showingContent.set(false);
  }
}
