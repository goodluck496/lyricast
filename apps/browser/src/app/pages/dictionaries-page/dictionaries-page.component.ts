import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { map } from 'rxjs';
import { SongDictionariesManagerComponent } from '../../components/song-dictionaries-manager/song-dictionaries-manager.component';

@Component({
  selector: 'lyri-dictionaries-page',
  standalone: true,
  imports: [CommonModule, ButtonModule, SongDictionariesManagerComponent],
  templateUrl: './dictionaries-page.component.html',
  styleUrl: './dictionaries-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionariesPageComponent {
  private readonly songsApi = inject(SongsApiService);
  private readonly destroyRef = inject(DestroyRef);

  showSongsManager = signal(false);

  localSongBooksCount$ = this.songsApi.getAllSongBooks().pipe(
    map((books) => (Array.isArray(books) ? books.length : 0)),
    takeUntilDestroyed(this.destroyRef)
  );
}
