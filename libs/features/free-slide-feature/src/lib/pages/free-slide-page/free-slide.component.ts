import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { Store } from '@ngrx/store';
import { FreeSlide } from '@lyri-cast/entities';
import { Actions } from '@ngrx/effects';
import { EditorComponent } from '@tinymce/tinymce-angular';
import { Editor, EditorModule } from 'primeng/editor';
import { FormsModule } from '@angular/forms';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { DropdownModule } from 'primeng/dropdown';

import Quill from 'quill';
import QuillResizeImage from 'quill-resize-image';
import { FreeSlideService } from './free-slide.service';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { first, fromEvent, take } from 'rxjs';
import { NgScrollbar } from 'ngx-scrollbar';
import { PreviewSlideComponent } from '../../components/preview-slide/preview-slide.component';
import { FreeSlideSidebarComponent } from '../../components/free-slide-sidebar/free-slide-sidebar.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  selectFreeSlideCastingStarted,
} from '@lyri-cast/free-slide-store';
import { HTML_EDITOR_COMPONENT, HtmlEditorComponent } from '@lyri-cast/form';

Quill.register('modules/resize', QuillResizeImage);

@Component({
  selector: 'lyri-free-slide',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    EditorModule,
    FormsModule,
    PageContainerComponent,
    DropdownModule,
    CardModule,
    InputTextModule,
    NgScrollbar,
    PreviewSlideComponent,
    FreeSlideSidebarComponent,
  ],
  templateUrl: './free-slide.component.html',
  styleUrl: './free-slide.component.scss',
  providers: [
    FreeSlideService,
    { provide: HTML_EDITOR_COMPONENT, useValue: HtmlEditorComponent },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideComponent implements AfterViewInit {
  cdr = inject(ChangeDetectorRef);
  store = inject(Store);
  actions$ = inject(Actions);
  slideService = inject(FreeSlideService);
  destroyRef = inject(DestroyRef);

  editor = viewChild.required(Editor);

  init: EditorComponent['init'] = {
    plugins: 'lists link image table code help wordcount',
  };

  currentSlideId = '';
  currentSlideIndex = 1;
  currentSlideName = '';
  currentSlideHtml = '';
  /**
   * Данное поле используется для считывания значения из редактора
   * применять его для value редактора нельзя, будет "скакать" курсор
   */
  tempCurrentSlideHtml = '';

  quillFormats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'blockquote',
    'code-block',
    'list',
    'indent',
    'script',
    'color',
    'background',
    'font',
    'align',
    'link',
    'image',
    'video', // ← вот сюда
  ];

  // 2) Модули: тулбар + matcher для YouTube-ссылок
  quillModules: any = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'], // жирный, курсив, подчёркнутый и зачёркнутый
      ['blockquote', 'code-block'], // цитата и блок кода
      [{ header: 1 }, { header: 2 }], // заголовки
      [{ list: 'ordered' }, { list: 'bullet' }], // списки
      [{ script: 'sub' }, { script: 'super' }], // верхний/нижний индекс
      [{ indent: '-1' }, { indent: '+1' }], // отступы
      [{ direction: 'rtl' }], // направление текста
      [{ size: ['small', false, 'large', 'huge'] }], // размер шрифта
      [{ header: [1, 2, 3, 4, 5, 6, false] }], // заголовки 1–6
      [{ color: [] }, { background: [] }], // цвет текста и фон
      [{ font: [] }], // шрифты
      [{ align: [] }], // выравнивание
      ['clean'], // убрать форматирование
      ['link', 'image', 'video'], // ← важно: кнопка Video
    ],
    resize: {},
  };

  slides$ = this.slideService.slides$.asObservable();

  onAddNewSlide() {
    const newSlide = this.slideService.addSlide();

    this.onSelectSlide(newSlide);
  }

  onSelectSlide(slide: FreeSlide) {
    this.currentSlideName = slide.name;
    this.currentSlideHtml = slide.htmlString;
    this.tempCurrentSlideHtml = slide.htmlString;
    this.currentSlideId = slide.id;
    this.currentSlideIndex = slide.index;

    this.store.dispatch(
      FreeSlideActions[FreeSlideActionsEnum.selectSlide](slide)
    );

    const quill: Quill = this.editor().getQuill();

    if (quill) {
      quill.focus();
    }

    this.store
      .select(selectFreeSlideCastingStarted)
      .pipe(take(1))
      .subscribe((started) => {
        if (!started) {
          return;
        }
        this.store.dispatch(
          FreeSlideActions[FreeSlideActionsEnum.slideNavigate]({
            slide: slide,
            index: slide.index,
          })
        );
      });
  }

  onSaveSlide() {
    this.slideService.updateSlide({
      id: this.currentSlideId,
      name: this.currentSlideName,
      index: this.currentSlideIndex,
      htmlString: this.tempCurrentSlideHtml,
    });
  }

  onDeleteSelected() {
    const nextSlide = this.slideService.getSlideByIndex(
      this.currentSlideIndex + 1
    );
    const prevSlide = this.slideService.getSlideByIndex(
      this.currentSlideIndex - 1
    );

    this.slideService.removeSlide(this.currentSlideId);

    if (nextSlide) {
      this.onSelectSlide(nextSlide);
    } else if (prevSlide) {
      this.onSelectSlide(prevSlide);
    } else {
      const list = Array.from(this.slideService.slidesMap.values());
      this.onSelectSlide(list[list.length - 1]);
    }
  }

  onResetSlide() {
    this.currentSlideHtml = '';
    this.tempCurrentSlideHtml = '';

    this.onSaveSlide();
  }

  ngAfterViewInit() {
    // Сброс состояния кастинга при инициализации free-slide фичи
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.stopCasting]());

    this.slides$.pipe(first()).subscribe((slides) => {
      const firstSlide = slides[0];
      if (firstSlide) {
        this.onSelectSlide(firstSlide);
      }
    });
    setTimeout(() => {
      const quill: Quill = this.editor().getQuill();
      quill.focus();

      fromEvent(quill, 'text-change')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(([delta, oldContent, source]) => {
          if (source === 'user') {
            const editorEl = quill.root;
            let html: string = editorEl.innerHTML;
            if (html === '<p><br></p>') {
              html = '';
            }

            this.tempCurrentSlideHtml = html;

            this.onSaveSlide();
          }
        });
    }, 100);
  }

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
  protected readonly Pages = Pages;
}
