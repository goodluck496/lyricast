import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';


import Reveal from 'reveal.js';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { LyricForCasting, LyricLine } from '@lyri-cast/entities';
import { Ng2FittextModule } from 'ng2-fittext';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { CastingAppearanceService } from '@lyri-cast/common-browser';
import { SongTextLayoutService } from '../../services/song-text-layout.service';

const PREVIEW_CONTENT_HEIGHT = 220;
const CASTING_CONTENT_HEIGHT_BASELINE = 1080 - 64;
const PREVIEW_FONT_SCALE = PREVIEW_CONTENT_HEIGHT / CASTING_CONTENT_HEIGHT_BASELINE;

@Component({
  selector: 'lyri-song-casting-preview',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './song-casting-preview.component.html',
  styleUrl: './song-casting-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongCastingPreviewComponent implements OnDestroy, AfterViewInit {
  public elRef = inject(ElementRef<HTMLElement>);
  public songPageSelectSrv = inject(SongPageSelectService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  protected readonly appearanceService = inject(CastingAppearanceService);
  protected readonly appearance = this.appearanceService.appearance;
  protected readonly previewMinFontSize = computed(() =>
    Math.max(8, Math.round(this.appearance().minFontSize * PREVIEW_FONT_SCALE))
  );
  protected readonly previewMaxFontSize = computed(() =>
    Math.max(
      this.previewMinFontSize(),
      Math.round(this.appearance().maxFontSize * PREVIEW_FONT_SCALE)
    )
  );
  private readonly textLayout = inject(SongTextLayoutService);
  sanitizer: DomSanitizer = inject(DomSanitizer);

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  slideText = '';

  initTimeoutId: any;

  public selectedLyricLine = signal<LyricLine | null>(null);
  public selectedLyric = signal<LyricForCasting | null>(null);

  constructor() {
    effect(() => {
      this.textLayout.fitTextAutoWrapEnabled();

      const selectedLine = this.songPageSelectSrv.selectedLyricLine();
      this.slideText = this.textLayout.formatHtmlForDisplay(
        selectedLine?.text || ''
      );

      this.cdr.markForCheck();
      this.deckRef?.layout();
      this.deckRef?.sync();
    });
  }

  async initReveal(): Promise<void> {
    this.slideText = this.textLayout.formatHtmlForDisplay(
      this.songPageSelectSrv.selectedLyricLine()?.text || ''
    );

    this.cdr.detectChanges();
    this.deckRef?.layout();
    this.deckRef?.sync();
    
    // Trigger resize event for fit-text to recalculate
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }

  initDeck(): void {
    this.initTimeoutId = setTimeout(async () => {
      try {
        this.deckRef = new Reveal(this.elRef.nativeElement.querySelector('.reveal'), {
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
        this.slideText = this.textLayout.formatHtmlForDisplay(
          this.songPageSelectSrv.selectedLyricLine()?.text || ''
        );
        this.deckRef?.sync();

        if (isShowPreview) {
          this.initReveal();
        } else {
          this.closePreview();
        }
        
        // Trigger resize event when text changes
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
        
              });
  }

  ngOnDestroy() {
    clearTimeout(this.initTimeoutId);
    this.deck?.destroy?.();
  }
}
