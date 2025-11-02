import { inject, Injectable } from '@angular/core';
import { Application, Point } from 'pixi.js';
import {
  BrushNode,
  GroupNode,
  IframeNode,
  ImageNode,
  NodeBase,
  ShapeNode,
  TextNode,
  VideoNode,
} from '../nodes';
import { TextFitService } from './text-fit.service';
import { AssetStorageService } from './asset-storage.service';
import { SerializedNode, SerializedNodeBase } from '@lyri-cast/entities'; // <-- Добавлен импорт SerializedNodeBase

@Injectable()
export class NodeFactoryService {
  private readonly textFit = inject(TextFitService);
  private readonly assetStorage = inject(AssetStorageService);

  // This will be provided by the editor component
  public app!: Application;

  /**
   * Определяет тип NodeBase.
   * @param n
   */
  getNodeType(
    n: NodeBase
  ): 'text' | 'image' | 'video' | 'iframe' | 'shape' | 'group' | 'brush' {
    if (n instanceof TextNode) return 'text';
    if (n instanceof ImageNode) return 'image';
    if (n instanceof VideoNode) return 'video';
    if (n instanceof IframeNode) return 'iframe';
    if (n instanceof ShapeNode) return 'shape';
    if (n instanceof GroupNode) return 'group';
    if (n instanceof BrushNode) return 'brush';
    // Fallback: create an explicit type if new node classes appear
    // Unknown node type; defaulting to 'group' to keep it visible
    return 'group';
  }

  /**
   * Создает NodeBase из сериализованных данных.
   * @param nodeData - Сериализованные данные узла.
   * @param options - Опции создания, например, isCastingMode.
   * @returns Созданный NodeBase или null, если тип неизвестен.
   */
  async createNodeFromSerialized(
    nodeData: SerializedNode,
    options?: { isCastingMode?: boolean } // <-- Удалить scaleFactor
  ): Promise<NodeBase | undefined> {
    const isCastingMode = options?.isCastingMode || false;
    // const scaleFactor = options?.scaleFactor || 1; // <-- Удалить
    let node: NodeBase | undefined;

    switch (nodeData.type) {
      case 'text':
        {
          const textNode = new TextNode(
            this.app,
            this.textFit,
            this.assetStorage,
            isCastingMode
            // scaleFactor // <-- Удалить
          );
          textNode.textHtml = nodeData.textHtml;
          if (nodeData.style) {
            textNode.style = { ...nodeData.style };
            // actualFontSize передается для восстановления, applyBoxSize его использует
            textNode.style.actualFontSize = nodeData.actualFontSize;
          }
          if (typeof nodeData.bgFillColor === 'number') {
            textNode.setBackgroundFill(nodeData.bgFillColor);
          } else if (nodeData.bgAssetId) {
            void textNode.setBackground(nodeData.bgAssetId);
          }
          textNode.applyBoxSize(nodeData.width, nodeData.height);
          // В режиме кастинга всегда вызываем layout для корректного отображения
          if (isCastingMode || !nodeData.actualFontSize) {
            void textNode.layout();
          }
          node = textNode;
        }
        break;
      case 'image': {
        const imageNode = new ImageNode(undefined, isCastingMode); // <-- Удалить scaleFactor
        imageNode.assetId = nodeData.assetId;
        imageNode.url = nodeData.url;
        if (nodeData.assetId) {
          const objectURL = await this.assetStorage.getAssetObjectURL(
            nodeData.assetId
          );
          if (objectURL) {
            void imageNode.setImage(objectURL);
          }
        } else if (nodeData.url) {
          void imageNode.setImage(nodeData.url);
        }
        imageNode.applyBoxSize(nodeData.width, nodeData.height);
        node = imageNode;
        break;
      }
      case 'video': {
        const videoNode = new VideoNode(undefined, isCastingMode); // <-- Удалить scaleFactor
        videoNode.assetId = nodeData.assetId;
        videoNode.url = nodeData.url ?? '';
        if (nodeData.assetId) {
          const objectURL = await this.assetStorage.getAssetObjectURL(
            nodeData.assetId
          );
          if (objectURL) {
            void videoNode.setVideo(objectURL);
          }
        } else if (nodeData.url) {
          void videoNode.setVideo(nodeData.url);
        }
        videoNode.applyBoxSize(nodeData.width, nodeData.height);
        node = videoNode;
        break;
      }

      case 'iframe': {
        const iframeNode = new IframeNode(nodeData.url, isCastingMode);
        iframeNode.applyBoxSize(nodeData.width, nodeData.height);
        node = iframeNode;
        break;
      }
      case 'shape': {
        const shapeNode = new ShapeNode(
          nodeData.shape,
          this.assetStorage,
          isCastingMode
        ); // <-- Удалить scaleFactor
        shapeNode.fill = nodeData.fill;
        shapeNode.stroke = nodeData.stroke;
        shapeNode.lineWidth = nodeData.lineWidth;
        if (nodeData.bgAssetId) {
          void shapeNode.setBackground(nodeData.bgAssetId);
        }
        shapeNode.applyBoxSize(nodeData.width, nodeData.height);
        node = shapeNode;
        break;
      }
      case 'brush': {
        const brushNode = new BrushNode(this.assetStorage, isCastingMode); // <-- Удалить scaleFactor
        brushNode.stroke = nodeData.stroke;
        brushNode.strokeWidth = nodeData.strokeWidth;
        if (nodeData.path) {
          // Передаем путь без масштабирования
          brushNode.setPath(nodeData.path.map((p) => new Point(p.x, p.y)));
        }
        if (nodeData.bgAssetId) {
          void brushNode.setBackground(nodeData.bgAssetId);
        }
        brushNode.applyBoxSize(nodeData.width, nodeData.height);
        node = brushNode;
        break;
      }
      case 'group': {
        // Явно приводим nodeData к SerializedNodeBase, чтобы получить доступ к width/height
        const groupNodeData = nodeData as SerializedNodeBase;
        node = new GroupNode(isCastingMode);
        node.applyBoxSize(groupNodeData.width, groupNodeData.height);
        break;
      }
    }

    if (node) {
      node.id = nodeData.id;
      node.x = nodeData.x;
      node.y = nodeData.y;
      node.rotation = nodeData.rotation;
      node.alpha = nodeData.alpha;
    }
    return node;
  }

