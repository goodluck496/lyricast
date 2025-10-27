/**
 * Типы для сериализации/десериализации состояния PixiJS редактора.
 * Используются для сохранения слайдов и передачи в окно трансляции.
 */

export type SerializedNodeBase = {
  id: string;
  type: 'text' | 'image' | 'video' | 'iframe' | 'shape' | 'brush' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  alpha: number;
};

export type SerializedTextNode = SerializedNodeBase & {
  type: 'text';
  textHtml: string;
  style: any; // UiTextStyles из pixi-editor
  actualFontSize?: number; // Реальный размер шрифта после auto-fit
  bgFillColor?: number | null; // Цвет фона
  bgAssetId?: string; // ID фонового изображения в AssetStorageService
};

export type SerializedImageNode = SerializedNodeBase & {
  type: 'image';
  url?: string; // URL внешнего изображения
  assetId?: string; // ID изображения в AssetStorageService
};

export type SerializedVideoNode = SerializedNodeBase & {
  type: 'video';
  url?: string; // URL внешнего видео
  assetId?: string; // ID видео в AssetStorageService
};

export type SerializedIframeNode = SerializedNodeBase & {
  type: 'iframe';
  url: string;
};

export type SerializedShapeNode = SerializedNodeBase & {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  fill: number;
  stroke: number;
  lineWidth: number;
  bgAssetId?: string; // ID фонового изображения в AssetStorageService
};

export type SerializedBrushNode = SerializedNodeBase & {
  type: 'brush';
  stroke: number;
  strokeWidth: number;
  path: { x: number; y: number }[];
  bgAssetId?: string; // ID фонового изображения в AssetStorageService
};

export type SerializedNode =
  | SerializedTextNode
  | SerializedImageNode
  | SerializedVideoNode
  | SerializedIframeNode
  | SerializedShapeNode
  | SerializedBrushNode;

export type SerializedState = {
  nodes: SerializedNode[];
  zoom: number;
  sceneBounds?: {
    width: number;
    height: number;
  };
};
