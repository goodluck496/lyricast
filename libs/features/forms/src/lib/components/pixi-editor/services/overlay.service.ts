// overlay.service.ts
import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
} from '@angular/core';
import { debounceTime, filter, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EditorStore } from './editor-store.service';
import { HistoryService } from './history.service';
import { ChangeTextCommand } from './history-commands';
import { IframeNode, NodeBase, TextNode, VideoNode } from '../nodes';
import {
  HTML_EDITOR_COMPONENT,
  HtmlEditorComponent,
  LyriHtmlEditorVisualConfig,
  LyriHtmlEditorResult,
} from '../../html-editor';

@Injectable()
export class OverlayService {
  private readonly htmlEditor = inject(HTML_EDITOR_COMPONENT);

  private hostEl?: HTMLDivElement;

  private editorHostEl?: HTMLDivElement;
  private editorContentEl?: HTMLElement;
  private editorRef?: ComponentRef<HtmlEditorComponent>;
  private editingTextNode?: TextNode;
  private originalHTML?: string;
  private liveHtml?: string;
  private liveSyncFrameId: number | null = null;
  private liveSyncInProgress = false;

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

  isTextEditingActive(): boolean {
    return !!this.editorRef;
  }

  private colorToHex(color?: number, fallback = '#ffffff'): string {
    if (typeof color !== 'number' || !Number.isFinite(color)) {
      return fallback;
    }

    return `#${Math.max(0, Math.min(0xffffff, color))
      .toString(16)
      .padStart(6, '0')}`;
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

  public attachHtmlEditor(
    node: TextNode,
    opts?: { onClose?: () => void; seedText?: string }
  ) {
    if (!this.hostEl) return;
    if (this.editingTextNode?.id === node.id && this.editorRef) {
      const editor = this.editorRef.instance;
      editor.focusAtEnd();
      if (opts?.seedText) {
        editor.insertText(opts.seedText);
      }
      return;
    }

    this.commitAndCloseTextarea();
    node.setEditingActive(true);

    // 1) контейнер под редактор
    // const bounds = node.getBounds();
    // const scaleY = bounds.height / node.h;
    const deg = ((node.rotation || 0) * 180) / Math.PI;

    const { scaleX, scaleY } = node.getWorldScale();
    const { x: cx, y: cy } = node.getWorldCenter();
    const textRect = node.getEditableTextRect();

    const width = node.w * scaleX;
    const height = node.h * scaleY;

    const host = document.createElement('div');
    Object.assign(host.style, {
      position: 'absolute',
      left: `${cx - width / 2}px`,
      top: `${cy - height / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
      background: 'transparent',
      border: 'none',
      borderRadius: '0',
      boxShadow: 'none',
      outline: 'none',
      zIndex: '12',
      transform: `rotate(${deg}deg)`,
      transformOrigin: 'center center',
      pointerEvents: 'auto',
      overflow: 'visible',
    } as CSSStyleDeclaration);

    this.hostEl.appendChild(host);
    this.editorHostEl = host;

    // 2) динамически монтируем компонент редактора
    const ref = createComponent(this.htmlEditor, {
      environmentInjector: this.env,
    });
    this.editorRef = ref;
    this.appRef.attachView(ref.hostView);
    ref.hostView.detectChanges();
    const editorElement = ref.location.nativeElement as HTMLElement;
    Object.assign(editorElement.style, {
      position: 'absolute',
      left: `${textRect.left * scaleX}px`,
      top: `${textRect.top * scaleY}px`,
      width: `${textRect.width * scaleX}px`,
      height: `${Math.max(1, textRect.height * scaleY)}px`,
    } as CSSStyleDeclaration);
    host.appendChild(editorElement);
    this.editorContentEl = editorElement;

    // 3) заполняем начальными данными
    const initialHtml = node.textHtml ?? '';
    this.originalHTML = initialHtml;
    const visual: LyriHtmlEditorVisualConfig = {
      fontFamily: node.style.font,
      fontSizePx: Math.max(16, Math.round(node.currentFontSize * scaleY)),
      fontWeight: String(node.style.weight),
      lineHeight: node.style.lineHeight,
      color: node.style.colorHex || this.colorToHex(node.style.color),
      textAlign: node.style.align,
      verticalAlign: node.style.valign ?? 'middle',
      backgroundColor:
        node.style.bgColorHex || this.colorToHex(node.style.bgColor, 'transparent'),
      shadowColor:
        node.style.shadowColorHex ||
        this.colorToHex(node.style.shadowColor, '#000000'),
      shadowOffsetPx: Math.max(0, Math.round((node.style.shadowSize ?? 0) * scaleY)),
      shadowBlurPx: Math.max(0, Math.round((node.style.shadowBlur ?? 0) * scaleY)),
      toolbarOffsetPx: Math.max(0, Math.round(textRect.top * scaleY)),
    };

    // ВАЖНО: передаём initialHtml во входной input сразу после создания компонента,
    // а не только внутри isReady$, чтобы не зависеть от тайминга события onInit.
    ref.setInput('html', initialHtml);
    ref.setInput('inlineMode', true);
    ref.setInput('visual', visual);
    ref.changeDetectorRef.detectChanges();

    // Когда редактор реально готов, даём фокус и при необходимости можем ещё раз
    // установить HTML (но, как правило, достаточно эффекта в HtmlEditorComponent).
    ref.instance.isReady$
      .pipe(debounceTime(0), filter(Boolean))
      .subscribe(() => {
      ref.instance.setHTML(initialHtml);
      ref.instance.focusAtEnd();
      if (opts?.seedText) {
        ref.instance.insertText(opts.seedText);
      }
    });

    const done$ = new Subject<void>();

    ref.instance.htmlChange$
      .pipe(takeUntil(done$))
      .subscribe((newHtml: string) => {
        const currentNode = this.editingTextNode;
        if (!currentNode) {
          return;
        }

        const normalizedHTML = newHtml.replace(/&nbsp;/g, ' ');
        this.scheduleLiveTextSync(currentNode, normalizedHTML);
      });

    const finish = async (commit: boolean) => {
      const comp = this.editorRef?.instance;
      const currentNode = this.editingTextNode;
      const origHtml = this.originalHTML ?? '';

      try {
        if (commit && currentNode && comp) {
          const newHTML: string = comp.getHTML();
          const normalizedHTML = newHTML.replace(/&nbsp;/g, ' ');
          await this.flushLiveTextSync(currentNode, normalizedHTML);
          if (origHtml !== undefined && newHTML !== origHtml) {
            const cmd = new ChangeTextCommand(
              currentNode,
              origHtml,
              normalizedHTML
            );
            this.history.execute(cmd);
          }
        } else if (!commit && currentNode) {
          await this.flushLiveTextSync(currentNode, origHtml);
        }
      } finally {
        currentNode?.setEditingActive(false);
        done$.next();
        done$.complete();
        this.teardownEditor();
        opts?.onClose?.();
      }
    };

    ref.instance.blur$.pipe(takeUntil(done$)).subscribe(() => {
      void finish(true);
    });

    ref.instance.finish$
      .pipe(takeUntil(done$))
      .subscribe((data: LyriHtmlEditorResult) => {
        if (data.type === 'cancel') {
          void finish(false);
        }
        if (data.type === 'submit') {
          void finish(true);
        }
      });

    // помечаем текущий редактируемый
    this.editingTextNode = node;
  }

  public teardownEditor() {
    if (this.liveSyncFrameId !== null) {
      cancelAnimationFrame(this.liveSyncFrameId);
    }
    this.liveSyncFrameId = null;
    this.liveSyncInProgress = false;
    this.liveHtml = undefined;
    try {
      if (this.editorRef) {
        this.appRef.detachView(this.editorRef.hostView);
      }
      this.editorRef?.destroy();
    } catch {}
    this.editorRef = undefined;
    this.editorContentEl = undefined;
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

      const normalizedHTML = newHTML.replace(/&nbsp;/g, ' ');

      node.textHtml = normalizedHTML;
      void node.layout();

      if (originalHTML !== undefined && newHTML !== originalHTML) {
        const cmd = new ChangeTextCommand(node, originalHTML, normalizedHTML);
        this.history.execute(cmd);
      }
    }
    node?.setEditingActive(false);
    this.teardownEditor();
  }

  private scheduleLiveTextSync(node: TextNode, html: string): void {
    this.liveHtml = html;
    if (this.liveSyncFrameId !== null || this.liveSyncInProgress) {
      return;
    }

    this.liveSyncFrameId = requestAnimationFrame(() => {
      this.liveSyncFrameId = null;
      void this.runLiveTextSync(node);
    });
  }

  private async runLiveTextSync(node: TextNode): Promise<void> {
    if (!this.liveHtml) {
      return;
    }

    this.liveSyncInProgress = true;
    const html = this.liveHtml;
    this.liveHtml = undefined;

    try {
      node.textHtml = html;
      await node.layout();
      this.syncToNode(node);
    } finally {
      this.liveSyncInProgress = false;
    }

    if (this.liveHtml !== undefined) {
      this.scheduleLiveTextSync(node, this.liveHtml);
    }
  }

  private async flushLiveTextSync(node: TextNode, html: string): Promise<void> {
    this.liveHtml = undefined;
    if (this.liveSyncFrameId !== null) {
      cancelAnimationFrame(this.liveSyncFrameId);
      this.liveSyncFrameId = null;
    }

    node.textHtml = html;
    await node.layout();
    this.syncToNode(node);
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
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
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
      const { scaleX, scaleY } = node.getWorldScale();
      const { x: cx, y: cy } = node.getWorldCenter();
      const textRect = node.getEditableTextRect();

      const width = node.w * scaleX;
      const height = node.h * scaleY;

      // const scaleY = b.height / node.h;
      const deg = ((node.rotation || 0) * 180) / Math.PI;
      Object.assign(this.editorHostEl.style, {
        left: `${cx - width / 2}px`,
        top: `${cy - height / 2}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: `rotate(${deg}deg)`,
        transformOrigin: 'center center',
      } as CSSStyleDeclaration);

      if (this.editorContentEl) {
        Object.assign(this.editorContentEl.style, {
          left: `${textRect.left * scaleX}px`,
          top: `${textRect.top * scaleY}px`,
          width: `${textRect.width * scaleX}px`,
          height: `${Math.max(1, textRect.height * scaleY)}px`,
        } as CSSStyleDeclaration);
      }

      this.editorRef?.setInput('visual', {
        fontFamily: node.style.font,
        fontSizePx: Math.max(16, Math.round(node.currentFontSize * scaleY)),
        fontWeight: String(node.style.weight),
        lineHeight: node.style.lineHeight,
        color: node.style.colorHex || this.colorToHex(node.style.color),
        textAlign: node.style.align,
        verticalAlign: node.style.valign ?? 'middle',
        backgroundColor:
          node.style.bgColorHex || this.colorToHex(node.style.bgColor, 'transparent'),
        shadowColor:
          node.style.shadowColorHex ||
          this.colorToHex(node.style.shadowColor, '#000000'),
        shadowOffsetPx: Math.max(
          0,
          Math.round((node.style.shadowSize ?? 0) * scaleY)
        ),
        shadowBlurPx: Math.max(
          0,
          Math.round((node.style.shadowBlur ?? 0) * scaleY)
        ),
        toolbarOffsetPx: Math.max(0, Math.round(textRect.top * scaleY)),
      } satisfies LyriHtmlEditorVisualConfig);
      this.editorRef?.changeDetectorRef.detectChanges();
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
