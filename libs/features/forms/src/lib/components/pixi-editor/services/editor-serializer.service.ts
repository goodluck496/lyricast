import { inject, Injectable } from '@angular/core';
import { Application, Assets, Point } from 'pixi.js';
import { AssetStorageService } from './asset-storage.service';
import { EditorStore } from './editor-store.service';
import {
  BrushNode,
  IframeNode,
  ImageNode,
  ShapeNode,
  TextNode,
  VideoNode,NodeBase
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
} from '@lyri-cast/entities';
import { CommandBusService } from './command-bus.service';
import { SceneViewportService } from './scene-viewport.service';

@Injectable()
export class EditorSerializerService {
  private readonly store = inject(EditorStore);
  private readonly assetStorage = inject(AssetStorageService);
  private readonly bus = inject(CommandBusService);
  private readonly sceneViewport = inject(SceneViewportService);

  // These will be provided by the editor component during serialization/deserialization
  // to avoid circular dependencies or passing the entire component.
  public app!: Application;
  public sceneWidth!: number;
  public sceneHeight!: number;
  public baseSceneWidth!: number;
  public baseSceneHeight!: number;
  public aspectRatio!: '16:9' | '4:3' | 'none';

  /**
   * Сериализует текущее состояние редактора в JSON-объект.
   */
  serializeState(): SerializedState {
    const state = this.store.snapshot((s) => s);

    // Вычисляем offset сцены (где начинается рамка aspectRatio)
    // ВАЖНО: offset вычисляется БЕЗ учета zoom, т.к. sceneWidth/Height уже учитывают zoom
    // Get the current scene bounds from SceneViewportService
    const sceneBounds = this.sceneViewport.getSceneBounds();
    const sceneOffsetX = sceneBounds.x;
    const sceneOffsetY = sceneBounds.y;

    const serializableNodes = Object.values(state.nodes)
      .map((nodeState) => {
        const node = nodeState.ref as NodeBase;
        // Сохраняем координаты относительно начала сцены (рамки aspectRatio)
        const baseData: SerializedNodeBase = {
          id: node.id,
          type: nodeState.type as SerializedNode['type'],
          x: node.x - sceneOffsetX,
          y: node.y - sceneOffsetY,
          width: node.w,
          height: node.h,
          rotation: node.rotation,
          alpha: node.alpha,
        };

        if (node instanceof TextNode) {
          return {
            id: node.id,
            type: 'text',
            x: node.x - sceneOffsetX,
            y: node.y - sceneOffsetY,
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
        return null;
      })
      .filter((n) => n !== null);

    const result: SerializedState = {
      nodes: serializableNodes,
      zoom: state.zoom,
      sceneBounds: {
        width: this.sceneViewport.baseSceneWidth, // Use baseSceneWidth for serialization
        height: this.sceneViewport.baseSceneHeight, // Use baseSceneHeight for serialization
      },
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

    // Вычисляем offset сцены для восстановления абсолютных координат
    // Get the current scene bounds from SceneViewportService
    const sceneBounds = this.sceneViewport.getSceneBounds();
    const sceneOffsetX = sceneBounds.x;
    const sceneOffsetY = sceneBounds.y;

    data.nodes.forEach((nodeData) => {
      const options = {
        width: nodeData.width,
        height: nodeData.height,
        rotation: nodeData.rotation,
        alpha: nodeData.alpha,
      };

      // Восстанавливаем абсолютные координаты, добавляя offset сцены
      const absoluteX = nodeData.x + sceneOffsetX;
      const absoluteY = nodeData.y + sceneOffsetY;

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
                actualFontSize: nodeData.actualFontSize,
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
  }
}
