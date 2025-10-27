import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin } from '../core';
import { filter, takeUntil } from 'rxjs/operators';
import { EditorCommand } from '../services/command-bus.service';
import { AddNodeCommand } from '../services/history-commands';
import { IframeNode } from '../nodes';
import { Subject } from 'rxjs';
import { FederatedPointerEvent } from 'pixi.js';
import { DragResizeService } from '../services/drag-resize.service';

/**
 * IframePlugin handles embedded web content for supported URLs (YouTube, Vimeo, generic pages).
 *
 * On ADD_IFRAME it normalizes known platform URLs to their privacy-friendly embed versions
 * and creates an IframeNode. Double-clicking enables temporary interaction with the iframe.
 */
@Injectable()
export class IframePlugin implements EditorPlugin {
  id = 'iframe';
  private destroy$ = new Subject<void>();

  constructor(private readonly drag: DragResizeService) {}
  init(ctx: EditorContext): void {
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_IFRAME'), takeUntil(this.destroy$)).subscribe((cmd) => {
      const addIframe = cmd as Extract<EditorCommand, { t: 'ADD_IFRAME' }>;
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)/i.test(addIframe.url ?? '');
      const isVimeo = /vimeo\.com\//i.test(addIframe.url ?? '');
      const toYouTubeEmbed = (url: string) => {
        try {
          const urlObj = new URL(url);
          if (urlObj.hostname.includes('youtu.be')) {
            return `https://www.youtube-nocookie.com/embed/${urlObj.pathname.replace(/^\//, '')}`;
          }
          const videoId = urlObj.searchParams.get('v');
          if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
          const parts = urlObj.pathname.split('/');
          const idLast = parts[parts.length - 1];
          return `https://www.youtube-nocookie.com/embed/${idLast}`;
        } catch { return url; }
      };
      const toVimeoEmbed = (url: string) => {
        try {
          const urlObj = new URL(url);
          const parts = urlObj.pathname.split('/').filter(Boolean);
          const idLast = parts[parts.length - 1];
          return idLast ? `https://player.vimeo.com/video/${idLast}` : url;
        } catch { return url; }
      };
      const embedUrl = isYouTube ? toYouTubeEmbed(addIframe.url) : isVimeo ? toVimeoEmbed(addIframe.url) : addIframe.url;
      const node = new IframeNode(embedUrl);
      node.x = addIframe.x ?? 180;
      node.y = addIframe.y ?? 160;
      node.applyBoxSize(addIframe.options?.width ?? 640, addIframe.options?.height ?? 360);

            const nodeState = { id: node.id, type: 'iframe' as const, ref: node, destroy$: new Subject<void>() };
            
            // Выполняем команду добавления через историю
            const command = new AddNodeCommand(nodeState, ctx.world, ctx.store);
            ctx.history.execute(command);
            
            this.drag.bind(node, nodeState.destroy$, { 
              cfg: ctx.cfg, 
              store: ctx.store, 
              guides: ctx.guides, 
              world: ctx.world, 
              app: ctx.app, 
              bus: ctx.bus, 
              utils: ctx.utils, 
              overlay: ctx.overlay,
              history: ctx.history
            });      ctx.overlay.attachIframe(node);
      // enable temporary interaction with double-click
      ctx.utils.fromPixi<FederatedPointerEvent>(node, 'pointertap')
        .pipe(filter((evt) => evt.detail >= 2), takeUntil(this.destroy$))
        .subscribe(() => ctx.overlay.setIframeInteractive(true));
      ctx.bus.emit({ t: 'SELECT', ids: [node.id] });
    });
  }

  dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

}
