import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  inject,
  Input,
  NgZone,
  OnChanges,
  SimpleChanges
} from '@angular/core';

@Directive({
  selector: '[lyriFitText]',
  standalone: true,
})
export class LyriFitTextDirective implements OnChanges, AfterViewInit {
  // Single global virtual canvas for measuring text in memory without layout thrashing
  private static canvas: HTMLCanvasElement | null = null;
  @Input() maxFontSize = 100;
  @Input() minFontSize = 10;
  @Input() textToWatch: any; // Trigger refit when this changes
  @Input() fontFamily?: string; // Trigger refit when font family changes
  @Input() virtualWidth?: number; // Virtual coordinate width for scaling
  @Input() virtualHeight?: number; // Virtual coordinate height for scaling
  private el = inject(ElementRef);
  private zone = inject(NgZone);
  private resizeObserver: ResizeObserver | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private animationFrameId: number | null = null;
  private resizeDebounceTimeout: any = null;

  private static getCanvasContext(): CanvasRenderingContext2D | null {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    return this.canvas.getContext('2d');
  }

  ngAfterViewInit() {
    const el = this.el.nativeElement as HTMLElement;
    const parent = (el.parentElement || el) as HTMLElement;
    this.lastWidth = parent.offsetWidth || parent.getBoundingClientRect().width;
    this.lastHeight = parent.offsetHeight || parent.getBoundingClientRect().height;

    this.fit();

    // Re-run fitting once asynchronous custom fonts are fully loaded in this window
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        this.fit();
      });
    }

    // Watch for container resize
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          // React only when physical container size actually changes
          if (
            Math.abs(width - this.lastWidth) > 0.5 ||
            Math.abs(height - this.lastHeight) > 0.5
          ) {
            this.lastWidth = width;
            this.lastHeight = height;

            // Direct call to fit() since requestAnimationFrame handles layout throttling safely
            this.fit();
          }
        }
      });
      this.resizeObserver.observe(parent);
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['textToWatch'] ||
      changes['maxFontSize'] ||
      changes['minFontSize'] ||
      changes['fontFamily'] ||
      changes['virtualWidth'] ||
      changes['virtualHeight']
    ) {
      this.fit();
    }
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeDebounceTimeout) {
      clearTimeout(this.resizeDebounceTimeout);
    }
  }

  // To allow manual trigger
  @HostListener('input')
  onInput() {
    this.fit();
  }

  public fit() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.zone.runOutsideAngular(() => {
      // Defer to next frame so DOM is updated with new text and throttle multiple calls
      this.animationFrameId = requestAnimationFrame(() => {
        this.calculateFontSize();
        this.animationFrameId = null;
      });
    });
  }

  private calculateFontSize() {
    const el = this.el.nativeElement as HTMLElement;
    if (!el.isConnected) return;

    const parent = (el.parentElement || el) as HTMLElement;
    
    // Use offsetWidth and offsetHeight to get layout dimensions (pre-transform) and avoid Reveal.js zoom issues
    const actualWidth = parent.offsetWidth || parent.getBoundingClientRect().width || this.lastWidth;
    const actualHeight = parent.offsetHeight || parent.getBoundingClientRect().height || this.lastHeight;

    if (actualWidth === 0 || actualHeight === 0) {
      return;
    }

    this.lastWidth = actualWidth;
    this.lastHeight = actualHeight;

    // Use virtual dimensions if provided.
    // Width acts as the baseline axis, while virtual height is derived from the
    // actual container height at the same width scale. This keeps full-height
    // side-by-side layouts from shrinking text too aggressively.
    const useVirtual = !!(this.virtualWidth && this.virtualHeight);
    const widthScale = useVirtual ? actualWidth / this.virtualWidth! : 1;
    const currentWidth = useVirtual ? this.virtualWidth! : actualWidth;
    const currentHeight = useVirtual
      ? actualHeight / widthScale
      : actualHeight;

    const ctx = LyriFitTextDirective.getCanvasContext();
    if (!ctx) return;

    // Находим дочерний элемент, на котором реально заданы стили текста (font-family, font-weight)
    let targetEl = el;
    const contentEl = el.querySelector('.slide-content, .slides__content');
    if (contentEl) {
      targetEl = contentEl as HTMLElement;
    }

    const computedStyle = window.getComputedStyle(targetEl);
    const fontFamily = computedStyle.fontFamily || 'sans-serif';
    const fontWeight = computedStyle.fontWeight || '700';
    const fontStyle = computedStyle.fontStyle || 'normal';
    const text = el.textContent || '';

    // Accounts for paddings and margins safely
    const padding = 16;
    const maxWidth = Math.max(0, currentWidth - padding);
    const maxHeight = Math.max(0, currentHeight - padding);

    if (maxWidth === 0 || maxHeight === 0) return;

    // Check if the text fits at max font size first (passing font-weight and font-style to match DOM styling perfectly)
    ctx.font = `${fontStyle} ${fontWeight} ${this.maxFontSize}px ${fontFamily}`;
    if (this.doesTextFit(ctx, text, this.maxFontSize, maxWidth, maxHeight)) {
      const optimalSize = this.maxFontSize;
      const finalSize = useVirtual ? optimalSize * widthScale : optimalSize;
      el.style.fontSize = `${finalSize}px`;
      return;
    }

    // Binary search for the perfect font size in JS memory
    let low = this.minFontSize;
    let high = this.maxFontSize;
    let optimal = this.minFontSize;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      ctx.font = `${fontStyle} ${fontWeight} ${mid}px ${fontFamily}`;

      if (this.doesTextFit(ctx, text, mid, maxWidth, maxHeight)) {
         optimal = mid;
         low = mid + 1; // Fits, try larger size
      } else {
         high = mid - 1; // Too big, try smaller size
      }
    }

    // Set DOM styles scaled down for virtual scaling if active
    const finalSize = useVirtual ? optimal * widthScale : optimal;
    el.style.fontSize = `${finalSize}px`;
  }

  /**
   * Helper function to check if word-wrapped text fits within container bounds in memory
   */
  private doesTextFit(
    ctx: CanvasRenderingContext2D,
    text: string,
    fontSize: number,
    maxWidth: number,
    maxHeight: number
  ): boolean {
    const words = text.trim().split(/\s+/);
    if (words.length === 0 || !text) return true;

    let linesCount = 1;
    let currentLineWidth = 0;
    const spaceWidth = ctx.measureText(' ').width;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;

      const wordWidth = ctx.measureText(word).width;

      // If a single word is wider than container width, it won't fit
      if (wordWidth > maxWidth) {
        return false;
      }

      if (currentLineWidth === 0) {
        currentLineWidth = wordWidth;
      } else {
        const newWidth = currentLineWidth + spaceWidth + wordWidth;
        if (newWidth <= maxWidth) {
          currentLineWidth = newWidth;
        } else {
          // Wrap to next line
          linesCount++;
          currentLineWidth = wordWidth;
        }
      }
    }

    // Standard Bible text line-height is around 1.35
    const lineHeight = fontSize * 1.35;
    const totalHeight = linesCount * lineHeight;

    return totalHeight <= maxHeight;
  }
}
