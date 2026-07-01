import { Injectable, signal } from '@angular/core';
import { LyricForCasting, LyricLine } from '@lyri-cast/entities';

@Injectable({ providedIn: 'root' })
export class SongTextLayoutService {
  readonly fitTextAutoWrapEnabled = signal(false);

  setFitTextAutoWrapEnabled(enabled: boolean): void {
    this.fitTextAutoWrapEnabled.set(enabled);
  }

  formatHtmlForDisplay(text: string): string {
    if (!this.fitTextAutoWrapEnabled()) {
      return text;
    }

    return text
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  mapLineForCasting(line: LyricLine): LyricLine {
    return {
      ...line,
      text: this.formatHtmlForDisplay(line.text),
    };
  }

  mapLyricForCasting(lyric: LyricForCasting): LyricForCasting {
    return {
      ...lyric,
      lines: lyric.lines.map((line) => this.mapLineForCasting(line)),
    };
  }
}
