import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import { UiTextStyles } from '../types';

/**
 * Union of all editor commands that can be dispatched through CommandBusService.
 *
 * Notes:
 * - SELECT: set selected node ids
 * - ADD_*: create nodes at optional coordinates and size
 * - GROUP/UNGROUP: group multiple nodes into one, or explode a group
 * - DELETE/DUPLICATE: remove or clone current selection
 * - APPLY_STYLE: patch text-related UI style (also used by shapes/brush for color/width)
 * - MOVE/RESIZE: emitted by interactions to reflect current geometry
 * - ZOOM/SNAP/GUIDES: viewport and snapping options
 * - PASTE_CLIPBOARD: ask plugins to paste content
 */
export type EditorCommand =
  | { t: 'SELECT'; ids: string[] }
  | { t: 'ADD_TEXT'; x: number; y: number; w?: number; h?: number; text?: string }
  | { t: 'ADD_IMAGE'; url: string; x?: number; y?: number; w?: number; h?: number }
  | { t: 'ADD_VIDEO'; url: string; x?: number; y?: number; w?: number; h?: number }
  | { t: 'SET_AUDIO'; url?: string }
  | { t: 'PLAY_AUDIO' | 'PAUSE_AUDIO' }
  | { t: 'ADD_IFRAME'; url: string; x?: number; y?: number; w?: number; h?: number }
  | { t: 'ADD_SHAPE'; shape: 'rect' | 'ellipse' | 'line'; x: number; y: number; w?: number; h?: number }
  | { t: 'START_BRUSH' }
  | { t: 'GROUP'; ids: string[] }
  | { t: 'UNGROUP'; id: string }
  | { t: 'DELETE'; ids?: string[] }
  | { t: 'DUPLICATE'; ids?: string[] }
  | { t: 'APPLY_STYLE'; patch: Partial<UiTextStyles> }
  | { t: 'MOVE'; id: string; x: number; y: number }
  | { t: 'RESIZE'; id: string; w: number; h: number }
  | { t: 'ZOOM'; z: number }
  | { t: 'SNAP'; on: boolean }
  | { t: 'GUIDES'; on: boolean }
  | { t: 'BRING_TO_FRONT' }
  | { t: 'SEND_TO_BACK' }
  | { t: 'BRING_FORWARD' }
  | { t: 'SEND_BACKWARD' }
  | { t: 'SET_SHAPE_BACKGROUND'; url: string }
  | { t: 'CLEAR_SHAPE_BACKGROUND' }
  | { t: 'SET_SHAPE_FILL'; color: number }
  | { t: 'SET_TEXT_BACKGROUND'; url: string }
  | { t: 'CLEAR_TEXT_BACKGROUND' }
  | { t: 'SET_TEXT_BG_COLOR'; color: number }
  | { t: 'PASTE_CLIPBOARD' };

/** Simple RxJS bus that transports EditorCommand events between UI and plugins. */
@Injectable()
export class CommandBusService {
  private readonly subject = new Subject<EditorCommand>();
  readonly commands$ = this.subject.asObservable();
  /** Emit a command into the bus. */
  emit(cmd: EditorCommand) { this.subject.next(cmd); }
}
