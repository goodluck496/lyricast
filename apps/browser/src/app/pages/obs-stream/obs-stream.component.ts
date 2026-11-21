import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BridgeService } from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS } from '@lyri-cast/common-electron';
import {
  selectCastingProcess as selectSongCasting,
  selectNavigateState as selectSongNavigate,
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
} from '@lyri-cast/song-store';
import {
  selectCastingProcess as selectBibleCasting,
  BibleStartCastingPayload,
} from '@lyri-cast/bible-store';

@Component({
  selector: 'lyri-obs-stream',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './obs-stream.component.html',
  styleUrl: './obs-stream.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObsStreamComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly bridge = inject(BridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  badgeTitle = signal('');
  textLines = signal<string[]>([]);
  isVisible = signal(false);
  isBlackout = signal(false);

  private songLyrics: { lines: string[] }[] = [];
  private currentSongIndex = 0;
  private prevBodyBg = '';

  ngOnInit() {
    // Make body transparent for OBS Browser Source alpha-transparency
    if (typeof document !== 'undefined') {
      this.prevBodyBg = document.body.style.backgroundColor;
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
    }

    // Song casting listener
    this.store
      .select(selectSongCasting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        if (data) {
          this.handleSongCasting(data);
        } else {
          this.isVisible.set(false);
        }
        this.cdr.markForCheck();
      });

    // Song navigation listener
    this.store
      .select(selectSongNavigate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        if (data && this.songLyrics.length > 0) {
          this.handleSongNavigate(data);
          this.cdr.markForCheck();
        }
      });

    // Bible casting listener
    this.store
      .select(selectBibleCasting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        if (data) {
          this.handleBibleCasting(data);
        } else {
          this.isVisible.set(false);
        }
        this.cdr.markForCheck();
      });

    // Emergency blackout listener
    this.bridge.queueEvents
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (!evt) return;
        if (evt.event === 'BLACKOUT_ALL' || evt.event === 'BLACKOUT_OBS') {
          const payload = evt.payload as { active?: boolean } | undefined;
          this.isBlackout.set(payload?.active ?? !this.isBlackout());
          this.cdr.markForCheck();
        }
      });
  }

  ngAfterViewInit() {
    this.bridge.windowSrv.electronContext.send({
      event: APP_COMMON_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: 'obs-stream' },
    });
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.body.style.backgroundColor = this.prevBodyBg;
      document.documentElement.style.backgroundColor = '';
    }
  }

  private handleSongCasting(payload: SongStartCastingPayload) {
    this.badgeTitle.set(payload.song?.title ? `🎵 ${payload.song.title}` : '🎵 ПЕСНЯ');

    const lyrics = payload.lyrics || [];
    this.songLyrics = lyrics.map((lyric: any) => ({
      lines: lyric.text
        ? Array.isArray(lyric.text)
          ? lyric.text
          : [lyric.text]
        : lyric.lines
          ? lyric.lines.map((l: any) => l.text)
          : [],
    }));

    this.currentSongIndex = payload.fromIndex || 0;
    this.updateCurrentSongText();
  }

  private handleSongNavigate(payload: SongPresentationNavigatePayload) {
    if (typeof payload.index === 'number') {
      this.currentSongIndex = payload.index;
    } else if (payload.direction === 'next') {
      this.currentSongIndex = Math.min(
        this.currentSongIndex + 1,
        this.songLyrics.length - 1
      );
    } else if (payload.direction === 'prev') {
      this.currentSongIndex = Math.max(this.currentSongIndex - 1, 0);
    }
    this.updateCurrentSongText();
  }

  private updateCurrentSongText() {
    const current = this.songLyrics[this.currentSongIndex];
    if (current && current.lines.length > 0) {
      this.textLines.set(current.lines);
      this.isVisible.set(true);
    } else {
      this.textLines.set([]);
      this.isVisible.set(false);
    }
  }

  private handleBibleCasting(payload: BibleStartCastingPayload) {
    const bookTitle = payload.book?.title || '';
    const chapter = payload.chapter?.number || '';
    const verses = payload.content || [];
    const currentVerse = verses[0];

    const verseNum = currentVerse?.number ? `:${currentVerse.number}` : '';
    this.badgeTitle.set(`📖 ${bookTitle} ${chapter}${verseNum}`);

    if (currentVerse && currentVerse.text && currentVerse.text.length > 0) {
      this.textLines.set(currentVerse.text);
      this.isVisible.set(true);
    } else {
      this.textLines.set([]);
      this.isVisible.set(false);
    }
  }
}
