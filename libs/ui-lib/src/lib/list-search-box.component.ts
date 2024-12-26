import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  effect,
  forwardRef,
  inject,
  input,
  OnChanges,
  OnInit,
  output,
  SimpleChanges,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrimeTemplate, SelectItem } from 'primeng/api';
import { Dropdown, DropdownModule } from 'primeng/dropdown';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

export interface IUiLyriDictItem<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
}

export interface IUiLyriItemInList<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
}

@Component({
  selector: 'lyri-list-search-box',
  standalone: true,
  imports: [CommonModule, PrimeTemplate, DropdownModule, ReactiveFormsModule],
  templateUrl: './list-search-box.component.html',
  styleUrl: './list-search-box.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ListSearchBoxComponent),
      multi: true,
    },
  ],
})
export class ListSearchBoxComponent
  implements OnInit, OnChanges, ControlValueAccessor
{
  destroyRef = inject(DestroyRef);
  cdr = inject(ChangeDetectorRef);

  $dictList = input.required<IUiLyriDictItem[]>();

  $itemList = input<IUiLyriItemInList[]>();

  selectedDict = input<IUiLyriDictItem | null>(null);

  selectDict = output<IUiLyriDictItem<any>>();

  selectItem = output<IUiLyriItemInList>();

  templates = contentChildren(PrimeTemplate);

  dropdown = viewChild.required(Dropdown);

  templatesMap: Record<string, TemplateRef<any>> = {};

  dictListControl = new FormControl<SelectItem | null>(null);

  dictListItems = computed(() =>
    this.$dictList().map((data) => this.transformDictItem(data))
  );

  value: IUiLyriItemInList | null = null;

  onChange: (data: any) => void = (data: any) => void 0;
  onTouched: () => void = () => void 0;

  constructor() {
    effect(() => {
      this.checkTemplates();
    });
  }

  ngOnInit() {
    this.dictListControl.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(
          this.$dictList().map((el) => this.transformDictItem(el))[0] || null
        )
      )
      .subscribe((value) => {
        if (!value) {
          return;
        }
        console.log('selectDict, emit', value);
        this.selectDict.emit(this.transformFromDict(value));
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    if ('selectedDict' in changes) {
      const selectedDict = this.selectedDict();
      console.log('selectedDict', selectedDict, changes);
      if (selectedDict) {
        this.dictListControl.setValue(this.transformDictItem(selectedDict), {emitEvent: false});
      }
    }
  }

  onChangeItem(item: IUiLyriItemInList) {
    console.log('-------', item);
  }

  transformDictItem(data: IUiLyriDictItem): SelectItem {
    return {
      label: data.title,
      title: data.title,
      value: data.searchKey,
    };
  }

  transformFromDict(data: SelectItem): IUiLyriDictItem {
    return {
      searchKey: data.value,
      title: data.title || data.value,
      baseEntity: data,
    };
  }

  checkTemplates(): void {
    this.templates().forEach((el) => {
      this.templatesMap[el.name || 'unknown'] = el.template;
    });
    this.cdr.detectChanges();
  }

  registerOnChange(fn: (data: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  writeValue(obj: any): void {
    this.value = obj;
    console.log('1111', obj);
  }
}
