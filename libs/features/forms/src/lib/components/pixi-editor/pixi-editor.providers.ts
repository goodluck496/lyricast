import { DEFAULT_CONFIG, EDITOR_CONFIG } from './types';
import { EDITOR_PLUGINS } from './core';
import {
  BrushPlugin,
  ClipboardPlugin,
  GroupingPlugin,
  IframePlugin,
  MediaPlugin,
  ShapesPlugin,
  TextPlugin,
} from './plugins';
import { HTML_EDITOR_COMPONENT, HtmlEditorComponent } from '../html-editor';
import {
  CommandBusService,
  DialogService,
  DragResizeService,
  EditorStore,
  EditorUtilsService,
  HistoryService,
  OverlayService,
  TextFitService,
} from './services';

export const PIXI_EDITOR_PROVIDERS = () => {
  return [
    { provide: EDITOR_CONFIG, useValue: DEFAULT_CONFIG },
    EditorStore,
    CommandBusService,
    EditorUtilsService,
    TextFitService,
    DragResizeService,
    DialogService,
    OverlayService,
    HistoryService,
    // Multi providers for EDITOR_PLUGINS token
    {
      provide: EDITOR_PLUGINS,
      useClass: TextPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: MediaPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: IframePlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: ShapesPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: BrushPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: GroupingPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: ClipboardPlugin,
      multi: true,
    },
    { provide: HTML_EDITOR_COMPONENT, useValue: HtmlEditorComponent },
  ];
};
