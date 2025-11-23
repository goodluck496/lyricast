import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  Input,
  OnDestroy,
  signal,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  FormGroup,
  FormsModule,
  NG_VALUE_ACCESSOR,
  NgControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MatCalendar,
  MatCalendarView,
  MatDatepickerModule,
  MatDateRangeInput,
  MatDateRangePicker,
} from '@angular/material/datepicker';
import { IMask, IMaskModule } from 'angular-imask';
import MaskedDate from 'imask/masked/date';
import { DateTime } from 'luxon';
import { InputMask } from 'imask';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { startWith, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FloatLabelModule } from 'primeng/floatlabel';

export interface CalendarValue {
  range: boolean;
  date?: Date;
  dateStart?: Date;
  dateEnd?: Date;
}

@Directive({ selector: '[lyriTextMask]', standalone: true })
export class TextMaskDirective implements AfterViewInit, OnDestroy {
  /** Ваши опции, например те же, что и у MaskedDateOptions */
  @Input('lyriTextMask') maskOptions: any;
  private maskRef!: InputMask<any>;

  constructor(
    private el: ElementRef<HTMLInputElement>,
    private ngControl: NgControl
  ) {}

  ngAfterViewInit() {
    this.maskRef = IMask(this.el.nativeElement, this.maskOptions);

    // 1) при каждом вводе обновляем текст
    this.maskRef.on('input', () => {
      // this.maskRef.updateValue();
    });

    // 2) когда маска полностью заполнена — ставим в форму Date
    this.maskRef.on('complete', () => {
      this.maskRef.updateValue();
    });
  }

  @HostListener('input')
  onInput() {
    // this.maskRef.updateValue();
  }

  ngOnDestroy() {
    this.maskRef.destroy();
  }
}

