import { Injectable } from '@angular/core';
import { Application, Container, FederatedPointerEvent, Rectangle } from 'pixi.js';
import { merge, Subject } from 'rxjs';
import { auditTime, filter, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { EditorConfig } from '../types';
import { EditorStore } from './editor-store.service';
import { HistoryService } from './history.service';
import { MoveNodeCommand, ResizeNodeCommand, RotateNodeCommand } from './history-commands';
import { GuideLayer } from '../guides';
import { CommandBusService } from './command-bus.service';
import { EditorUtilsService } from './editor-utils.service';
import { NodeBase } from '../core';
import { OverlayService } from './overlay.service';

/**
 * Handles pointer interactions for moving, resizing and rotating NodeBase instances.
 *
 * Uses RxJS streams from EditorUtilsService to unify Pixi.js pointer events.
 */
@Injectable({ providedIn: 'root' })
export class DragResizeService {
  constructor() {}

  /**
   * Binds drag/resize/rotate handlers to a node.
   * - Dragging occurs when pointerdown starts on the node body (not on a handle).
   * - Resizing occurs when pointerdown starts on one of the eight compass‑named handles.
   * - Rotation occurs when pointerdown starts on the special 'rot' handle above the node.
   */
  bind(
    node: NodeBase,
    destroy$: Subject<void>,
    ctx: {
      cfg: EditorConfig;
      store: EditorStore;
      guides: GuideLayer;
      world: Container & { app: Application };
      app: Application;
      bus: CommandBusService;
      utils: EditorUtilsService;
      overlay?: OverlayService;
      history?: HistoryService;
    }
  ) {
    node.eventMode = 'static';
    // Pixi DisplayObject supports setting cursor but typings may not include it on Container in our version.
    (node as unknown as { cursor?: string }).cursor = 'move';

    const move$ = ctx.utils.fromPixi<FederatedPointerEvent>(ctx.app.stage, 'globalpointermove');
    const up$ = merge(
      ctx.utils.fromPixi<FederatedPointerEvent>(ctx.app.stage, 'pointerup'),
      ctx.utils.fromPixi<FederatedPointerEvent>(ctx.app.stage, 'pointerupoutside'),
      ctx.utils.fromPixi<FederatedPointerEvent>(ctx.app.stage, 'pointercancel'),
    );

    ctx.utils.fromPixi<FederatedPointerEvent>(node, 'pointerdown')
      .pipe(takeUntil(destroy$))
      .subscribe((event) => {
        // If brush mode is active, ignore node interactions so drawing works over nodes
        if (ctx.store.snapshot(s => !!s.brushActive)) return;
        event.stopPropagation();
        ctx.overlay?.setIframeInteractive(false);
        const isMultiSelect = event.ctrlKey || (event as unknown as { metaKey?: boolean }).metaKey === true;
        const currentSelection = ctx.store.snapshot(s => s.selectedIds);
        if (isMultiSelect) {
          const selectionSet = new Set(currentSelection);
          if (selectionSet.has(node.id)) selectionSet.delete(node.id); else selectionSet.add(node.id);
          ctx.bus.emit({ t: 'SELECT', ids: Array.from(selectionSet) });
        } else {
          ctx.bus.emit({ t: 'SELECT', ids: [node.id] });
        }
      });

    ctx.utils.fromPixi<FederatedPointerEvent>(node, 'pointerdown').pipe(
      filter((event) => !this.isOnHandle(node, event) && !ctx.store.snapshot(s => !!s.brushActive)),
      map((event) => ({ start: ctx.utils.toWorldLocal(event, ctx.world), origin: { x: node.x, y: node.y } })),
      switchMap((startState) =>
        move$.pipe(
          map((moveEvent) => ctx.utils.toWorldLocal(moveEvent, ctx.world)),
          auditTime(0),
          map((worldPoint) => {
            let nextX = startState.origin.x + (worldPoint.x - startState.start.x);
            let nextY = startState.origin.y + (worldPoint.y - startState.start.y);
            const snapEnabled = ctx.store.snapshot(s => s.snapEnabled);
            if (node.snap && snapEnabled) {
              nextX = ctx.utils.snap(nextX, ctx.cfg.dragSnap);
              nextY = ctx.utils.snap(nextY, ctx.cfg.dragSnap);
            }
            const snapped = ctx.guides.snap(node, nextX, nextY, node.w, node.h);
            ctx.guides.draw(snapped.lines);
            return { x: snapped.x, y: snapped.y, startX: startState.origin.x, startY: startState.origin.y };
          }),
          takeUntil(up$.pipe(tap(() => {
            // При завершении перемещения сохраняем команду в историю
            const finalX = node.x;
            const finalY = node.y;
            if (ctx.history && (finalX !== startState.origin.x || finalY !== startState.origin.y)) {
              const command = new MoveNodeCommand(
                node,
                startState.origin.x,
                startState.origin.y,
                finalX,
                finalY
              );
              ctx.history.execute(command);
            }
          }))),
        )
      ),
      takeUntil(destroy$)
    ).subscribe((position) => {
      node.position.set(position.x, position.y);
      ctx.bus.emit({ t: 'MOVE', id: node.id, x: position.x, y: position.y });
      ctx.overlay?.syncToNode(node);
    });

    // Clear guides on pointer up to prevent lingering lines when not moving
    up$.pipe(takeUntil(destroy$)).subscribe(() => ctx.guides.draw([]));

    type RotateResult = { kind: 'rotate'; rotation: number; centerX: number; centerY: number; boxW: number; boxH: number };
    type ResizeResult = { kind: 'resize'; nextX: number; nextY: number; nextW: number; nextH: number; rotation: number; anchorWorld: { x: number; y: number }; handleName: string };
    type StartState = { 
      handleName: string; 
      start: { x: number; y: number }; 
      begin: { x: number; y: number; w: number; h: number; rotation: number }; 
      anchorWorld: { x: number; y: number } 
    };

    Object.entries(node.handleRects).forEach(([handleName, handleGraphic]) => {
      if (!handleGraphic) return;
      ctx.utils.fromPixi<FederatedPointerEvent>(handleGraphic, 'pointerdown').pipe(
        tap((event) => event.stopPropagation()),
        map((event): StartState => {
          const startPoint = ctx.utils.toWorldLocal(event, ctx.world);
          const begin = { x: node.x, y: node.y, w: node.w, h: node.h, rotation: node.rotation };
          const handleKey = handleName as string;
          let anchorOffsetX = 0, anchorOffsetY = 0;
          if (handleKey === 'se') { anchorOffsetX = 0; anchorOffsetY = 0; }
          else if (handleKey === 'ne') { anchorOffsetX = 0; anchorOffsetY = begin.h; }
          else if (handleKey === 'sw') { anchorOffsetX = begin.w; anchorOffsetY = 0; }
          else if (handleKey === 'nw') { anchorOffsetX = begin.w; anchorOffsetY = begin.h; }
          else if (handleKey === 'e') { anchorOffsetX = 0; anchorOffsetY = begin.h / 2; }
          else if (handleKey === 'w') { anchorOffsetX = begin.w; anchorOffsetY = begin.h / 2; }
          else if (handleKey === 'n') { anchorOffsetX = begin.w / 2; anchorOffsetY = begin.h; }
          else if (handleKey === 's') { anchorOffsetX = begin.w / 2; anchorOffsetY = 0; }
          const cosine = Math.cos(begin.rotation || 0);
          const sine = Math.sin(begin.rotation || 0);
          const anchorWorld = { x: begin.x + (anchorOffsetX * cosine - anchorOffsetY * sine), y: begin.y + (anchorOffsetX * sine + anchorOffsetY * cosine) };
          return { handleName, start: startPoint, begin, anchorWorld };
        }),
        switchMap((startState) =>
          move$.pipe(
            map((moveEvent) => ctx.utils.toWorldLocal(moveEvent, ctx.world)),
            auditTime(0),
            map((worldPoint) => {
              if (startState.handleName === 'rot') {
                const cosine0 = Math.cos(startState.begin.rotation || 0);
                const sine0 = Math.sin(startState.begin.rotation || 0);
                const centerX = startState.begin.x + (startState.begin.w / 2) * cosine0 - (startState.begin.h / 2) * sine0;
                const centerY = startState.begin.y + (startState.begin.w / 2) * sine0 + (startState.begin.h / 2) * cosine0;
                const angle0 = Math.atan2(startState.start.y - centerY, startState.start.x - centerX);
                const angle1 = Math.atan2(worldPoint.y - centerY, worldPoint.x - centerX);
                let angle = startState.begin.rotation + (angle1 - angle0);
                const snapEnabled = ctx.store.snapshot(s => s.snapEnabled);
                if (snapEnabled) {
                  const step = Math.PI / 12;
                  angle = Math.round(angle / step) * step;
                }
                const result: RotateResult = { kind: 'rotate', rotation: angle, centerX, centerY, boxW: startState.begin.w, boxH: startState.begin.h };
                return result;
              }
              const minW = 80; const minH = 40;
              let nextX = startState.begin.x; let nextY = startState.begin.y; let nextW = startState.begin.w; let nextH = startState.begin.h;
              if (startState.handleName.includes('e')) nextW = Math.max(minW, worldPoint.x - startState.begin.x);
              if (startState.handleName.includes('s')) nextH = Math.max(minH, worldPoint.y - startState.begin.y);
              if (startState.handleName.includes('w')) { const px = Math.min(startState.begin.x + startState.begin.w - minW, worldPoint.x); nextW = Math.max(minW, startState.begin.x + startState.begin.w - px); nextX = px; }
              if (startState.handleName.includes('n')) { const py = Math.min(startState.begin.y + startState.begin.h - minH, worldPoint.y); nextH = Math.max(minH, startState.begin.y + startState.begin.h - py); nextY = py; }
              const snapEnabled = ctx.store.snapshot(s => s.snapEnabled);
              if (node.snap && snapEnabled) { nextW = ctx.utils.snap(nextW, ctx.cfg.resizeSnap); nextH = ctx.utils.snap(nextH, ctx.cfg.resizeSnap); nextX = ctx.utils.snap(nextX, ctx.cfg.resizeSnap); nextY = ctx.utils.snap(nextY, ctx.cfg.resizeSnap); }
              const snapped = ctx.guides.snap(node, nextX, nextY, nextW, nextH);
              ctx.guides.draw(snapped.lines);
              const result: ResizeResult = { kind: 'resize', nextX: snapped.x, nextY: snapped.y, nextW, nextH, rotation: startState.begin.rotation, anchorWorld: startState.anchorWorld, handleName: startState.handleName };
              return result;
            }),
            takeUntil(up$.pipe(tap(() => {
              // При завершении resize/rotate сохраняем команду в историю
              if (ctx.history) {
                if (startState.handleName === 'rot') {
                  // Сохраняем команду поворота
                  const finalRotation = node.rotation;
                  if (finalRotation !== startState.begin.rotation) {
                    const command = new RotateNodeCommand(
                      node,
                      startState.begin.rotation,
                      finalRotation
                    );
                    ctx.history.execute(command);
                  }
                } else {
                  // Сохраняем команду изменения размера
                  const finalX = node.x;
                  const finalY = node.y;
                  const finalW = node.w;
                  const finalH = node.h;
                  if (finalX !== startState.begin.x || finalY !== startState.begin.y || 
                      finalW !== startState.begin.w || finalH !== startState.begin.h) {
                    const command = new ResizeNodeCommand(
                      node,
                      startState.begin.w,
                      startState.begin.h,
                      startState.begin.x,
                      startState.begin.y,
                      finalW,
                      finalH,
                      finalX,
                      finalY
                    );
                    ctx.history.execute(command);
                  }
                }
              }
            }))),
          )
        ),
        takeUntil(destroy$)
      ).subscribe((result) => {
        if ((result as RotateResult | ResizeResult).kind === 'rotate') {
          const r = result as RotateResult;
          node.rotation = r.rotation;
          const cos = Math.cos(r.rotation);
          const sin = Math.sin(r.rotation);
          node.x = r.centerX - (r.boxW / 2) * cos + (r.boxH / 2) * sin;
          node.y = r.centerY - (r.boxW / 2) * sin - (r.boxH / 2) * cos;
          node.drawHandles();
          // Rotate command could be emitted here if/when the model supports it.
          // ctx.bus.emit({ t: 'ROTATE', id: node.id, rotation: node.rotation });
        } else {
          const r = result as ResizeResult;
          node.position.set(r.nextX, r.nextY);
          node.applyBoxSize(r.nextW, r.nextH);
          node.drawHandles();
          ctx.bus.emit({ t: 'RESIZE', id: node.id, w: node.w, h: node.h });
          ctx.overlay?.syncToNode(node);
        }
      });
    });
  }

  /**
   * Returns true if the given pointer event is within any of the node's handle hit areas.
   */
  isOnHandle(node: NodeBase, event: FederatedPointerEvent) {
    const localPoint = node.toLocal(event.global);
    for (const [, handleGraphic] of Object.entries(node.handleRects)) {
      if (!handleGraphic) continue;
      const hitArea = handleGraphic.hitArea;
      // Narrow to Rectangle – our handles are assigned Rectangle hitAreas in NodeBase.drawHandles
      if (!(hitArea && hitArea instanceof Rectangle)) continue;
      const x = handleGraphic.x + hitArea.x;
      const y = handleGraphic.y + hitArea.y;
      if (localPoint.x >= x && localPoint.x <= x + hitArea.width && localPoint.y >= y && localPoint.y <= y + hitArea.height) return true;
    }
    return false;
  }
}
