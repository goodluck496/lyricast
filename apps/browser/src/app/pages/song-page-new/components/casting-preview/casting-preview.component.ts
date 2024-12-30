import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import Reveal from 'reveal.js';
import { SongPageSelectService } from '../../song-page-select.service';
import { LyricForCasting, LyricLine } from '@lyri-cast/entities';
import { Ng2FittextModule } from 'ng2-fittext';

@Component({
  selector: 'lyri-casting-preview',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './casting-preview.component.html',
  styleUrl: './casting-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastingPreviewComponent implements OnDestroy, AfterViewInit {
  public elRef = inject(ElementRef<HTMLElement>);
  public songPageSelectSrv = inject(SongPageSelectService);
  private cdr = inject(ChangeDetectorRef);

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  tmpSlide = '';

  slideText = '';

  public selectedLyricLine = signal<LyricLine | null>(null);
  public selectedLyric = signal<LyricForCasting | null>(null);

  constructor() {
    this.songPageSelectSrv.isShowPreview.subscribe((isShowPreview) => {
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

  async initReveal(): Promise<void> {
    this.slideText = this.songPageSelectSrv.selectedLyricLine()?.text || '';

    this.cdr.detectChanges();
    this.deckRef?.layout();
    this.deckRef?.sync();
  }

  closePreview(): void {
    this.deck?.destroy();
  }

  ngAfterViewInit() {
    setTimeout(async () => {
      this.deckRef = new Reveal(this.elRef.nativeElement);
      this.deck = await this.deckRef?.initialize({
        width: 400,
        height: 300,
        margin: -1,
        disableLayout: true,
        embedded: true,
      });
    }, 100);
  }

  ngOnDestroy() {
    this.deck?.destroy();
  }
}
