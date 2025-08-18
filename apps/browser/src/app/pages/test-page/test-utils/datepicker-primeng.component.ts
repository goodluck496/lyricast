import { Component, Input } from '@angular/core';
import { CalendarModule } from 'primeng/calendar';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';


@Component({
  selector: 'lyri-datepicker-primeng',
  standalone: true,
  imports: [CalendarModule, FormsModule, JsonPipe],
  template: `
    <p-calendar [(ngModel)]="rangeDate" [selectionMode]="type" >
      <ng-template pTemplate="header"> abra cadabra</ng-template>
    </p-calendar>
    {{ rangeDate | json }}
  `,
})
export class DatepickerPrimengComponent {
  rangeDate: any;

  @Input() type: any;
}
