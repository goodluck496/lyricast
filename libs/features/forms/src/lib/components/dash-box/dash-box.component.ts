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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { ControlValueAccessorBaseDirective } from '../../control-value-accessor-base.directive';
import { DashBoxTemplates, IUiLyriDashItem } from './types';
import { HighlighterPipe } from '@lyri-cast/ui-lib';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { NgScrollbar } from 'ngx-scrollbar';
import { PaginatorModule } from 'primeng/paginator';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { PrimeTemplate } from 'primeng/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'lyri-dash-box',
  standalone: true,
  imports: [
    CommonModule,
    HighlighterPipe,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    PaginatorModule,
    ProgressSpinnerModule,
    NgScrollbar,
  ],
  templateUrl: './dash-box.component.html',
  styleUrl: './dash-box.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DashBoxComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashBoxComponent<T>
  extends ControlValueAccessorBaseDirective<IUiLyriDashItem<T>>
  implements OnInit, AfterContentInit, OnChanges
{
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  items = input<IUiLyriDashItem<T>[]>([]);
  multi = input(false);
  withSearch = input(true);
  placeholder = input('');
  loading = input(false);

  showItems = computed(() => {
    return this.items().filter((item) => {
      return (
        item.title
          .trim()
          .toLowerCase()
          .includes(this.searchStringSig().toLowerCase()) ||
        item.searchKey
          .toLowerCase()
          .includes(this.searchStringSig().toLowerCase() || '')
      );
    });
  });
  searchStringSig = signal<string>('');

  templates = contentChildren(PrimeTemplate);

  dashBoxTemplates: Partial<Record<DashBoxTemplates, TemplateRef<unknown>>> =
    {};
  selectedItems: Map<string, IUiLyriDashItem<T>> = new Map();

  ngOnInit() {
    this.control.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value) {
          this.calcSelectedItem(value);
          this.cdr.detectChanges();
        }
      });
  }

  ngAfterContentInit() {
    this.templates().forEach((item) => {
      this.dashBoxTemplates[item.name as DashBoxTemplates] = item.template;
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

  public onItemClick(item: IUiLyriDashItem<T>) {
    this.calcSelectedItem(item);

    this.control.setValue(item);
  }


  private calcSelectedItem(item: IUiLyriDashItem<T>) {
    if (!this.selectedItems.has(item.searchKey)) {
      this.selectedItems.clear();
      this.selectedItems.set(item.searchKey, item);
    }
  }

  protected readonly DashBoxTemplates = DashBoxTemplates;
}
