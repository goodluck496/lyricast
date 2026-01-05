import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SongDictionariesManagerComponent } from '../../components/song-dictionaries-manager/song-dictionaries-manager.component';

@Component({
  selector: 'lyri-dictionaries-page',
  standalone: true,
  imports: [CommonModule, SongDictionariesManagerComponent],
  templateUrl: './song-dictionaries-page.component.html',
  styleUrl: './song-dictionaries-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongDictionariesPageComponent {}
