import { Component, inject } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { SongsService } from '../../songs.service';
import { IShortSong, ISongBookName } from '@lyri-cast/entities';
import { BehaviorSubject, Observable, of, switchMap } from 'rxjs';
import { CardModule } from 'primeng/card';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ButtonDirective } from 'primeng/button';
import { WindowService } from '../../../services/window.service';

@Component({
  selector: 'lyri-home',
  standalone: true,
  imports: [
    AsyncPipe,
    JsonPipe,
    CardModule,
    ScrollPanelModule,
    ButtonDirective,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  public songsService = inject(SongsService);
  public WINDOW = inject(WindowService);

  songBooks$ = this.songsService.getAllSongBooks();

  selectedBook$ = new BehaviorSubject<ISongBookName | null>(null);

  selectedSong$ = new BehaviorSubject<IShortSong | null>(null);

  selectedFullSong$ = this.selectedSong$.pipe(
    switchMap((item) => {
      if (!item) {
        return of(null);
      }

      return this.songsService.getSong(this.selectedBook$.value!, item.number);
    })
  );

  songs$: Observable<IShortSong[]> = this.selectedBook$.pipe(
    switchMap((book) => {
      if (!book) {
        return of([]);
      }

      return this.songsService.getSongsByBook(book);
    })
  );

  onBookClick(item: ISongBookName) {
    this.selectedBook$.next(item);
    this.selectedSong$.next(null);
  }

  onSongClick(song: IShortSong): void {
    this.selectedSong$.next(song);
  }

  onOpenWindow() {
    this.WINDOW.electronContext.openWindow({
      title: 'new window title',
      show: true,
      opacity: 0.5,
      center: true,
      focusable: true,
    })
  }
}
