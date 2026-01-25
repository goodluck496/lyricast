import { inject, Injectable } from '@angular/core';
import { Application, Assets, Container, Point } from 'pixi.js';
import { AssetStorageService } from './asset-storage.service';
import { EditorStore } from './editor-store.service';
import {
  BrushNode,
  GroupNode,
  IframeNode,
  ImageNode,
  ShapeNode,
  TextNode,
  VideoNode,
  NodeBase,
} from '../nodes';
import {
  SerializedBrushNode,
  SerializedIframeNode,
  SerializedImageNode,
  SerializedNode,
  SerializedNodeBase,
  SerializedShapeNode,
  SerializedState,
  SerializedTextNode,
  SerializedVideoNode,
  SerializedGroupNode,
} from '@lyri-cast/entities';
import { CommandBusService } from './command-bus.service';
import { SceneViewportService } from './scene-viewport.service';
import { EditorUtilsService } from './editor-utils.service';
import { DragResizeService } from './drag-resize.service';
import { GuideLayer } from '../guides';
import { EditorConfig } from '../types';
import { OverlayService } from './overlay.service';
import { HistoryService } from './history.service';
import { Subject } from 'rxjs';

@Injectable()
export class EditorSerializerService {
  private readonly store = inject(EditorStore);
  private readonly assetStorage = inject(AssetStorageService);
  private readonly bus = inject(CommandBusService);
  private readonly sceneViewport = inject(SceneViewportService);
  private readonly utils = inject(EditorUtilsService);
  private readonly drag = inject(DragResizeService);
  private readonly history = inject(HistoryService);
  private readonly overlay = inject(OverlayService);

  // These will be provided by the editor component during serialization/deserialization
  // to avoid circular dependencies or passing the entire component.
  public app!: Application;
  public world!: Container & { app: Application };
  public sceneWidth!: number;
  public sceneHeight!: number;
  public baseSceneWidth!: number;
  public baseSceneHeight!: number;
  public aspectRatio!: '16:9' | '4:3' | 'none';
  public guides!: GuideLayer;
  public cfg!: EditorConfig;

  /**
   * Сериализует текущее состояние редактора в JSON-объект.
   */
  serializeState(): SerializedState {
    const state = this.store.snapshot((s) => s);

    const serializableNodes = Object.values(state.nodes)
      .map((nodeState) => {
        const node = nodeState.ref as NodeBase;
        const worldPos = node.getGlobalPosition();
        const baseData: SerializedNodeBase = {
          id: node.id,
          type: nodeState.type as SerializedNode['type'],
          x: worldPos.x, // Serialize position in world space to restore grouping correctly
          y: worldPos.y,
          width: node.w,
          height: node.h,
          rotation: node.rotation,
          alpha: node.alpha,
        };

        if (node instanceof TextNode) {
          return {
            id: node.id,
            type: 'text',
            x: node.x,
            y: node.y,
            alpha: node.alpha,
            width: node.w,
            height: node.h,
            rotation: node.rotation,
            textHtml: node.textHtml,
            style: node.style,
            padding: node.padding,
            bgFillColor: node.backgroundColor,
            bgAssetId: node.backgroundImageUrl,
            actualFontSize: node.currentFontSize,
          } as SerializedTextNode;
        }
        if (node instanceof ImageNode) {
          return {
            ...baseData,
            type: 'image',
            assetId: node.assetId, // Store asset ID
            url: node.url, // Store external URL
          } as SerializedImageNode;
        }
        if (node instanceof VideoNode) {
          return {
            ...baseData,
            type: 'video',
            assetId: node.assetId, // Store asset ID
            url: node.url, // Store external URL
          } as SerializedVideoNode;
        }
        if (node instanceof IframeNode) {
          return {
            ...baseData,
            type: 'iframe',
            url: node.url,
          } as SerializedIframeNode;
        }
        if (node instanceof ShapeNode) {
          return {
            ...baseData,
            type: 'shape',
            shape: node.shape,
            fill: node.fill,
            stroke: node.stroke,
            lineWidth: node.lineWidth,
            bgAssetId: node.bgAssetId, // Store asset ID
          } as SerializedShapeNode;
        }
        if (node instanceof BrushNode) {
          return {
            ...baseData,
            type: 'brush',
            stroke: node.stroke,
            strokeWidth: node.strokeWidth,
            path: node.path?.map((p: Point) => ({ x: p.x, y: p.y })),
            bgAssetId: node.bgAssetId, // Store asset ID
          } as SerializedBrushNode;
        }
        if (node instanceof GroupNode) {
          return {
            ...baseData,
            type: 'group',
            childrenIds: node.childrenIds,
          } as SerializedGroupNode;
        }
        return null;
      })
      .filter((n) => n !== null);

    const result: SerializedState = {
      nodes: serializableNodes as SerializedNode[],
      zoom: state.zoom,
      sceneBounds: {
        width: this.sceneViewport.baseSceneWidth, // Use baseSceneWidth for serialization
        height: this.sceneViewport.baseSceneHeight, // Use baseSceneHeight for serialization
      },
      aspectRatio: this.aspectRatio,
    };

    return result;
  }

