import { inject, Injectable } from '@angular/core';
import { AppDisplay } from '@lyri-cast/common-electron';
import { WindowService } from './window.service';
import { BehaviorSubject } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';

//////////////////////////////////////////
/// todo перенести в отдельную фичу
//////////////////////////////////////////
@Injectable({ providedIn: 'root' })
export class SettingsService {
  winSrv = inject(WindowService);

  displays: AppDisplay[] = [];

  private displayForCasting$ = new BehaviorSubject<AppDisplay | null>(null);

  public async init() {
    await this.loadDisplays();
    return this;
  }

  setDisplayForCasting(display: AppDisplay) {
    this.displayForCasting$.next(display);
  }

  getDisplayForCasting() {
    return this.displayForCasting$.asObservable().pipe(filterEmpty());
  }

  private loadDisplays(): Promise<AppDisplay[]> {
    return this.winSrv.electronContext
      .getDisplays()
      .then((displays: AppDisplay[]) => {
        this.displays = displays;

        if (displays.length === 1) {
          this.setDisplayForCasting(displays[0]);
        }

        displays.forEach((el) => {
          if (el.primary) {
            return;
          }

          this.setDisplayForCasting(el);
        });

        return displays;
      });
  }
}
