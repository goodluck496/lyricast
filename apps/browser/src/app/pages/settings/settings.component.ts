import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsService } from '@lyri-cast/common-browser';
import { AppDisplay } from '@lyri-cast/common-electron';
import { CardModule } from 'primeng/card';
import { ButtonDirective } from 'primeng/button';
import { Observable } from 'rxjs';

@Component({
  selector: 'lyri-settings',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonDirective],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  cdr = inject(ChangeDetectorRef);
  settingsSrv = inject(SettingsService);

  displays: AppDisplay[] = [];

  selectedDisplay$: Observable<AppDisplay | null> =
    this.settingsSrv.getDisplayForCasting();

  ngOnInit() {
    this.settingsSrv.init().then((srv) => {
      this.displays = [...srv.displays];
      this.cdr.detectChanges();
    });
  }

  onSelectDisplay(display: AppDisplay) {
    this.settingsSrv.setDisplayForCasting(display);
  }
}
