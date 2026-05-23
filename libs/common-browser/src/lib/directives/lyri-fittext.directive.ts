import { Directive, ElementRef, Input, OnChanges, HostListener, SimpleChanges, NgZone, inject, AfterViewInit } from '@angular/core';

@Directive({
  selector: '[lyriFitText]',
  standalone: true
})
export class LyriFitTextDirective implements OnChanges, AfterViewInit {
  private el = inject(ElementRef);
  private zone = inject(NgZone);

  @Input() maxFontSize = 100;
  @Input() minFontSize = 10;
  @Input() textToWatch: any; // Trigger refit when this changes

  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit() {
    this.fit();
    
    // Watch for container resize
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => this.fit());
      });
      this.resizeObserver.observe(this.el.nativeElement);
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['textToWatch'] || changes['maxFontSize'] || changes['minFontSize']) {
      this.fit();
    }
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  // To allow manual trigger
  @HostListener('input')
  onInput() {
    this.fit();
  }

  public fit() {
    this.zone.runOutsideAngular(() => {
      // Defer to next frame so DOM is updated with new text
      requestAnimationFrame(() => this.calculateFontSize());
    });
  }

  private calculateFontSize() {
    const el = this.el.nativeElement as HTMLElement;
    if (!el.isConnected || el.clientHeight === 0) return;
    
    // Reset to max font size first
    el.style.fontSize = `${this.maxFontSize}px`;
    
    if (!this.isOverflowing(el)) {
      return; // Fits perfectly at max size
    }

    // Binary search for the perfect font size
    let low = this.minFontSize;
    let high = this.maxFontSize;
    let optimal = this.minFontSize;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      el.style.fontSize = `${mid}px`;

      if (this.isOverflowing(el)) {
        // Too big, search lower half
        high = mid - 1;
      } else {
        // Fits, but maybe we can go bigger
        optimal = mid;
        low = mid + 1;
      }
    }

    el.style.fontSize = `${optimal}px`;
  }

  private isOverflowing(el: HTMLElement): boolean {
    return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  }
}
