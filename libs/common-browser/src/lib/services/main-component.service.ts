import { Injectable, TemplateRef } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MainComponentService {
  pageHeaderControlsContainer: TemplateRef<any> | null = null

  setPageHeaderControlsContainer(tmpl: TemplateRef<any> | null) {
    this.pageHeaderControlsContainer = tmpl;
  }
}
