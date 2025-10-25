// overlay.service.ts
import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
} from '@angular/core';
import { filter, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EditorStore } from './editor-store.service';
import { HistoryService } from './history.service';
import { ChangeTextCommand } from './history-commands';
import { IframeNode, TextNode, VideoNode } from '../nodes';
import { NodeBase } from '../core';
import {
  HTML_EDITOR_COMPONENT,
  HtmlEditorComponent,
  LyriHtmlEditorResult,
} from '@lyri-cast/form';

@Injectable()
export class OverlayService {
  private readonly htmlEditor = inject(HTML_EDITOR_COMPONENT);

  private hostEl?: HTMLDivElement;

  // textarea → заменим на rich editor
  private editorHostEl?: HTMLDivElement;
  private editorRef?: ComponentRef<HtmlEditorComponent>;
  private editingTextNode?: TextNode;
  private originalHTML?: string;

  private iframeEl?: HTMLIFrameElement;
  private iframeForNodeId?: string;

  constructor(
    private readonly store: EditorStore,
    private readonly history: HistoryService,
    private readonly appRef: ApplicationRef,
    private readonly env: EnvironmentInjector
  ) {}

  setHost(element: HTMLDivElement) {
    this.hostEl = element;
  }

  private safeRemove(el?: Element | null) {
    try {
      if (!el) return;
      const parent = el.parentNode as (Node & ParentNode) | null;
      if (parent) {
        try {
          parent.removeChild(el);
        } catch {}
      } else {
        try {
          (el as Element).remove();
        } catch {}
      }
    } catch {}
  }

  /** === Html Editor вместо textarea === */
  attachTextarea(node: TextNode, opts?: { onClose?: () => void }) {
    // <<== Оставляем API, но под капотом — rich text
    this.attachHtmlEditor(node, opts);
  }

