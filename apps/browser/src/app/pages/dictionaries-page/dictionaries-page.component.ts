import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { map } from 'rxjs';
import { SongDictionariesManagerComponent } from '../../components/song-dictionaries-manager/song-dictionaries-manager.component';
import { BibleDictionariesManagerComponent } from '../../components/bible-dictionaries-manager/bible-dictionaries-manager.component';

@Component({
  selector: 'lyri-dictionaries-page',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    SongDictionariesManagerComponent,
    BibleDictionariesManagerComponent,
  ],
  templateUrl: './dictionaries-page.component.html',
  styleUrl: './dictionaries-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionariesPageComponent {
  private readonly songsApi = inject(SongsApiService);
  private readonly bibleApi = inject(BibleApiService);
  private readonly destroyRef = inject(DestroyRef);

  showSongsManager = signal(false);
  showBiblesManager = signal(false);

  localSongBooksCount$ = this.songsApi.getAllSongBooks().pipe(
    map((books) => (Array.isArray(books) ? books.length : 0)),
    takeUntilDestroyed(this.destroyRef)
  );

  localBiblesCount$ = this.bibleApi.getTranslates().pipe(
    map((bibles) => (Array.isArray(bibles) ? bibles.length : 0)),
    takeUntilDestroyed(this.destroyRef)
  );
}
