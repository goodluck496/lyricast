import { inject, Injectable } from '@angular/core';
import { WindowService } from './common/window.service';
import {
  AppWindowTypes,
  ElectronEvents,
  EventData,
} from '@lyri-cast/common-electron';
import { ILyric, ISong } from '@lyri-cast/entities';
import { BridgeService } from './bridge.service';
import { Pages } from '../app/pages/page.types';
import { filterEmpty } from '@lyri-cast/common';
import { Observable, of, switchMap, tap } from 'rxjs';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';

@Injectable({ providedIn: 'root' })
export class CastingService {
  windowSrv = inject(WindowService);
  bridgeService = inject(BridgeService);

  openedCastingWindowId: number | null = null;

  constructor() {
    this.initWindowsSubs();
  }

  openWindow({
    song,
    lyricBlock,
  }: {
    song: ISong;
    lyricBlock: { lyric: ILyric; selectedChunk: string[] };
  }): Observable<EventData<ElectronEvents> | null> {
    return of(this.openedCastingWindowId).pipe(
      switchMap((windowId) => {
        if (windowId) {
          console.warn(
            `Window is opened - [procId]${this.openedCastingWindowId}`
          );
          return of(windowId);
        }
        return fromPromise(
          this.windowSrv.electronContext.openWindow({
            type: AppWindowTypes.SONG_CASTING,
            title: 'Casting',
            show: true,
            opacity: 0.5,
            center: true,
            // fullscreen: true,
            focusable: true,
          })
        );
      }),
      switchMap((procId) => {
        this.openedCastingWindowId = procId;
        this.windowSrv.electronContext.send({
          event: ElectronEvents.OPEN_PAGE,
          payload: { name: Pages.CASTING },
        });

        return this.bridgeService.queueEvents.asObservable();
      }),
      tap(() => {
        this.showLyricBlock(song, lyricBlock);
      })
    );
  }

  initWindowsSubs() {
    this.bridgeService.queueEvents.pipe(filterEmpty()).subscribe((data) => {
      if (data.event === ElectronEvents.CLOSE_WINDOW) {
        this.closeWindowHandler(data as EventData<ElectronEvents.CLOSE_WINDOW>);
      }

      if (data.event === ElectronEvents.INIT_NEW_WINDOW) {
        this.openCastingPageHandler();
      }
    });
  }

  closeWindowHandler(data: EventData<ElectronEvents.CLOSE_WINDOW>): void {
    const { payload } = data;

    if (this.openedCastingWindowId !== payload.processId) {
      return;
    }

    this.openedCastingWindowId = null;
    this.closeWindow();
  }

  openCastingPageHandler(): void {
    this.windowSrv.electronContext.send({
      event: ElectronEvents.OPEN_PAGE,
      payload: { name: Pages.CASTING },
    });
  }

  hideCasting() {
    this.windowSrv.electronContext.send({
      event: ElectronEvents.SONG__HIDE_LYRIC_BLOCK,
      payload: void 0,
    });
  }

  closeCasting(): void {
    this.closeWindow();
  }

  closeWindow(): Promise<void> {
    return this.windowSrv.electronContext.closeWindow({
      type: AppWindowTypes.SONG_CASTING,
    });
  }

  showLyricBlock(
    song: ISong,
    lyricBlock: { lyric: ILyric; selectedChunk: string[] }
  ) {
    this.windowSrv.electronContext.send({
      event: ElectronEvents.SONG__SHOW_LYRIC_BLOCK,
      payload: {
        song,
        lyric: lyricBlock.lyric,
        showedBlock: lyricBlock.selectedChunk,
      },
    });
  }
}
