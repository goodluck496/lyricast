import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  input,
  OnInit,
  output,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  outputToObservable,
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';
import { TooltipModule } from 'primeng/tooltip';
import { BehaviorSubject, fromEvent } from 'rxjs';

export type LyriHtmlEditorResult = {
  type: 'cancel' | 'submit';
};

export type LyriHtmlEditorVisualConfig = {
  fontFamily: string;
  fontSizePx: number;
  fontWeight: string;
  lineHeight: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  backgroundColor: string;
  shadowColor: string;
  shadowOffsetPx: number;
  shadowBlurPx: number;
  toolbarOffsetPx: number;
};

type ToolbarAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'justifyLeft'
  | 'justifyCenter'
  | 'justifyRight'
  | 'removeFormat';

type ToolbarItem = {
  action: ToolbarAction;
  label: string;
  title: string;
};

@Component({
  selector: 'lyri-html-editor',
  templateUrl: './html-editor.component.html',
  styleUrl: 'html-editor.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => HtmlEditorComponent),
      multi: true,
    },
  ],
  imports: [TooltipModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlEditorComponent
  implements ControlValueAccessor, OnInit, AfterViewInit
{
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  html = input('');
  inlineMode = input(false);
  visual = input<LyriHtmlEditorVisualConfig | null>(null);

  $htmlChange = output<string>();
  htmlChange$ = outputToObservable(this.$htmlChange);
  $blur = output<void>();
  blur$ = outputToObservable(this.$blur);
  $keydown = output<KeyboardEvent>();
  keydown$ = outputToObservable(this.$keydown);
  $finish = output<LyriHtmlEditorResult>();
  finish$ = outputToObservable(this.$finish);

  root = viewChild.required<ElementRef<HTMLElement>>('root');
  content = viewChild.required<ElementRef<HTMLDivElement>>('content');

  model = '';
  isReady$ = new BehaviorSubject(false);
  toolbarActions: ToolbarItem[] = [
    { action: 'bold', label: 'B', title: 'Жирный' },
    { action: 'italic', label: 'I', title: 'Курсив' },
    { action: 'underline', label: 'U', title: 'Подчеркнутый' },
    { action: 'strikeThrough', label: 'S', title: 'Зачеркнутый' },
    { action: 'insertUnorderedList', label: 'UL', title: 'Маркированный список' },
    { action: 'insertOrderedList', label: '1.', title: 'Нумерованный список' },
    { action: 'justifyLeft', label: 'L', title: 'По левому краю' },
    { action: 'justifyCenter', label: 'C', title: 'По центру' },
    { action: 'justifyRight', label: 'R', title: 'По правому краю' },
    { action: 'removeFormat', label: 'Tx', title: 'Очистить форматирование' },
  ];

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private suppressBlur = false;

  ngOnInit(): void {
    this.model = this.html();
  }

  ngAfterViewInit(): void {
    const rootEl = this.root().nativeElement;
    const contentEl = this.content().nativeElement;

    contentEl.innerHTML = this.model;
    this.isReady$.next(true);

    rootEl.addEventListener(
      'pointerdown',
      (event) => {
        event.stopPropagation();
      },
      { capture: true }
    );

    fromEvent<InputEvent>(contentEl, 'input')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.model = contentEl.innerHTML;
        this.emitChange();
      });

    fromEvent<FocusEvent>(contentEl, 'focus')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.cdr.markForCheck();
      });

    fromEvent<FocusEvent>(contentEl, 'blur')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        queueMicrotask(() => {
          if (this.suppressBlur) {
            return;
          }

          this.cdr.markForCheck();
          this.$blur.emit();
        });
      });

    fromEvent<KeyboardEvent>(contentEl, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        this.$keydown.emit(event);

        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          this.$finish.emit({ type: 'submit' });
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.$finish.emit({ type: 'cancel' });
        }
      });
  }

  writeValue(value: string): void {
    this.model = value ?? '';
    this.setHTML(this.model);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  getHTML(): string {
    return this.content().nativeElement.innerHTML;
  }

  setHTML(html: string): void {
    this.model = html ?? '';

    const contentEl = this.content()?.nativeElement;
    if (!contentEl) {
      return;
    }

    contentEl.innerHTML = this.model;
    this.emitChange();
  }

  focus(): void {
    this.content().nativeElement.focus();
  }

  focusAtEnd(): void {
    const contentEl = this.content().nativeElement;
    contentEl.focus();
    this.placeCaretAtEnd(contentEl);
  }

  insertText(text: string): void {
    this.content().nativeElement.focus();
    this.insertTextAtSelection(text);
    this.model = this.content().nativeElement.innerHTML;
    this.emitChange();
  }

  onToolbarMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.suppressBlur = true;
  }

  onToolbarMouseUp(): void {
    this.suppressBlur = false;
    this.content().nativeElement.focus();
  }

  applyToolbarAction(action: ToolbarAction): void {
    document.execCommand(action, false);
    this.content().nativeElement.focus();
    this.model = this.content().nativeElement.innerHTML;
    this.emitChange();
  }

  private emitChange(): void {
    this.onChange(this.model);
    this.onTouched();
    this.$htmlChange.emit(this.model);
  }

  private placeCaretAtEnd(element: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private insertTextAtSelection(text: string): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.placeCaretAtEnd(this.content().nativeElement);
    }

    const activeSelection = window.getSelection();
    if (!activeSelection || activeSelection.rangeCount === 0) {
      return;
    }

    const range = activeSelection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    activeSelection.removeAllRanges();
    activeSelection.addRange(range);
  }
}
