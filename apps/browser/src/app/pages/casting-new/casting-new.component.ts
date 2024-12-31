import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
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
import { ISong, LyricForCasting } from '@lyri-cast/entities';

import { NgxFitTextModule } from '@pikselin/ngx-fittext';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';
import { Pages } from '../page.types';

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
        this.deckRef?.layout();
        this.deckRef?.sync();

        if (payload.fromIndex) {
          this.deckRef?.slide(undefined, payload.fromIndex);
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
    });
  }

  async ngAfterViewInit() {
    await this.initReveal();

    this.bridge.windowSrv.electronContext.send({
      event: ElectronEvents.PAGE_OPENED,
      payload: { state: 'after-view-init', page: Pages.CASTING_NEW },
    });
  }

  async initReveal(): Promise<Api> {
    this.deckRef = new Reveal(this.elRef.nativeElement);

    const deck = await this.deckRef?.initialize({
      margin: -1,
      disableLayout: true,
      transition: 'fade', //todo можно сделать событие, которое будет изменять тип переходов между слайдами
      center: true,
      embedded: true,
    });

    return deck;
  }

  clearSlides(): void {
    this.deckRef?.destroy();

    this.showingContent.set(false);
  }
}
