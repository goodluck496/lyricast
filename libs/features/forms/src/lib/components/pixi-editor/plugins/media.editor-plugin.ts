import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin } from '../core';
import { filter, takeUntil } from 'rxjs/operators';
import { EditorCommand } from '../services/command-bus.service';
import { AddNodeCommand } from '../services/history-commands';
import { Subject } from 'rxjs';
import { FederatedPointerEvent } from 'pixi.js';
import { DragResizeService } from '../services/drag-resize.service';
import { IframeNode, ImageNode, VideoNode } from '../nodes';
import { AssetStorageService } from '../services/asset-storage.service';

/**
 * MediaPlugin handles image, video, iframe embedding and background audio control.
 *
 * - ADD_IMAGE: creates an ImageNode.
 * - ADD_VIDEO: either creates a VideoNode (local/URL video) or an IframeNode for YT/Vimeo.
 * - SET/PLAY/PAUSE_AUDIO: controls background audio playback state in the store.
 */
@Injectable()
export class MediaPlugin implements EditorPlugin {
  id = 'media';
  private backgroundAudio?: HTMLAudioElement;
  private destroy$ = new Subject<void>();

  constructor(private readonly drag: DragResizeService, private readonly assetStorage: AssetStorageService) {}

  /** Initialize subscriptions for media-related commands. */
  init(ctx: EditorContext): void {
    // ADD_IMAGE
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_IMAGE'), takeUntil(this.destroy$)).subscribe(async (cmd) => {
      const addImage = cmd as Extract<EditorCommand, { t: 'ADD_IMAGE' }>;
      let source: string | undefined;
      if (addImage.assetId) {
        source = await this.assetStorage.getAssetObjectURL(addImage.assetId);
      } else if (addImage.url) {
        source = addImage.url;
      }

      if (!source) {
        console.warn('ADD_IMAGE command received without assetId or url.');
        return;
      }

      const imageNode = new ImageNode(source);
      imageNode.x = addImage.x ?? 120;
      imageNode.y = addImage.y ?? 100;
      imageNode.applyBoxSize(addImage.options?.width ?? 400, addImage.options?.height ?? 300);
      // Set assetId or url on the node for serialization
      if (addImage.assetId) imageNode.assetId = addImage.assetId;
      else if (addImage.url) imageNode.url = addImage.url;

      const nodeState = { id: imageNode.id, type: 'image' as const, ref: imageNode, destroy$: new Subject<void>() };
            
      // Выполняем команду добавления через историю
      const command = new AddNodeCommand(nodeState, ctx.world, ctx.store);
      ctx.history.execute(command);
            
      this.drag.bind(imageNode, nodeState.destroy$, { 
        cfg: ctx.cfg, 
        store: ctx.store, 
        guides: ctx.guides, 
        world: ctx.world, 
        app: ctx.app, 
        bus: ctx.bus, 
        utils: ctx.utils, 
        overlay: ctx.overlay,
        history: ctx.history,
        getSceneBounds: ctx.getSceneBounds
      });      ctx.bus.emit({ t: 'SELECT', ids: [imageNode.id] });
    });

    // ADD_VIDEO
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_VIDEO'), takeUntil(this.destroy$)).subscribe(async (cmd) => {
      const addVideo = cmd as Extract<EditorCommand, { t: 'ADD_VIDEO' }>;
      let source: string | undefined;
      if (addVideo.assetId) {
        source = await this.assetStorage.getAssetObjectURL(addVideo.assetId);
      } else if (addVideo.url) {
        source = addVideo.url;
      }

      if (!source) {
        console.warn('ADD_VIDEO command received without assetId or url.');
        return;
      }

      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)/i.test(source ?? '');
      const isVimeo = /vimeo\.com\//i.test(source ?? '');

      const toYouTubeEmbed = (url: string) => {
        try {
          const urlObj = new URL(url);
          // youtu.be/<id>
          if (urlObj.hostname.includes('youtu.be')) {
            return `https://www.youtube-nocookie.com/embed/${urlObj.pathname.replace(/^\//, '')}`;
          }
          const videoId = urlObj.searchParams.get('v');
          if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
          // already embed
          const pathParts = urlObj.pathname.split('/');
          const idLast = pathParts[pathParts.length - 1];
          return `https://www.youtube-nocookie.com/embed/${idLast}`;
        } catch {
          return url;
        }
      };

      const toVimeoEmbed = (url: string) => {
        try {
          const urlObj = new URL(url);
          const parts = urlObj.pathname.split('/').filter(Boolean);
          const idLast = parts[parts.length - 1];
          return idLast ? `https://player.vimeo.com/video/${idLast}` : url;
        } catch {
          return url;
        }
      };

      if (isYouTube || isVimeo) {
        // Use iframe overlay for streaming platforms
        const embedUrl = isYouTube ? toYouTubeEmbed(source) : toVimeoEmbed(source);
        const iframeNode = new IframeNode(embedUrl);
        iframeNode.x = addVideo.x ?? 180;
        iframeNode.y = addVideo.y ?? 160;
        iframeNode.applyBoxSize(addVideo.options?.width ?? 640, addVideo.options?.height ?? 360);

                const nodeState = { id: iframeNode.id, type: 'iframe' as const, ref: iframeNode, destroy$: new Subject<void>() };
                
                // Выполняем команду добавления через историю
                const command = new AddNodeCommand(nodeState, ctx.world, ctx.store);
                ctx.history.execute(command);
                
                this.drag.bind(iframeNode, nodeState.destroy$, { 
                  cfg: ctx.cfg, 
                  store: ctx.store, 
                  guides: ctx.guides, 
                  world: ctx.world, 
                  app: ctx.app, 
                  bus: ctx.bus, 
                  utils: ctx.utils, 
                  overlay: ctx.overlay,
                  history: ctx.history,
                  getSceneBounds: ctx.getSceneBounds
                });        ctx.overlay.attachIframe(iframeNode);
        // enable temporary interaction with double-click
        ctx.utils
          .fromPixi<FederatedPointerEvent>(iframeNode, 'pointertap')
          .pipe(filter((evt) => evt.detail >= 2), takeUntil(this.destroy$))
          .subscribe(() => ctx.overlay.setIframeInteractive(true));
        ctx.bus.emit({ t: 'SELECT', ids: [iframeNode.id] });
      } else {
        const videoNode = new VideoNode(source);
        videoNode.x = addVideo.x ?? 160;
        videoNode.y = addVideo.y ?? 140;
        videoNode.applyBoxSize(addVideo.options?.width ?? 480, addVideo.options?.height ?? 320);
        // Set assetId or url on the node for serialization
        if (addVideo.assetId) videoNode.assetId = addVideo.assetId;
        else if (addVideo.url) videoNode.url = addVideo.url;

                const nodeState = { id: videoNode.id, type: 'video' as const, ref: videoNode, destroy$: new Subject<void>() };
                
                // Выполняем команду добавления через историю
                const command = new AddNodeCommand(nodeState, ctx.world, ctx.store);
                ctx.history.execute(command);
                
                this.drag.bind(videoNode, nodeState.destroy$, { 
                  cfg: ctx.cfg, 
                  store: ctx.store, 
                  guides: ctx.guides, 
                  world: ctx.world, 
                  app: ctx.app, 
                  bus: ctx.bus, 
                  utils: ctx.utils, 
                  overlay: ctx.overlay,
                  history: ctx.history,
                  getSceneBounds: ctx.getSceneBounds
                });        // double-click to toggle play/pause if underlying HTMLVideoElement is present
        ctx.utils
          .fromPixi<FederatedPointerEvent>(videoNode, 'pointertap')
          .pipe(filter((evt) => evt.detail >= 2), takeUntil(this.destroy$))
          .subscribe(() => {
            // Safely discover HTMLVideoElement behind Pixi VideoResource
            const textureUnknown = videoNode.sprite.texture as unknown;
            const baseTex: unknown = (textureUnknown as { baseTexture?: unknown })?.baseTexture;
            const resource: unknown = (baseTex as { resource?: unknown })?.resource;
            const source = (resource as { source?: unknown })?.source as unknown;
            const videoEl = source instanceof HTMLVideoElement ? source : null;
            if (videoEl) {
              if (videoEl.paused) {
                videoEl.muted = true;
                void videoEl.play();
              } else {
                videoEl.pause();
              }
            }
          });

          ctx.bus.emit({ t: 'SELECT', ids: [nodeState.id] });
        // ctx.bus.emit({ t: 'SELECT', ids: [newId] });
      }
    });

    // background audio controls
    ctx.bus.commands$.pipe(filter((command) => command.t === 'SET_AUDIO'), takeUntil(this.destroy$)).subscribe((cmd) => {
      const setAudio = cmd as Extract<EditorCommand, { t: 'SET_AUDIO' }>;
      if (!setAudio.url) {
        this.backgroundAudio?.pause();
        this.backgroundAudio = undefined;
        ctx.store.patchState({ audioUrl: undefined, isPlayingAudio: false });
        return;
      }
      if (!this.backgroundAudio) this.backgroundAudio = new Audio();
      this.backgroundAudio.src = setAudio.url;
      this.backgroundAudio.loop = true;
      this.backgroundAudio.volume = 0.6;
      void this.backgroundAudio.play();
      ctx.store.patchState({ audioUrl: setAudio.url, isPlayingAudio: true });
    });

    ctx.bus.commands$.pipe(filter((command) => command.t === 'PLAY_AUDIO'), takeUntil(this.destroy$)).subscribe(() => {
      if (this.backgroundAudio) {
        void this.backgroundAudio.play();
        ctx.store.patchState({ isPlayingAudio: true });
      }
    });
    ctx.bus.commands$.pipe(filter((command) => command.t === 'PAUSE_AUDIO'), takeUntil(this.destroy$)).subscribe(() => {
      if (this.backgroundAudio) {
        this.backgroundAudio.pause();
        ctx.store.patchState({ isPlayingAudio: false });
      }
    });
  }

  dispose(): void {
    this.backgroundAudio?.pause();
    this.backgroundAudio = undefined;
    this.destroy$.next();
    this.destroy$.complete();
  }
}
