import { BrowserWindow } from 'electron';
import App, { DEFAULT_WEB_PREF } from '../app';
import { OutputChannelConfig, OutputRole } from '@lyri-cast/common-electron';

declare const __non_webpack_require__: any;

export interface NdiStreamConfig {
  streamName: string;
  channelId: string;
  role: OutputRole;
  fps?: number;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
}

export interface NdiStatus {
  available: boolean;
  activeStreams: string[];
  version?: string;
  error?: string;
}

interface ActiveStreamSession {
  config: NdiStreamConfig;
  sender: any;
  offscreenWindow: BrowserWindow;
  active: boolean;
}

export class NdiBroadcasterService {
  private static instance: NdiBroadcasterService | null = null;
  private isNdiAvailable = false;
  private activeStreams = new Map<string, ActiveStreamSession>();
  private grandi: any = null;

  public static getInstance(): NdiBroadcasterService {
    if (!NdiBroadcasterService.instance) {
      NdiBroadcasterService.instance = new NdiBroadcasterService();
    }
    return NdiBroadcasterService.instance;
  }

  constructor() {
    this.detectNdiRuntime();
  }

  private detectNdiRuntime(): boolean {
    try {
      const dynamicRequire =
        typeof __non_webpack_require__ !== 'undefined'
          ? __non_webpack_require__
          : typeof require !== 'undefined'
            ? require
            : null;

      if (dynamicRequire) {
        this.grandi = dynamicRequire('grandi');
        if (this.grandi && typeof this.grandi.send === 'function') {
          this.isNdiAvailable = true;
          const ver = this.grandi.version?.() || 'v6.x';
          console.log(`[NDI] Native NDI 6 SDK initialized successfully (${ver}).`);
          return true;
        }
      }
      return false;
    } catch (err) {
      this.isNdiAvailable = false;
      this.grandi = null;
      console.log(
        '[NDI] Native NDI runtime could not be loaded. Graceful fallback active.',
        err
      );
      return false;
    }
  }

  public getStatus(): NdiStatus {
    const activeStreamNames = Array.from(this.activeStreams.values()).map(
      (s) => s.config.streamName
    );
    return {
      available: this.isNdiAvailable,
      activeStreams: activeStreamNames,
      version: this.isNdiAvailable
        ? this.grandi?.version?.() || 'NDI 6.x'
        : undefined,
      error: this.isNdiAvailable
        ? undefined
        : 'NDI SDK не доступен в текущем окружении.',
    };
  }

  public getConnectedClients(channelId: string): number {
    const session = this.activeStreams.get(channelId);
    if (!session || !session.sender) return 0;
    try {
      return session.sender.connections?.() || 0;
    } catch {
      return 0;
    }
  }

