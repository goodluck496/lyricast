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
  bgImageUrl?: string; // URL фонового изображения
};

export type SerializedImageNode = SerializedNodeBase & {
  type: 'image';
  url: string;
  bgImageUrl: string | any;
};

export type SerializedVideoNode = SerializedNodeBase & {
  type: 'video';
  url: string;
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
  bgImageUrl: string | any;
};

export type SerializedBrushNode = SerializedNodeBase & {
  type: 'brush';
  stroke: number;
  strokeWidth: number;
  path: { x: number; y: number }[];
  bgImageUrl: string | any;
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
