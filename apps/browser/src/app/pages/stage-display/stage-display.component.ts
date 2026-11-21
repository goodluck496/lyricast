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
  selector: 'lyri-stage-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stage-display.component.html',
  styleUrl: './stage-display.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StageDisplayComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly bridge = inject(BridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  currentTime = signal('');
  clockIntervalId: ReturnType<typeof setInterval> | null = null;

  contentType = signal<'song' | 'bible' | 'idle'>('idle');
  headerTitle = signal('');
  slideIndicator = signal('');

  currentText = signal<string[]>([]);
  nextText = signal<string[]>([]);

  operatorMessage = signal<string | null>(null);
  isBlackout = signal(false);

  // Cached song slides
  private songLyrics: { lines: string[] }[] = [];
  private currentSongIndex = 0;

  ngOnInit() {
    this.updateClock();
    this.clockIntervalId = setInterval(() => this.updateClock(), 1000);

    // Song casting listener
    this.store
      .select(selectSongCasting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        if (data) {
          this.handleSongCasting(data);
        } else if (this.contentType() === 'song') {
          this.contentType.set('idle');
          this.currentText.set([]);
          this.nextText.set([]);
          this.headerTitle.set('');
          this.slideIndicator.set('');
        }
        this.cdr.markForCheck();
      });

    // Song navigation listener
    this.store
      .select(selectSongNavigate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        if (data && this.contentType() === 'song') {
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
        } else if (this.contentType() === 'bible') {
          this.contentType.set('idle');
          this.currentText.set([]);
          this.nextText.set([]);
          this.headerTitle.set('');
          this.slideIndicator.set('');
        }
        this.cdr.markForCheck();
      });

    // Direct bridge events listener for emergency signals and operator messages
    this.bridge.queueEvents
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (!evt) return;
        if (evt.event === 'BLACKOUT_ALL' || evt.event === 'BLACKOUT_STAGE') {
          const payload = evt.payload as { active?: boolean } | undefined;
          this.isBlackout.set(payload?.active ?? !this.isBlackout());
          this.cdr.markForCheck();
        } else if (evt.event === 'STAGE_ALERT_MESSAGE') {
          const payload = evt.payload as { message?: string } | undefined;
          this.operatorMessage.set(payload?.message || null);
          this.cdr.markForCheck();
        }
      });
  }

  ngAfterViewInit() {
    this.bridge.windowSrv.electronContext.send({
      event: APP_COMMON_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: 'stage-display' },
    });
  }

  ngOnDestroy() {
    if (this.clockIntervalId) {
      clearInterval(this.clockIntervalId);
    }
  }

  private updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    this.currentTime.set(`${hours}:${minutes}:${seconds}`);
  }

  private handleSongCasting(payload: SongStartCastingPayload) {
    this.contentType.set('song');
    this.headerTitle.set(payload.song?.title || 'Песня');

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
    this.updateSongSlides();
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
    this.updateSongSlides();
  }

  private updateSongSlides() {
    const total = this.songLyrics.length;
    const current = this.songLyrics[this.currentSongIndex];
    const next = this.songLyrics[this.currentSongIndex + 1];

    this.slideIndicator.set(total > 0 ? `${this.currentSongIndex + 1} / ${total}` : '');
    this.currentText.set(current ? current.lines : []);
    this.nextText.set(next ? next.lines : ['(Конец песни)']);
  }

  private handleBibleCasting(payload: BibleStartCastingPayload) {
    this.contentType.set('bible');
    const bookTitle = payload.book?.title || '';
    const chapter = payload.chapter?.number || '';
    this.headerTitle.set(`${bookTitle} ${chapter}`);

    const verses = payload.content || [];
    const currentVerse = verses[0];
    const currentLines = currentVerse ? currentVerse.text || [] : [];
    this.currentText.set(currentLines);

    // Indicator
    if (currentVerse) {
      this.slideIndicator.set(`Стих ${currentVerse.number || ''}`);
    }

    // Next verse if present
    const nextVerse = verses[1];
    this.nextText.set(
      nextVerse ? nextVerse.text || [] : ['(Конец фрагмента)']
    );
  }
}