  /**
   * Клонирует NodeBase и его специфичные свойства.
   * @param src
   */
  cloneNode(src: NodeBase): NodeBase | null {
    const isCastingMode = src.isCastingMode; // Сохраняем режим кастинга при клонировании

    if (src instanceof TextNode) {
      const n = new TextNode(
        this.app,
        this.textFit,
        this.assetStorage,
        isCastingMode
      );
      n.textHtml = src.textHtml;
      n.style = { ...src.style };
      n.applyBoxSize(src.w, src.h);
      n.requestFit();
      return n;
    }
    if (src instanceof ImageNode) {
      const n = new ImageNode(undefined, isCastingMode);
      n.applyBoxSize(src.w, src.h);
      n.sprite.texture = (src as ImageNode).sprite.texture;
      n.sprite.anchor.set(0.5);
      n.sprite.position.set(n.w / 2, n.h / 2);
      n.sprite.scale.set((src as ImageNode).sprite.scale.x);
      return n;
    }
    if (src instanceof VideoNode) {
      const n = new VideoNode(undefined, isCastingMode);
      n.applyBoxSize(src.w, src.h);
      n.sprite.texture = (src as VideoNode).sprite.texture;
      n.sprite.anchor.set(0.5);
      n.sprite.position.set(n.w / 2, n.h / 2);
      n.sprite.scale.set((src as VideoNode).sprite.scale.x);
      return n;
    }
    if (src instanceof IframeNode) {
      const n = new IframeNode(src.url, isCastingMode);
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof GroupNode) {
      // Deep-clone group with its children (as a new independent block)
      const childClones: NodeBase[] = [];
      const g = new GroupNode(isCastingMode);
      g.applyBoxSize(src.w, src.h);
      // Clone each child, keep relative position
      for (const ch of src.children) {
        if (!(ch instanceof NodeBase)) continue;
        const c = this.cloneNode(ch);
        if (!c) continue;
        c.x = ch.x;
        c.y = ch.y;
        c.eventMode = 'none';
        g.addChild(c);
        childClones.push(c);
      }
      return g;
    }
    if (src instanceof ShapeNode) {
      const n = new ShapeNode(src.shape, this.assetStorage, isCastingMode);
      n.fill = src.fill;
      n.stroke = src.stroke;
      n.lineWidth = src.lineWidth;
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof BrushNode) {
      const n = new BrushNode(this.assetStorage, isCastingMode);
      n.stroke = src.stroke;
      n.strokeWidth = src.strokeWidth;
      n.applyBoxSize(src.w, src.h);
      // copy path from internal BrushNode state; TypeScript doesn't expose it, so we use a typed view
      type HasPath = { path?: Point[] };
      const raw = src as unknown as HasPath; // specific structural type cast instead of any
      const pts: Point[] = (raw.path ?? []).map(
        (p: Point) => new Point(p.x, p.y)
      );
      n.setPath(pts);
      return n;
    }
    return null;
  }
}