  public async startBroadcast(config: NdiStreamConfig): Promise<boolean> {
    if (!this.isNdiAvailable || !this.grandi) {
      console.warn(
        `[NDI] Cannot start stream "${config.streamName}": NDI SDK not available.`
      );
      return false;
    }

    // Stop existing stream for this channel if active
    if (this.activeStreams.has(config.channelId)) {
      this.stopBroadcast(config.channelId);
    }

    try {
      console.log(
        `[NDI] Initializing NDI stream "${config.streamName}" for channel ${config.channelId} (role: ${config.role})...`
      );

      const sender = await this.grandi.send({
        name: config.streamName,
        clockVideo: true,
      });

      const width = config.width || (config.height === 720 ? 1280 : 1920);
      const height = config.height || 1080;
      const fps = config.fps || 30;

      // Create virtual offscreen BrowserWindow
      const offscreenWin = new BrowserWindow({
        show: false,
        width,
        height,
        useContentSize: true,
        backgroundColor: '#000000',
        webPreferences: {
          ...DEFAULT_WEB_PREF,
          offscreen: true,
        },
      });

      // Register offscreen window in App.castingWindows so it receives IPC sync events
      const procId = offscreenWin.webContents.getProcessId();
      App.castingWindows.set(config.channelId, offscreenWin);
      App.castingWindowProcessIds.set(procId, config.channelId);
      App.openedWindowTypesByProcess[procId] = 'CASTING' as any;

      // Determine target route according to role
      const baseUrl = App.getBaseUrl();
      let targetPath = `/bible/casting?channelId=${encodeURIComponent(config.channelId)}`;
      if (config.role === 'stage') {
        targetPath = `/stage-display?channelId=${encodeURIComponent(config.channelId)}`;
      } else if (config.role === 'secondary_bible') {
        targetPath = `/bible/casting?role=secondary_bible&channelId=${encodeURIComponent(config.channelId)}`;
      } else if (config.role === 'lower_third') {
        targetPath = `/obs/${encodeURIComponent(config.channelId)}`;
      }

      await offscreenWin.loadURL(`${baseUrl}#${targetPath}`);
      offscreenWin.webContents.setFrameRate(fps);

      let isSending = false;

      // Handle paint events from virtual offscreen renderer
      offscreenWin.webContents.on('paint', (_event, _dirty, image) => {
        if (!sender || isSending) return;
        const size = image.getSize();
        if (size.width === 0 || size.height === 0) return;

        isSending = true;
        try {
          const bitmap = image.getBitmap();
          sender
            .video({
              xres: size.width,
              yres: size.height,
              frameRateN: fps,
              frameRateD: 1,
              pictureAspectRatio: size.width / size.height,
              fourCC: this.grandi.FourCC.BGRA,
              frameFormatType: this.grandi.FrameType.Progressive,
              lineStrideBytes: size.width * 4,
              data: bitmap,
            })
            .catch(() => {})
            .finally(() => {
              isSending = false;
            });
        } catch {
          isSending = false;
        }
      });

      this.activeStreams.set(config.channelId, {
        config,
        sender,
        offscreenWindow: offscreenWin,
        active: true,
      });

      console.log(
        `[NDI] Stream "${config.streamName}" is now LIVE on local network at ${width}x${height} @ ${fps}fps!`
      );
      return true;
    } catch (err) {
      console.error(
        `[NDI] Failed to start NDI broadcast for channel ${config.channelId}:`,
        err
      );
      return false;
    }
  }

  public stopBroadcast(channelId: string): void {
    const session = this.activeStreams.get(channelId);
    if (!session) return;

    try {
      if (session.offscreenWindow && !session.offscreenWindow.isDestroyed()) {
        const procId = session.offscreenWindow.webContents.getProcessId();
        App.castingWindowProcessIds.delete(procId);
        delete App.openedWindowTypesByProcess[procId];
        session.offscreenWindow.destroy();
      }
      App.castingWindows.delete(channelId);
      session.sender?.destroy?.();
    } catch (e) {
      console.error(`[NDI] Error destroying stream ${channelId}:`, e);
    }

    this.activeStreams.delete(channelId);
    console.log(`[NDI] Stopped stream for channel ${channelId}`);
  }

  public stopAll(): void {
    Array.from(this.activeStreams.keys()).forEach((channelId) => {
      this.stopBroadcast(channelId);
    });
  }

  public async bootstrapAutostartStreams(channels: OutputChannelConfig[]): Promise<void> {
    if (!this.isNdiAvailable || !Array.isArray(channels)) return;

    for (const channel of channels) {
      if (channel.targetType === 'ndi' && channel.autoStart && channel.enabled) {
        const streamName =
          channel.ndiStreamName || `Lyricast-${channel.name.replace(/\s+/g, '-')}`;
        const fps = channel.ndiFps || 30;
        const is720 = channel.ndiResolution === '720p';

        await this.startBroadcast({
          channelId: channel.id,
          streamName,
          role: channel.role,
          fps,
          width: is720 ? 1280 : 1920,
          height: is720 ? 720 : 1080,
          hasAlpha: channel.role === 'lower_third',
        });
      }
    }
  }
}
