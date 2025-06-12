import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { FreeSlideActions } from '@lyri-cast/free-slide-store';
import { Store } from '@ngrx/store';
import { FreeSlide } from '@lyri-cast/entities';
import { Actions, ofType } from '@ngrx/effects';
import { EditorComponent } from '@tinymce/tinymce-angular';
import { Editor, EditorModule } from 'primeng/editor';
import { FormsModule } from '@angular/forms';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { DropdownModule } from 'primeng/dropdown';

import Quill from 'quill';
import QuillResizeImage from 'quill-resize-image';
import { EditorTextChangeEvent } from 'primeng/editor/editor.interface';

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
  ],
  templateUrl: './free-slide.component.html',
  styleUrl: './free-slide.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideComponent implements AfterViewInit {
  store = inject(Store);
  actions$ = inject(Actions);

  editor = viewChild.required(Editor);

  init: EditorComponent['init'] = {
    plugins: 'lists link image table code help wordcount',
  };

  slideText = '';
  slideTextNew = '';

  quillFormats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'blockquote',
    'code-block',
    'list',
    'bullet',
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
    // clipboard: {
    //   matchers: [
    //     // При вставке любого текста запускается matcher для TEXT_NODE
    //     [
    //       Node.TEXT_NODE,
    //       (node: any, delta: any) => {
    //         const url = node.data.trim();
    //         // Простая регулярка для разных видов YouTube-URL
    //         const ytRegex =
    //           /^(?:(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=|(?:https?:\/\/)?youtu\.be\/)([A-Za-z0-9_-]{11})/;
    //         const match = ytRegex.exec(url);
    //         if (match && match[1]) {
    //           // Если это YouTube-ссылка, формируем embed URL
    //           const videoId = match[1];
    //           const embedUrl = 'https://www.youtube.com/embed/' + videoId;
    //           // Заменяем всю вставленную ссылку iframe
    //           const newDelta = new Delta()
    //             .retain(delta.length())
    //             .delete(delta.length())
    //             .insert({ video: embedUrl });
    //           return newDelta;
    //         }
    //         return delta; // если не YouTube URL, оставляем без изменений
    //       },
    //     ],
    //   ],
    // },
  };

  onStartCasting() {
    const quill: Quill = this.editor().getQuill();
    console.log('text', this.slideText, quill.root.innerHTML);
    const mockSlides: FreeSlide[] = [
      {
        id: +new Date() + '_id',
        groupId: '000',
        name: 'some-name',
        createdAtTime: +new Date(),
        htmlString: this.slideTextNew,
      },
    ];

    this.store.dispatch(
      FreeSlideActions.openCasting({
        slideId: '123',
        slides: mockSlides,
        fromIndex: 0,
      })
    );
    this.actions$.pipe(ofType());
  }

  onStopCasting() {
    this.store.dispatch(FreeSlideActions.stopCasting());
  }

  onChangeContent(data: EditorTextChangeEvent) {
    console.log(data);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      // console.log(this.editor().getQuill());

      const quill: Quill = this.editor().getQuill();
      console.log('quill', quill);

      quill.on('text-change', (_delta: any, _oldContents: any, source: any) => {
        if (source === 'user') {
          const editorEl = quill.root;
          let html: string = editorEl.innerHTML;
          if (html === '<p><br></p>') {
            html = '';
          }

          this.slideTextNew = html;
          console.log('html?', html);
        }
      });
    }, 1000);
  }

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
  protected readonly Pages = Pages;
}
