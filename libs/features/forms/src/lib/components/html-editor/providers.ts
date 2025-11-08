import { InjectionToken, Type } from '@angular/core';
import { HtmlEditorComponent } from './html-editor.component';

export const HTML_EDITOR_COMPONENT = new InjectionToken<Type<HtmlEditorComponent>>(
  'HTML_EDITOR_COMPONENT',
  { factory: () => HtmlEditorComponent }
);
