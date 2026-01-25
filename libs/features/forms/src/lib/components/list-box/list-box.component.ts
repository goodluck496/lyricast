import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  forwardRef,
  inject,
  input,
  OnChanges,
  OnInit,
  signal,
  SimpleChanges,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
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
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ControlValueAccessorBaseDirective } from '../../control-value-accessor-base.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HighlighterPipe } from '@lyri-cast/ui-lib';
import { IUiLyriListItem, ListBoxTemplates } from './types';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

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
    ProgressSpinnerModule,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListBoxComponent<T>
  extends ControlValueAccessorBaseDirective<IUiLyriListItem<T>>
  implements OnInit, AfterContentInit, ControlValueAccessor, OnChanges
{
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private virtualScroll = viewChild(NgScrollbarExt);
  private cdkScroll = viewChild.required(CdkVirtualScrollViewport);

  items = input<IUiLyriListItem[]>([]);
  multi = input(false);
  withSearch = input(true);
  placeholder = input('');
  loading = input(false);

  showItems = computed(() => {
    return this.items()
      .filter((item) => {
        return (
          item.title
            .trim()
            .toLowerCase()
            .includes(this.searchStringSig().toLowerCase()) ||
          item.searchKey
            .toLowerCase()
            .includes(this.searchStringSig().toLowerCase() || '')
        );
      })
      .map((item, index) => ({
        ...item,
        index,
      }));
  });
  searchStringSig = signal<string>('');

  templates = contentChildren(PrimeTemplate);

  listBoxTemplates: Partial<Record<ListBoxTemplates, TemplateRef<unknown>>> =
    {};

  selectedItems: Map<string, IUiLyriListItem<T>> = new Map();

  ITEM_SIZE = 41;

  ngOnInit() {
    this.control.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value) {
          this.calcSelectedItem(value);
          this.scrollToSelected(value);

          this.cdr.detectChanges();
        }
      });
  }

  ngAfterContentInit() {
    this.templates().forEach((item) => {
      this.listBoxTemplates[item.name as ListBoxTemplates] = item.template;
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if ('items' in changes) {
      this.selectedItems = new Map();

      const selectedItem = this.control.value;
      const foundInItem = this.items().find(
        (el) => el.searchKey === selectedItem?.searchKey
      );

      if (selectedItem && foundInItem) {
        this.calcSelectedItem(selectedItem);
      }
    }
  }

  public onItemClick(item: IUiLyriListItem<any>) {
    this.calcSelectedItem(item);

    this.control.setValue(item);
  }

  public onSearch(search: string): void {
    this.searchStringSig.set(search);
  }

  public onClear() {
    this.searchStringSig.set('');
  }

  private calcSelectedItem(item: IUiLyriListItem<T>) {
    if (!this.selectedItems.has(item.searchKey)) {
      if (this.multi()) {
        this.selectedItems.set(item.searchKey, item);
      } else {
        this.selectedItems.clear();
        this.selectedItems.set(item.searchKey, item);
      }
    } else {
      // this.selectedItems.delete(item.searchKey);
    }

    this.cdkScroll();
  }

  private scrollToSelected(selectedItem: IUiLyriListItem<T>) {
    this.showItems().forEach((item, index) => {
      if (selectedItem.searchKey !== item.searchKey) {
        return;
      }

      const viewportSize = this.cdkScroll().getViewportSize(); // Высота видимой области
      const scrollOffset =
        index * this.ITEM_SIZE - viewportSize / 2 + this.ITEM_SIZE / 2;

      this.cdkScroll().scrollToOffset(scrollOffset, 'smooth');
    });
  }

  protected readonly ListBoxTemplates = ListBoxTemplates;
}
