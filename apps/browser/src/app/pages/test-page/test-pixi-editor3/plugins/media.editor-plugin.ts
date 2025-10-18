import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin } from '../core';
import { filter } from 'rxjs/operators';
import { EditorCommand } from '../services/command-bus.service';
import { Subject } from 'rxjs';
import { FederatedPointerEvent } from 'pixi.js';
import { DragResizeService } from '../services/drag-resize.service';
import { IframeNode, ImageNode, VideoNode } from '../nodes';

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
  constructor(private readonly drag: DragResizeService) {}

  /** Initialize subscriptions for media-related commands. */
  init(ctx: EditorContext): void {
    // ADD_IMAGE
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_IMAGE')).subscribe(async (cmd) => {
      const addImage = cmd as Extract<EditorCommand, { t: 'ADD_IMAGE' }>;
      const imageNode = new ImageNode(addImage.url);
      imageNode.x = addImage.x ?? 120;
      imageNode.y = addImage.y ?? 100;
      imageNode.applyBoxSize(addImage.w ?? 400, addImage.h ?? 300);
      ctx.world.addChild(imageNode);
      const newId = imageNode.id;
      ctx.store.addNode({ id: newId, type: 'image', ref: imageNode });
      this.drag.bind(imageNode, new Subject<void>(), { cfg: ctx.cfg, store: ctx.store, guides: ctx.guides, world: ctx.world, app: ctx.app, bus: ctx.bus, utils: ctx.utils, overlay: ctx.overlay });
      ctx.bus.emit({ t: 'SELECT', ids: [newId] });
    });

    // ADD_VIDEO
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_VIDEO')).subscribe(async (cmd) => {
      const addVideo = cmd as Extract<EditorCommand, { t: 'ADD_VIDEO' }>;
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)/i.test(addVideo.url ?? '');
      const isVimeo = /vimeo\.com\//i.test(addVideo.url ?? '');

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
        const embedUrl = isYouTube ? toYouTubeEmbed(addVideo.url) : toVimeoEmbed(addVideo.url);
        const iframeNode = new IframeNode(embedUrl);
        iframeNode.x = addVideo.x ?? 180;
        iframeNode.y = addVideo.y ?? 160;
        iframeNode.applyBoxSize(addVideo.w ?? 640, addVideo.h ?? 360);
        ctx.world.addChild(iframeNode);
        const newId = iframeNode.id;
        ctx.store.addNode({ id: newId, type: 'iframe', ref: iframeNode });
        this.drag.bind(iframeNode, new Subject<void>(), { cfg: ctx.cfg, store: ctx.store, guides: ctx.guides, world: ctx.world, app: ctx.app, bus: ctx.bus, utils: ctx.utils, overlay: ctx.overlay });
        ctx.overlay.attachIframe(iframeNode);
        // enable temporary interaction with double-click
        ctx.utils
          .fromPixi<FederatedPointerEvent>(iframeNode, 'pointertap')
          .pipe(filter((evt) => evt.detail >= 2))
          .subscribe(() => ctx.overlay.setIframeInteractive(true));
        ctx.bus.emit({ t: 'SELECT', ids: [newId] });
      } else {
        const videoNode = new VideoNode(addVideo.url);
        videoNode.x = addVideo.x ?? 160;
        videoNode.y = addVideo.y ?? 140;
        videoNode.applyBoxSize(addVideo.w ?? 480, addVideo.h ?? 320);
        ctx.world.addChild(videoNode);
        const newId = videoNode.id;
        ctx.store.addNode({ id: newId, type: 'video', ref: videoNode });
        this.drag.bind(videoNode, new Subject<void>(), { cfg: ctx.cfg, store: ctx.store, guides: ctx.guides, world: ctx.world, app: ctx.app, bus: ctx.bus, utils: ctx.utils, overlay: ctx.overlay });
        // double-click to toggle play/pause if underlying HTMLVideoElement is present
        ctx.utils
          .fromPixi<FederatedPointerEvent>(videoNode, 'pointertap')
          .pipe(filter((evt) => evt.detail >= 2))
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
        ctx.bus.emit({ t: 'SELECT', ids: [newId] });
      }
    });

    // background audio controls
    ctx.bus.commands$.pipe(filter((command) => command.t === 'SET_AUDIO')).subscribe((cmd) => {
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

    ctx.bus.commands$.pipe(filter((command) => command.t === 'PLAY_AUDIO')).subscribe(() => {
      if (this.backgroundAudio) {
        void this.backgroundAudio.play();
        ctx.store.patchState({ isPlayingAudio: true });
      }
    });
    ctx.bus.commands$.pipe(filter((command) => command.t === 'PAUSE_AUDIO')).subscribe(() => {
      if (this.backgroundAudio) {
        this.backgroundAudio.pause();
        ctx.store.patchState({ isPlayingAudio: false });
      }
    });
  }
}
