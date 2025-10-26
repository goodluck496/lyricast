// rich-text-overlay.component.ts
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

import { Editor, EditorModule } from 'primeng/editor';
import {
  outputToObservable,
  takeUntilDestroyed,
  toObservable,
} from '@angular/core/rxjs-interop';
import Quill from 'quill';
import QuillResizeImage from 'quill-resize-image';
import { EditorSelectionChangeEvent } from 'primeng/editor/editor.interface';
import { fromEvent } from 'rxjs';

Quill.register('modules/resize', QuillResizeImage);

export type LyriHtmlEditorResult = {
  type: 'cancel' | 'submit';
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
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EditorModule, FormsModule],
})
export class HtmlEditorComponent
  implements ControlValueAccessor, OnInit, OnDestroy, AfterViewInit
{
  destroyRef = inject(DestroyRef);

  html = input(''); // стартовый HTML
  $htmlChange = output<string>();
  $blur = output<void>();
  blur$ = outputToObservable(this.$blur);
  $keydown = output<KeyboardEvent>();
  keydown$ = outputToObservable(this.$keydown);

  $finish = output<LyriHtmlEditorResult>();
  finish$ = outputToObservable(this.$finish);

  editorComp = viewChild.required(Editor);
  root = viewChild.required<ElementRef<HTMLElement>>('root');

  model = '';

  isReady = signal(false);
  isReady$ = toObservable(this.isReady);

  quillFormats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    // 'blockquote',
    // 'code-block',
    'list',
    'indent',
    // 'script',
    'color',
    'background',
    'font',
    'align',
    // 'link',
    // 'image',
    // 'video', // ← вот сюда
  ];

  quillModules: any = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'], // жирный, курсив, подчёркнутый и зачёркнутый
      // ['blockquote', 'code-block'], // цитата и блок кода
      [{ header: 1 }, { header: 2 }], // заголовки
      [{ list: 'ordered' }, { list: 'bullet' }], // списки
      // [{ script: 'sub' }, { script: 'super' }], // верхний/нижний индекс
      // [{ indent: '-1' }, { indent: '+1' }], // отступы
      // [{ direction: 'rtl' }], // направление текста
      // [{ size: ['small', false, 'large', 'huge'] }], // размер шрифта
      [{ header: [1, 2, 3, 4, 5, 6, false] }], // заголовки 1–6
      [{ color: [] }, { background: [] }], // цвет текста и фон
      // [{ font: [] }], // шрифты
      [{ align: [] }], // выравнивание
      ['clean'], // убрать форматирование
      // ['link', 'image', 'video'], // ← важно: кнопка Video
    ],
    // resize: {},
  };

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit() {
    this.model = this.html();
  }

  ngOnDestroy() {}

  ngAfterViewInit() {
    const container = this.root().nativeElement;
    // Ловим как можно раньше
    container.addEventListener(
      'pointerdown',
      (e) => {
        e.stopPropagation();
      },
      { capture: true }
    );
  }

  writeValue(v: any): void {
    this.model = v ?? '';
    this.setHTML(this.model);
  }
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  onReady() {
    // Фокус в поле сразу
    // Quill доступен: this.editorCmp.getQuill()
    queueMicrotask(() => {
      this.editorComp().getQuill().focus();
      this.isReady.set(true);

      const quill: Quill = this.editorComp().getQuill();
      fromEvent<KeyboardEvent>(quill.root, 'keydown')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.stopPropagation();
            event.preventDefault();

            this.$finish.emit({
              type: 'submit',
            });
          }
          if (event.key === 'Escape') {
            event.stopPropagation();
            event.preventDefault();
            this.$finish.emit({ type: 'cancel' });
          }
        });
    });
  }

  emitChange() {
    this.onChange(this.model);
    this.$htmlChange.emit(this.model);
  }

  onSelectionChange(event: EditorSelectionChangeEvent) {
    if (event.range === null) {
      /**
       * когда null, то считается, что редактор потерял фокус и надо бы отправить blur событие
       */
      const container = this.root().nativeElement.querySelector(
        '.p-editor-container'
      ) as HTMLElement | null;
      const toolbar = container?.querySelector(
        '.p-editor-toolbar'
      ) as HTMLElement | null;
      const ae = document.activeElement as HTMLElement | null;
      const stillInside =
        !!ae && (container?.contains(ae) || toolbar?.contains(ae));
      if (!stillInside) {
        console.log('blur', this.model);
        this.$blur.emit();
      }
    }
  }

  // Унифицированный API, чтобы сервис мог забрать данные
  getHTML(): string {
    return this.model ?? this.html() ?? '';
  }

  focus() {
    this.editorComp().getQuill().focus();
  }

  /**
   * Основной метод изменения HTML в quill
   * @param html
   */
  setHTML(html: string) {
    this.model = html ?? '';

    /**
     * ngModel для quill не работает ... приходится изголяться вот так,
     * для того чтобы в редактор можно было вставить какое-то значение
     */
    const quill: Quill = this.editorComp().getQuill();
    const delta = quill.clipboard.convert({
      html,
    });
    quill.setContents(delta);

    this.emitChange();
  }
}
