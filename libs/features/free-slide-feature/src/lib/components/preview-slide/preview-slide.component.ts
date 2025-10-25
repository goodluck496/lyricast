import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  HostBinding,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FreeSlide } from '@lyri-cast/entities';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal from 'reveal.js';
import { Store } from '@ngrx/store';
import { selectFreeSlideSelected } from '@lyri-cast/free-slide-store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'lyri-preview-slide',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './preview-slide.component.html',
  styleUrl: './preview-slide.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewSlideComponent {
  public elRef = inject(ElementRef<HTMLElement>);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private store = inject(Store);
  private selectedSlide$ = this.store.select(selectFreeSlideSelected);

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  slide = input.required<FreeSlide>();

  selected = input.required<boolean>();

  slideText = '';

  fitTextRef = viewChild(Ng2FittextDirective);

  constructor() {
    this.selectedSlide$.pipe(takeUntilDestroyed()).subscribe(async (slide) => {
      if (!slide) {
        return;
      }
      this.slideText = slide.htmlString;

      // await this.initDeck();
      await this.initReveal();
    });
  }

  @HostBinding('attr.data-selected')
  get selectedSlide(): boolean {
    return this.selected();
  }

  async initReveal(): Promise<void> {
    // this.cdr.detectChanges();
    // this.deckRef?.layout();
    // this.deckRef?.sync();

    setTimeout(() => {
      this.fitTextRef()?.el.nativeElement.dispatchEvent(new Event('input'));
    }, 10);
  }

  async initDeck(): Promise<void> {
    try {
      this.deckRef = new Reveal(this.elRef.nativeElement);
      this.deck = await this.deckRef?.initialize({
        width: 400,
        height: 260,
        margin: -1,
        transition: 'fade',
        disableLayout: true,
        embedded: true,
        overview: false,
        keyboard: false,
      });
      await this.initReveal();
      this.cdr.detectChanges();
    } catch (err) {
      this.initDeck();
      console.error(err);
    }
  }
}
