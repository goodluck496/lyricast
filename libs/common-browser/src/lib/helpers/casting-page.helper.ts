import Reveal from 'reveal.js';
import { ElementRef, QueryList } from '@angular/core';
import { Ng2FittextDirective } from 'ng2-fittext';

export class RevealHelper {
  private deckRef?: Reveal.Api;

  constructor(
    private elRef: ElementRef<HTMLElement>,
    private fitTexts: QueryList<Ng2FittextDirective>
  ) {}

  async init(): Promise<void> {
    const revealElement = this.elRef.nativeElement.querySelector(
      '.reveal'
    ) as HTMLElement;
    this.deckRef = new Reveal(revealElement, {
      margin: -1,
      disableLayout: true,
      transition: 'fade',
      center: true,
      embedded: true,
      controls: false,
      progress: false,
      overview: false,
    });

    await this.deckRef.initialize();

    this.layout();
  }

  layout() {
    this.deckRef?.layout();
    this.updateTextSize();
  }

  navigateTo(index?: number, direction?: 'next' | 'prev') {
    if (!this.deckRef) return;

    if (index !== undefined) {
      this.deckRef.slide(undefined, index);
    } else if (direction) {
      this.deckRef[direction]();
    }
  }

  destroy() {
    this.deckRef?.destroy();
    this.deckRef = undefined;
  }

  updateTextSize() {
    this.fitTexts.forEach((el) => el.onResize(new Event('resize')));
  }

  get reveal(): Reveal.Api | undefined {
    return this.deckRef;
  }
}
