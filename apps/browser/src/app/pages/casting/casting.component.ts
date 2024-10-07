import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit, signal
} from '@angular/core';
import { BridgeService } from '../../../services/bridge.service';
import { filterEmpty } from '@lyri-cast/common';
import { ElectronEvents, EventPayloadItem } from '@lyri-cast/common-electron';
import { ILyric, ISong } from '@lyri-cast/entities';

@Component({
  selector: 'lyri-casting-page',
  standalone: true,
  imports: [],
  templateUrl: './casting.component.html',
  styleUrl: './casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastingComponent implements OnInit {
  bridge = inject(BridgeService);
  cdr = inject(ChangeDetectorRef);

  selectedSong = signal<ISong | null>(null);
  selectedLyric = signal<ILyric | null>(null);

  showingContent = signal(false);

  lines = signal<string[]>([]);

  ngOnInit() {
    this.bridge.queueEvents.pipe(filterEmpty()).subscribe((data) => {
      if (data.event === ElectronEvents.SONG__SHOW_LYRIC_BLOCK) {
        const payload =
          data.payload as EventPayloadItem<ElectronEvents.SONG__SHOW_LYRIC_BLOCK>;

        this.selectedSong.set(payload.song);
        this.selectedLyric.set(payload.lyric);
        this.lines.set([...payload.showedBlock]);
        this.showingContent.set(true);
        // this.cdr.detectChanges();
      }

      if (data.event === ElectronEvents.SONG__HIDE_LYRIC_BLOCK) {
        this.showingContent.set(false);
        // this.cdr.detectChanges();
      }
    });
  }
}
