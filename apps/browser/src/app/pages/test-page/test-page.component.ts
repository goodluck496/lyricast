import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { BridgeService } from '@lyri-cast/common-browser';
import { DatepickerComponent } from './test-utils/datepicker.component';
import { DropdownChangeEvent, DropdownModule } from 'primeng/dropdown';
import { DatepickerPrimengComponent } from './test-utils/datepicker-primeng.component';
import { MatCalendar } from '@angular/material/datepicker';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';

@Component({
  selector: 'lyri-test-page',
  standalone: true,
  imports: [
    DatepickerComponent,
    DropdownModule,
    DatepickerPrimengComponent,
    MatCalendar,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
  ],
  templateUrl: './test-page.component.html',
  styleUrl: './test-page.component.scss',
})
export class TestPageComponent implements OnInit {
  private bridgeSrv = inject(BridgeService);

  selectType: 'single' | 'range' = 'single';

  protected isOpen = signal<boolean>(false);

  @ViewChild('container', { static: false })
  datepickerContainer!: ElementRef<HTMLDivElement>;

  protected onBlur($event: FocusEvent) {
    const relatedTarget = $event.relatedTarget;
    if (
      !relatedTarget ||
      !(relatedTarget instanceof HTMLElement) ||
      !this.datepickerContainer.nativeElement.contains(relatedTarget)
    ) {
      this.isOpen.set(false);
    }
  }

  ngOnInit() {}

  onChangeType(type: DropdownChangeEvent) {
    if (type.value === 'EQUAL') {
      this.selectType = 'single';
    }

    if (type.value === 'BETWEEN') {
      this.selectType = 'range';
    }

    console.log('changeType', type);
  }
}
