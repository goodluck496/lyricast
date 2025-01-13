import {
  AfterContentInit,
  ChangeDetectorRef,
  Component,
  computed,
  contentChildren,
  forwardRef,
  inject,
  input,
  OnChanges,
  signal,
  SimpleChanges,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  ScrollingModule,
} from '@angular/cdk/scrolling';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { PrimeTemplate } from 'primeng/api';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { NgScrollbarExt } from 'ngx-scrollbar';
import { NgScrollbarCdkVirtualScroll } from 'ngx-scrollbar/cdk';
import { InputTextModule } from 'primeng/inputtext';
import { HighlighterPipe } from '../pipes/index';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';

export interface IUiLyriListItem<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
}

export enum ListBoxTemplates {
  ITEM = 'item',
}

@Component({
  selector: 'lyri-list-box',
  standalone: true,
  imports: [
    CommonModule,
    CdkFixedSizeVirtualScroll,
    CdkListbox,
    CdkVirtualForOf,
    CdkOption,
    ScrollingModule,
    NgScrollbarExt,
    NgScrollbarCdkVirtualScroll,
    InputTextModule,
    FormsModule,
    HighlighterPipe,
    IconFieldModule,
    InputIconModule,
  ],
  templateUrl: './list-box.component.html',
  styleUrl: './list-box.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ListBoxComponent),
      multi: true,
    },
  ],
})
export class ListBoxComponent
  implements AfterContentInit, ControlValueAccessor, OnChanges
{
  private cdr = inject(ChangeDetectorRef);
  private virtualScroll = viewChild(NgScrollbarExt);

  // private ngControl = inject(FormControlDirective, {skipSelf: false});

  items = input<IUiLyriListItem[]>([]);
  multi = input(false);
  withSearch = input(true)

  showItems = computed(() => {
    console.log('this.items()', this.items());
    return this.items().filter(
        (item) =>
          item.title
            .trim()
            .toLowerCase()
            .includes(this.searchStringSig().toLowerCase()) ||
          item.searchKey
            .toLowerCase()
            .includes(this.searchStringSig().toLowerCase() || '')
      )
    }
  );
  searchStringSig = signal<string>('');

  templates = contentChildren(PrimeTemplate);

  listBoxTemplates: Partial<Record<ListBoxTemplates, TemplateRef<unknown>>> =
    {};

  selectedItems: Map<string, IUiLyriListItem> = new Map();

  onChanges: (data: IUiLyriListItem | IUiLyriListItem[] | null) => void = (
    data: IUiLyriListItem | IUiLyriListItem[] | null
  ) => void 0;
  onTouched: () => void = () => void 0;

  value?: IUiLyriListItem | IUiLyriListItem[] | null;

  public onItemClick(item: IUiLyriListItem) {
    console.log('click item');
    if (!this.selectedItems.has(item.searchKey)) {
      if (this.multi()) {
        this.selectedItems.set(item.searchKey, item);
      } else {
        this.selectedItems.clear();
        this.selectedItems.set(item.searchKey, item);
      }
    } else {
      this.selectedItems.delete(item.searchKey);
    }

    this.writeValue();
  }

  public onSearch(search: string): void {
    this.searchStringSig.set(search);
  }

  onClear() {
    this.value = null;
    this.onChanges(null);
    this.searchStringSig.set('');
  }

  ngAfterContentInit() {
    this.templates().forEach((item) => {
      this.listBoxTemplates[item.name as ListBoxTemplates] = item.template;
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if ('items' in changes) {
      this.selectedItems = new Map();
    }
  }

  protected readonly ListBoxTemplates = ListBoxTemplates;

  registerOnChange(
    fn: (data: IUiLyriListItem | IUiLyriListItem[] | null) => void
  ): void {
    this.onChanges = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  writeValue(): void {
    const result = Array.from(this.selectedItems).map(([_, data]) => data);

    console.log('write', result);
    this.onChanges(this.multi() ? result : result[0]);
  }
}
