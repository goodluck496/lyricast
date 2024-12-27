import {
  AfterViewInit,
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';

import Reveal  from 'reveal.js';
import { SongPageSelectService } from '../../song-page-select.service';
import { LyricForCasting, LyricLine } from '@lyri-cast/entities';

@Component({
  selector: 'lyri-casting-preview',
  standalone: true,
  imports: [CommonModule],
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

  selectedLyric?: LyricForCasting;
  selectedLine?: LyricLine;

  constructor() {
    this.songPageSelectSrv.isShowPreview.subscribe((isShowPreview) => {
      console.log('this.songPageSelectSrv', this.songPageSelectSrv.selectedLyricLine?.text);
      this.selectedLine = this.songPageSelectSrv.selectedLyricLine;
      this.selectedLyric = this.songPageSelectSrv.selectedLyric;
      this.slideText = this.songPageSelectSrv.selectedLyricLine?.text || '';
      this.deckRef?.sync();
      if (isShowPreview) {
        this.initReveal();
      } else {
        this.closePreview();
      }
    });
  }

  async initReveal(): Promise<void> {
    console.log('inmit reveal');

    // if (this.deck && 'destroy' in this.deck) {
    //   this.deck.destroy();
    //   console.log('deck', this.deckRef);
    // }

    this.slideText = this.songPageSelectSrv.selectedLyricLine?.text || '';
    console.log('tmpSlide', this.tmpSlide);

    this.cdr.detectChanges();
    this.deckRef?.layout();
    this.deckRef?.sync();

    console.log('deckRef', this.deckRef);
  }

  closePreview(): void {
    this.deck?.destroy();
  }

  ngAfterViewInit() {
    setTimeout(async () => {
      this.deckRef = new Reveal(
        this.elRef.nativeElement
      );
      this.deck = await this.deckRef?.initialize({
        width: 300,
        height: 300,
        margin: 0.25,
        // overview: true,
        center: true,
        embedded: true,
      });
    }, 100);
  }

  ngOnDestroy() {
    this.deck?.destroy();
  }
}
