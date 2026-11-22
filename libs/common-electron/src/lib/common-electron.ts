import Display = Electron.Display;

export enum AppWindowTypes {
  MAIN = 'MAIN',
  CASTING = 'CASTING',
}

export type AppDisplay = Display & {
  primary: boolean;
};

export type OutputRole = 'main' | 'stage' | 'secondary_bible' | 'lower_third';
export type OutputTargetType = 'display' | 'emulated' | 'obs_web' | 'ndi';

export interface OutputChannelConfig {
  id: string;
  name: string;
  targetType: OutputTargetType;
  displayId?: number;
  role: OutputRole;
  enabled: boolean;
  autoStart: boolean;
  ndiStreamName?: string;
  ndiFps?: 30 | 60;
  ndiResolution?: '1080p' | '720p';
}
