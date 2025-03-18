import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressBarModule } from 'primeng/progressbar';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { IShortSong } from '@lyri-cast/entities';
import { SongSearchService } from '../../song-search.service';
import { SongActions } from '@lyri-cast/song-feature';

@Component({
  selector: 'lyri-song-search-result',
  standalone: true,
  imports: [CommonModule, ProgressBarModule],
  templateUrl: './song-search-result.component.html',
  styleUrl: './song-search-result.component.scss',
})
export class SongSearchResultComponent {
  searchSrv = inject(SongSearchService);
  store = inject(Store);

  isLoading = this.searchSrv.isLoading;

  searchResult$: Observable<IShortSong[]> =
    this.searchSrv.searchResult$.asObservable();

  onSelectSearchElement(value: IShortSong) {
    // this.store.dispatch(SongActions.selectSong(value));
  }
}