  private attachHtmlEditor(node: TextNode, opts?: { onClose?: () => void }) {
    if (!this.hostEl) return;

    // 1) контейнер под редактор
    const bounds = node.getBounds();
    // const scaleY = bounds.height / node.h;
    const deg = 0; //((node.rotation || 0) * 180) / Math.PI;


    const { scaleX, scaleY } = node.getWorldScale();
    const { x: cx, y: cy } = node.getWorldCenter();

    const width = node.w * scaleX;
    const height = node.h * scaleY;

    const host = document.createElement('div');
    Object.assign(host.style, {
      position: 'absolute',
      left: `${cx - width / 2}px`,
      top: `${cy - height / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
      background: 'rgba(0,0,0,0.85)',
      border: '1px solid #334155',
      borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
      zIndex: '10',
      padding: `${node.padding * scaleY}px`,
      transform: `rotate(${deg}deg)`,
      transformOrigin: 'center center',
      // ВАЖНО: дай редактору управление мышью и клавой
      pointerEvents: 'auto',
    } as CSSStyleDeclaration);

    this.hostEl.appendChild(host);
    this.editorHostEl = host;

    // 2) динамически монтируем компонент редактора
    const ref = createComponent(this.htmlEditor, {
      environmentInjector: this.env,
    });
    this.editorRef = ref;
    ref.hostView.detectChanges();
    host.appendChild(ref.location.nativeElement as HTMLElement);

    // 3) заполняем начальными данными
    const initialHtml = node.textHtml;
    this.originalHTML = initialHtml;

    ref.setInput('html', initialHtml);
    ref.instance.isReady$.pipe(filter(Boolean)).subscribe(() => {
      ref.instance.setHTML(initialHtml);
      ref.instance.focus();
    });

    const done$ = new Subject<void>();

    const finish = (commit: boolean) => {
      const comp = this.editorRef?.instance;
      const currentNode = this.editingTextNode;
      const origHtml = this.originalHTML ?? '';

      console.log('finish?', commit);
      try {
        if (commit && currentNode && comp) {
          const newHTML: string = comp.getHTML();

          // для fit и рендера текста оставляем .text (плэйн)
          currentNode.textHtml = newHTML;

          currentNode.requestFit();

          // История — на основе html (можно сделать ChangeContentCommand, если нужно)
          if (origHtml !== undefined && newHTML !== origHtml) {
            const cmd = new ChangeTextCommand(currentNode, origHtml, newHTML);
            this.history.execute(cmd);
          }
        }
      } finally {
        // аккуратно гасим
        done$.next();
        done$.complete();
        this.teardownEditor();
        opts?.onClose?.();
      }
    };

    ref.instance.blur$.pipe(takeUntil(done$)).subscribe(() => {
      finish(true);
    });

    ref.instance.finish$
      .pipe(takeUntil(done$))
      .subscribe((data: LyriHtmlEditorResult) => {
        if (data.type === 'cancel') {
          finish(false);
        }
        if (data.type === 'submit') {
          finish(true);
        }
      });

    // помечаем текущий редактируемый
    this.editingTextNode = node;
  }

  private teardownEditor() {
    try {
      this.editorRef?.destroy();
    } catch {}
    this.editorRef = undefined;
    this.safeRemove(this.editorHostEl);
    this.editorHostEl = undefined;
    this.editingTextNode = undefined;
    this.originalHTML = undefined;
  }

  commitAndCloseTextarea() {
    // совместимость с текущими вызовами
    if (!this.editorRef) return;
    // имитируем «commit: true»
    const comp = this.editorRef.instance;
    const node = this.editingTextNode;
    const originalHTML = this.originalHTML;

    if (node && comp) {
      const newHTML: string = comp.getHTML();

      node.textHtml = newHTML;
      node.requestFit();

      if (originalHTML !== undefined && newHTML !== originalHTML) {
        const cmd = new ChangeTextCommand(node, originalHTML, newHTML);
        this.history.execute(cmd);
      }
    }
    this.teardownEditor();
  }

  /** === iframe (как было) === */
  attachIframe(node: IframeNode | VideoNode) {
    if (!this.hostEl) return;
    const b = node.getBounds();
    if (this.iframeEl && this.iframeForNodeId === node.id) {
      const m = 10;
      const left = b.x + m,
        top = b.y + m,
        width = Math.max(10, b.width - m * 2),
        height = Math.max(10, b.height - m * 2);
      Object.assign(this.iframeEl.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      } as CSSStyleDeclaration);
      return;
    }
    this.detachIframe();
    const el = document.createElement('iframe');
    el.src = node.url;
    el.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    el.setAttribute('allowfullscreen', 'true');
    const m = 10;
    const left = b.x + m,
      top = b.y + m,
      width = Math.max(10, b.width - m * 2),
      height = Math.max(10, b.height - m * 2);
    const deg = ((node.rotation || 0) * 180) / Math.PI;
    Object.assign(el.style, {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: 'none',
      zIndex: '5',
      pointerEvents: 'none',
      transform: `rotate(${deg}deg)`,
      transformOrigin: 'center center',
    } as CSSStyleDeclaration);
    this.hostEl.appendChild(el);
    this.iframeEl = el;
    this.iframeForNodeId = node.id;
  }

  detachIframe() {
    this.iframeEl?.remove();
    this.iframeEl = undefined;
    this.iframeForNodeId = undefined;
  }
  setIframeInteractive(on: boolean) {
    if (this.iframeEl) this.iframeEl.style.pointerEvents = on ? 'auto' : 'none';
  }

  /** === синхронизация позиций === */
  syncToNode(node: NodeBase) {
    if (!this.hostEl) return;

    if (this.editorHostEl && node instanceof TextNode) {
      const b = node.getBounds();
      const { scaleX, scaleY } = node.getWorldScale();
      const { x: cx, y: cy } = node.getWorldCenter();

      const width = node.w * scaleX;
      const height = node.h * scaleY;

      // const scaleY = b.height / node.h;
      const deg = ((node.rotation || 0) * 180) / Math.PI;
      Object.assign(this.editorHostEl.style, {
        left: `${cx - width / 2}px`,
        top: `${cy - height / 2}px`,
        width: `${width}px`,
        height: `${height}px`,
        padding: `${node.padding * scaleY}px`,
        transform: `rotate(${deg}deg)`,
        transformOrigin: 'center center',
      } as CSSStyleDeclaration);
    }

    if (this.iframeEl && node instanceof IframeNode) {
      const b = node.getBounds();
      const m = 10;
      const left = b.x + m,
        top = b.y + m,
        width = Math.max(10, b.width - m * 2),
        height = Math.max(10, b.height - m * 2);
      const deg = ((node.rotation || 0) * 180) / Math.PI;
      Object.assign(this.iframeEl.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: `rotate(${deg}deg)`,
        transformOrigin: 'center center',
      } as CSSStyleDeclaration);
    }
  }

}