  /**
   * Предварительная загрузка ассетов (изображений, видео) для данного состояния слайда.
   * Использует PixiJS Assets для кэширования.
   */
  async preloadAssets(data: SerializedState): Promise<void> {
    if (!data || !data.nodes) return;

    const urlsToPreload: string[] = [];

    for (const nodeData of data.nodes) {
      if (nodeData.type === 'image' || nodeData.type === 'video') {
        if (nodeData.assetId) {
          const objectURL = await this.assetStorage.getAssetObjectURL(
            nodeData.assetId
          );
          if (objectURL) urlsToPreload.push(objectURL);
        } else if (nodeData.url) {
          urlsToPreload.push(nodeData.url);
        }
      } else if (nodeData.type === 'iframe') {
        if (nodeData.url) {
          urlsToPreload.push(nodeData.url);
        }
      } else if (nodeData.type === 'text' && nodeData.bgAssetId) {
        const objectURL = await this.assetStorage.getAssetObjectURL(
          nodeData.bgAssetId
        );
        if (objectURL) urlsToPreload.push(objectURL);
      } else if (nodeData.type === 'shape' && nodeData.bgAssetId) {
        const objectURL = await this.assetStorage.getAssetObjectURL(
          nodeData.bgAssetId
        );
        if (objectURL) urlsToPreload.push(objectURL);
      } else if (nodeData.type === 'brush' && nodeData.bgAssetId) {
        const objectURL = await this.assetStorage.getAssetObjectURL(
          nodeData.bgAssetId
        );
        if (objectURL) urlsToPreload.push(objectURL);
      }
    }

    const uniqueUrls = Array.from(new Set(urlsToPreload));

    if (uniqueUrls.length > 0) {
      try {
        await Assets.load(uniqueUrls);
      } catch (e) {
        console.warn('[Editor] Failed to preload assets:', e);
      }
    }
  }

