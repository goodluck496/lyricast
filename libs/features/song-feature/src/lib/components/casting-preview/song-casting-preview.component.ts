import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';


import Reveal from 'reveal.js';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { LyricForCasting, LyricLine } from '@lyri-cast/entities';
import { Ng2FittextModule } from 'ng2-fittext';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'lyri-song-casting-preview',
  standalone: true,
  imports: [Ng2FittextModule],
  templateUrl: './song-casting-preview.component.html',
  styleUrl: './song-casting-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongCastingPreviewComponent implements OnDestroy, AfterViewInit {
  public elRef = inject(ElementRef<HTMLElement>);
  public songPageSelectSrv = inject(SongPageSelectService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  sanitizer: DomSanitizer = inject(DomSanitizer);

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  slideText = '';

  initTimeoutId: any;

  public selectedLyricLine = signal<LyricLine | null>(null);
  public selectedLyric = signal<LyricForCasting | null>(null);

  constructor() {}

  async initReveal(): Promise<void> {
    this.slideText = this.songPageSelectSrv.selectedLyricLine()?.text || '';

    this.cdr.detectChanges();
    this.deckRef?.layout();
    this.deckRef?.sync();
  }

  initDeck(): void {
    this.initTimeoutId = setTimeout(async () => {
      try {
        this.deckRef = new Reveal(this.elRef.nativeElement.querySelector('.reveal'), {
          width: 400,
          height: 300,
          margin: -1,
          transition: 'fade',
          disableLayout: true,
          embedded: true,
          overview: false,
          keyboard:false,
        });
        this.deck = await this.deckRef?.initialize();
        await this.initReveal();
        this.cdr.detectChanges()
      } catch (err) {
        clearTimeout(this.initTimeoutId);
        this.initDeck();
        console.error(err);
      }
    }, 500);
  }

  closePreview(): void {
    this.deck?.destroy?.();
  }

  ngAfterViewInit() {
    this.initDeck();

    this.songPageSelectSrv.isShowPreview
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isShowPreview) => {
        if (!this.deckRef) {
          return;
        }
        this.selectedLyricLine = this.songPageSelectSrv.selectedLyricLine;
        this.selectedLyric = this.songPageSelectSrv.selectedLyric;
        this.slideText = this.songPageSelectSrv.selectedLyricLine()?.text || '';
        this.deckRef?.sync();

        if (isShowPreview) {
          this.initReveal();
        } else {
          this.closePreview();
        }
      });
  }

  ngOnDestroy() {
    clearTimeout(this.initTimeoutId);
    this.deck?.destroy?.();
  }
}