/** Custom header component for datepicker. */
@Component({
  selector: 'lyri-calendar-header',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      align-items: center;
      padding: 0.5em;

      &-label {
        display: flex;
        width: 100%;
        justify-content: center;
        align-items: center;
        font-weight: 500;
        text-align: center;

        span {
          display: flex;
          cursor: pointer;
        }
      }
    }
  `,
  template: `
    <div class="header">
      <button mat-icon-button (click)="onPreviousClicked('year')"><<</button>
      <button mat-icon-button (click)="onPreviousClicked('month')"><</button>
      <span class="header-label">
        <button mat-button (click)="onChangeCurrView('year')">
          {{ monthLabel() }}
        </button>
        <button mat-button (click)="onChangeCurrView('multi-year')">
          {{ yearLabel() }}
        </button>
      </span>
      <button mat-icon-button (click)="onNextClicked('month')">></button>
      <button mat-icon-button (click)="onNextClicked('year')">>></button>
    </div>
    @if (datePickerType === 'range') {
      <div style="display: flex; width: 100%;">
        <button mat-button (click)="onSetPeriod('today')">Сегодня</button>
        <button mat-button (click)="onSetPeriod('lastweek')">Неделя</button>
        <button mat-button (click)="onSetPeriod('month')">Месяц</button>
        <button mat-button (click)="onSetPeriod('year')">Год</button>
      </div>
    } @else {
      <button mat-button (click)="onSetPeriod('today')">Сегодня</button>
    }
  `,
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarHeaderComponent<D extends DateTime> {
  private _calendar = inject<MatCalendar<D>>(MatCalendar);
  private _dateAdapter = inject<DateAdapter<D>>(DateAdapter);
  private _dateFormats = inject(MAT_DATE_FORMATS);
  private _datePickerComponent = inject(DatepickerComponent);

  readonly periodLabel = signal('');
  readonly monthLabel = signal('');
  readonly yearLabel = signal('');

  datePickerType = this._datePickerComponent.type;

  constructor() {
    this._calendar.stateChanges
      .pipe(startWith(null), takeUntilDestroyed())
      .subscribe(() => {
        this.periodLabel.set(
          this._dateAdapter
            .format(
              this._calendar.activeDate,
              this._dateFormats.display.monthYearLabel
            )
            .toLocaleUpperCase()
        );
        this.monthLabel.set(
          this._calendar.activeDate.toFormat('LLLL').toLocaleUpperCase()
        );
        this.yearLabel.set(this._calendar.activeDate.toFormat('yyyy'));
      });
  }

  onChangeCurrView(type: MatCalendarView): void {
    this._calendar.currentView = type;
  }

  onPreviousClicked(mode: 'month' | 'year') {
    this._calendar.activeDate =
      mode === 'month'
        ? this._dateAdapter.addCalendarMonths(this._calendar.activeDate, -1)
        : this._dateAdapter.addCalendarYears(this._calendar.activeDate, -1);
  }

  onNextClicked(mode: 'month' | 'year') {
    this._calendar.activeDate =
      mode === 'month'
        ? this._dateAdapter.addCalendarMonths(this._calendar.activeDate, 1)
        : this._dateAdapter.addCalendarYears(this._calendar.activeDate, 1);
  }

  onSetPeriod(type: 'today' | 'lastweek' | 'month' | 'year') {
    const now = new Date();
    switch (type) {
      case 'today':
        if (this.datePickerType === 'range') {
          this._datePickerComponent.rangeGroup.setValue({
            start: new Date(),
            end: new Date(),
          });
        } else {
          this._datePickerComponent.singleDateControl.setValue(new Date());
        }

        break;
      case 'lastweek':
        this._datePickerComponent.rangeGroup.setValue({
          start: DateTime.fromJSDate(now).startOf('week').toJSDate(),
          end: DateTime.fromJSDate(now).endOf('week').toJSDate(),
        });
        break;

      case 'month': {
        const monthStart = DateTime.fromJSDate(now).startOf('month').toJSDate();
        this._datePickerComponent.rangeGroup.setValue({
          start: monthStart,
          end: now,
        });
        break;
      }

      case 'year': {
        const yearStart = DateTime.fromJSDate(now).startOf('year').toJSDate();
        this._datePickerComponent.rangeGroup.setValue({
          start: yearStart,
          end: now,
        });
        break;
      }
    }
    this._datePickerComponent.refreshCalendar();
  }
}

@Component({
  selector: 'lyri-datepicker',
  styles: `
    /*:host {
      --mat-form-field-container-vertical-padding: 9px;
      --mat-form-field-container-height: 40px;

      --mat-icon-button-state-layer-size: 20px;

      --mat-datepicker-calendar-container-background-color: #272b2a;
      --mat-datepicker-calendar-container-text-color: #e0e3e2;
      // фон выбранных дат в диапазоне
      --mat-datepicker-calendar-date-in-range-state-background-color: #004f4f;

      //фон выбранной даты
      //  --mat-datepicker-calendar-date-selected-state-background-color
      //цвет текста выбранной даты
      //  --mat-datepicker-calendar-date-selected-state-text-color

      ::ng-deep {
        .mat-mdc-form-field-subscript-wrapper {
          display: none;
        }

        .mat-mdc-text-field-wrapper.mdc-text-field {
          height: 100%;
        }

        .mat-mdc-icon-button.mat-mdc-button-touch-target {
          width: 20px !important;
          height: 20px !important;
        }

        .mat-calendar-body-cell {
          .mat-calendar-body-cell-content {
            border-radius: 8px !important;
          }

        }

      }

    }*/

    :root {
      --mat-form-field-container-vertical-padding: 9px;

      --mat-form-field-container-height: 40px;

      --mat-icon-button-state-layer-size: 20px;

      --mat-datepicker-calendar-container-background-color: #272b2a;
      --mat-datepicker-calendar-container-text-color: #e0e3e2;
      // фон выбранных дат в диапазоне
      --mat-datepicker-calendar-date-in-range-state-background-color: #004f4f;
    }

    .mat-calendar-body-preview-start .mat-calendar-body-cell-preview,
    .mat-calendar-body-preview-end .mat-calendar-body-cell-preview {
      //https://github.com/angular/components/blob/main/src/material/datepicker/calendar-body.scss#L126
      border-top-right-radius: 8px !important;
      border-bottom-right-radius: 8px !important;

    }

    .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .mat-mdc-text-field-wrapper.mdc-text-field {
      height: 100%;
    }

    .mat-mdc-icon-button.mat-mdc-button-touch-target {
      width: 20px !important;
      height: 20px !important;
    }

    .mat-calendar-body-cell {
      .mat-calendar-body-cell-content {
        border-radius: 8px;
      }

    }

    .vkb-form-field {
      height: var(--mat-form-field-container-height);
    }

  `,
  template: `
    <!--  если использовать @if@switch внутри mat-form-field,
     то некорретно работает mat-datapicker-toggle, ссылаясь на множество календарей в ng-content mat-form-field -->
    @if (type === 'single') {
    <mat-form-field appearance="outline" class="vkb-form-field w-full">
      <mat-label>Заголовок даты</mat-label>
      <input
        matInput
        [matDatepicker]="singlePicker"
        [formControl]="singleDateControl"
        placeholder="ДД.ММ.ГГГГ"
        [lyriTextMask]="maskProps"
      />

      <!-- можно заменить на DS иконку с добавлением обработки клика и открытия picker'а        -->
      <mat-datepicker-toggle
        matIconSuffix
        [for]="singlePicker"
      ></mat-datepicker-toggle>
      <mat-datepicker
        #singlePicker
        [startAt]="singleDateControl.value"
        [calendarHeaderComponent]="CalendarHeaderComponent"
      ></mat-datepicker>
    </mat-form-field>

    } @else {
    <mat-form-field appearance="outline" class="vkb-form-field w-full">
      <mat-label>Заголовок даты</mat-label>

      <mat-date-range-input
        id="calendar"
        #rangeInput
        [min]="minDate"
        [formGroup]="rangeGroup"
        [rangePicker]="rangePicker"
      >
        <!-- START -->
        <input
          matStartDate
          formControlName="start"
          placeholder="ДД.ММ.ГГГГ"
          [lyriTextMask]="maskProps"
          (click)="rangePicker.open()"
          (blur)="onTouched()"
        />
        <!-- END -->
        <input
          matEndDate
          formControlName="end"
          placeholder="ДД.ММ.ГГГГ"
          [lyriTextMask]="maskProps"
          (click)="onDateEndClick()"
          (blur)="onTouched()"
        />
      </mat-date-range-input>

      <!-- можно заменить на DS иконку с добавлением обработки клика и открытия picker'а        -->
      <mat-datepicker-toggle
        matIconSuffix
        [for]="rangePicker"
      ></mat-datepicker-toggle>
      <mat-date-range-picker
        #rangePicker
        [startAt]="rangeGroup.value.start"
        [calendarHeaderComponent]="CalendarHeaderComponent"
      ></mat-date-range-picker>
    </mat-form-field>
    }
  `,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule, // для DateAdapter
    IMaskModule,
    ReactiveFormsModule,
    TextMaskDirective,
    FloatLabelModule,
  ],
  //без отключения инкапсуляции переопределение некоторых стилей даже через ng-deep не возможно
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatepickerComponent),
      multi: true,
    },
  ],
  standalone: true,
})
export class DatepickerComponent implements ControlValueAccessor {
  minDate = DateTime.fromFormat('01.01.1970', 'dd.MM.yyyy').toJSDate();
  maskProps: MaskedDate = new MaskedDate({
    pattern: 'd{.}`m{.}`Y',
    blocks: {
      d: {
        mask: IMask.MaskedRange,
        from: 1,
        to: 31,
        maxLength: 2,
      },
      m: {
        mask: IMask.MaskedRange,
        from: 1,
        to: 12,
        maxLength: 2,
      },
      Y: {
        mask: IMask.MaskedRange,
        from: 1900,
        to: 9999,
        maxLength: 4,
      },
    },
    autofix: true,
  });

  rangeGroup = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  singleDateControl = new FormControl<Date | null>(null);

  @Input() type: 'range' | 'single' = 'single';

  @ViewChild('rangeInput') rangeInput!: MatDateRangeInput<Date>;
  @ViewChild('rangePicker') rangePicker!: MatDateRangePicker<Date>;
  @ViewChild('singlePicker') singlePicker!: MatDateRangePicker<Date>;

  value: CalendarValue = { range: true };

  onDateEndClick() {
    const startControl = this.rangeGroup.get('start')!;

    if (!startControl.value) {
      startControl.setValue(new Date());
    }

    this.rangePicker.open();
  }

  refreshCalendar() {
    const pickerByType =
      this.type === 'single' ? this.singlePicker : this.rangePicker;

    if (pickerByType.opened) {
      pickerByType.closedStream.pipe(take(1)).subscribe(() => {
        pickerByType.open();
      });
      pickerByType.close();
    } else {
      pickerByType.open();
    }
  }

  onChange = (_: CalendarValue) => {};

  onTouched = () => {};

  writeValue(val: CalendarValue | null) {
    if (val) this.value = val;
  }

  registerOnChange(fn: any) {
    this.onChange = fn;
  }

  registerOnTouched(fn: any) {
    this.onTouched = fn;
  }

  protected readonly CalendarHeaderComponent = CalendarHeaderComponent;
}