  /**
   * Десериализует состояние из JSON-объекта и воссоздает сцену.
   * @param data
   */
  deserializeState(data: SerializedState) {
    // this.clearAllNodes(); // This should be handled by the component
    if (!data || !data.nodes) return;

    const savedW = data.sceneBounds?.width ?? this.sceneViewport.baseSceneWidth;
    const savedH = data.sceneBounds?.height ?? this.sceneViewport.baseSceneHeight;
    const scaleX = savedW > 0 ? this.sceneViewport.baseSceneWidth / savedW : 1;
    const scaleY = savedH > 0 ? this.sceneViewport.baseSceneHeight / savedH : 1;
    const scaleFont = Math.min(scaleX, scaleY);

    const groupNodes: SerializedGroupNode[] = [];

    data.nodes.forEach((nodeData) => {
      if (nodeData.type === 'group') {
        groupNodes.push(nodeData as SerializedGroupNode);
        return;
      }

      const options = {
        width: nodeData.width * scaleX,
        height: nodeData.height * scaleY,
        rotation: nodeData.rotation,
        alpha: nodeData.alpha,
      };

      // Координаты теперь абсолютны относительно world, который уже сдвинут
      const absoluteX = nodeData.x * scaleX;
      const absoluteY = nodeData.y * scaleY;

      switch (nodeData.type) {
        case 'text':
          this.bus.emit({
            t: 'ADD_TEXT',
            x: absoluteX,
            y: absoluteY,
            text: nodeData.textHtml,
            options: {
              ...options,
              style: {
                ...nodeData.style,
                actualFontSize:
                  typeof nodeData.actualFontSize === 'number'
                    ? nodeData.actualFontSize * scaleFont
                    : undefined,
              },
              bgFillColor: nodeData.bgFillColor,
              bgAssetId: nodeData.bgAssetId, // Pass asset ID
            },
          });
          break;
        case 'image':
          this.bus.emit({
            t: 'ADD_IMAGE',
            assetId: nodeData.assetId, // Pass asset ID
            url: nodeData.url, // Pass external URL
            x: absoluteX,
            y: absoluteY,
            options: options,
          });
          break;
        case 'video':
          this.bus.emit({
            t: 'ADD_VIDEO',
            assetId: nodeData.assetId, // Pass asset ID
            url: nodeData.url, // Pass external URL
            x: absoluteX,
            y: absoluteY,
            options: options,
          });
          break;
        case 'iframe':
          this.bus.emit({
            t: 'ADD_IFRAME',
            url: nodeData.url,
            x: absoluteX,
            y: absoluteY,
            options: options,
          });
          break;
        case 'shape':
          this.bus.emit({
            t: 'ADD_SHAPE',
            shape: nodeData.shape,
            x: absoluteX,
            y: absoluteY,
            options: {
              ...options,
              fill: nodeData.fill,
              stroke: nodeData.stroke,
              lineWidth: nodeData.lineWidth,
              bgAssetId: nodeData.bgAssetId, // Pass asset ID
            },
          });
          break;
        case 'brush':
          this.bus.emit({
            t: 'ADD_BRUSH',
            path: nodeData.path,
            x: absoluteX,
            y: absoluteY,
            options: {
              ...options,
              stroke: nodeData.stroke,
              strokeWidth: nodeData.strokeWidth,
              bgAssetId: nodeData.bgAssetId, // Pass asset ID
            },
          });
          break;
      }
    });

    if (groupNodes.length) {
      // Восстанавливаем группировку на основе сохранённых childrenIds
      this.restoreGroups(groupNodes);
    }
  }

  private restoreGroups(groups: SerializedGroupNode[]) {
    if (!this.world || !this.guides || !this.cfg) return;

    const nodesById = this.store.snapshot((s) => s.nodes);
    for (const groupData of groups) {
      const group = new GroupNode();
      group.id = groupData.id;
      group.x = groupData.x;
      group.y = groupData.y;
      group.applyBoxSize(groupData.width, groupData.height);

      const destroy$ = new Subject<void>();
      this.world.addChild(group);
      this.store.addNode({ id: group.id, type: 'group', ref: group, destroy$ });

      const childrenIds = groupData.childrenIds ?? [];
      for (const childId of childrenIds) {
        const childRef = nodesById[childId]?.ref as NodeBase | undefined;
        if (!childRef) continue;
        try {
          childRef.parent?.removeChild(childRef);
        } catch {
          /* ignore */
        }
        childRef.x = childRef.x - group.x;
        childRef.y = childRef.y - group.y;
        group.addChild(childRef);
        childRef.eventMode = 'none';
      }

      this.drag.bind(group, destroy$, {
        cfg: this.cfg,
        store: this.store,
        guides: this.guides,
        world: this.world,
        app: this.app,
        bus: this.bus,
        utils: this.utils,
        overlay: this.overlay,
        history: this.history,
        getSceneBounds: () =>
          this.sceneViewport.getSceneBounds?.() ?? {
            x: 0,
            y: 0,
            width: this.sceneViewport.baseSceneWidth,
            height: this.sceneViewport.baseSceneHeight,
          },
      });
    }
  }
}
