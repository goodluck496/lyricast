import { Directive, inject, Input, ViewChild } from '@angular/core';
import {
  ControlContainer,
  ControlValueAccessor,
  FormControl,
  FormControlDirective,
} from '@angular/forms';

@Directive()
export abstract class ControlValueAccessorBaseDirective<T>
  implements ControlValueAccessor
{
  @ViewChild(FormControlDirective, { static: true })
  public formControlDirective?: FormControlDirective;

  @Input({ required: true })
  public formControl!: FormControl<T | null>;
  @Input()
  public formControlName?: string;

  private readonly newFormControl: FormControl<T | null> = new FormControl(
    null
  );

  readonly controlContainer = inject(ControlContainer, { optional: true });
  //
  // protected constructor(
  //   @Optional() protected readonly controlContainer?: ControlContainer,
  //   // @Optional() protected formErrorsService?: FormErrorsService
  // ) {}

  public get control(): FormControl<T | null> {
    return (
      this.formControl ||
      (this.formControlName &&
        (this.controlContainer?.control?.get(
          this.formControlName
        ) as FormControl<T> | null)) ||
      this.newFormControl
    );
  }

  // public get errorMessage(): string | null {
  //   if (!this.formErrorsService || !this.control) {
  //     return null;
  //   }
  //
  //   return this.formErrorsService.getFormControlErrorText(this.control);
  // }

  private get valueAccessorExists(): boolean {
    return !!(
      this.formControlDirective && this.formControlDirective?.valueAccessor
    );
  }

  public registerOnTouched(fn: () => void): void {
    this.formControlDirective?.valueAccessor?.registerOnTouched(fn);
  }

  public registerOnChange(fn: () => void): void {
    this.formControlDirective?.valueAccessor?.registerOnChange(fn);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public writeValue(obj: any): void {
    this.formControlDirective?.valueAccessor?.writeValue(obj);
  }

  public setDisabledState(isDisabled: boolean): void {
    if (
      this.valueAccessorExists &&
      this.formControlDirective?.valueAccessor?.setDisabledState
    ) {
      this.formControlDirective.valueAccessor.setDisabledState(isDisabled);
    }
  }
}
