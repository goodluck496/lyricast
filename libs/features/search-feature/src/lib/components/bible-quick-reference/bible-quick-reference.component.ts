import {
  Component,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Listbox, ListboxModule } from 'primeng/listbox';
import { BibleBookShort, BibleTranslateShort } from '@lyri-cast/entities';
import {
  BibleQuickReferenceService,
  BibleQuickRefSuggestion,
} from './bible-quick-reference.service';

@Component({
  selector: 'lyri-bible-quick-reference',
  standalone: true,
  imports: [CommonModule, FormsModule, ListboxModule],
  templateUrl: './bible-quick-reference.component.html',
  styleUrl: './bible-quick-reference.component.scss',
  providers: [BibleQuickReferenceService],
})
export class BibleQuickReferenceComponent {
  private readonly service = inject(BibleQuickReferenceService);

  listbox = viewChild(Listbox);

  query = input<string>('');
  books = input<BibleBookShort[]>([]);
  translate = input<BibleTranslateShort | null>(null);
  active = input<boolean>(false);

  navigate = output<string[]>();

  suggestions$ = this.service.suggestions$;

  suggestions: BibleQuickRefSuggestion[] = [];
  selectedIndex = 0;

  get selected(): BibleQuickRefSuggestion | null {
    return this.suggestions[this.selectedIndex] ?? null;
  }

  constructor() {
    this.service.suggestions$.subscribe((v) => {
      this.suggestions = v;
      this.selectedIndex = 0;
    });

    effect(() => {
      this.service.updateContext({
        query: this.query(),
        books: this.books(),
        translate: this.translate(),
        active: this.active(),
      });
    });
  }

  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.suggestions.length) return false;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex = Math.min(
        this.selectedIndex + 1,
        this.suggestions.length - 1
      );
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      return true;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = this.selected;
      if (selected) {
        this.navigate.emit(selected.path);
      }
      return true;
    }

    return false;
  }

  onSelectionChange(value: BibleQuickRefSuggestion | null): void {
    if (!value) return;

    const idx = this.suggestions.findIndex(
      (r) =>
        r.label === value.label && r.path.join('#') === value.path.join('#')
    );
    if (idx >= 0) {
      this.selectedIndex = idx;
    }
  }

  onChoose(value: BibleQuickRefSuggestion | null): void {
    if (!value) return;
    this.navigate.emit(value.path);
  }
}
