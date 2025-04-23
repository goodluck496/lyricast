import { Injectable } from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { BehaviorSubject, Observable } from 'rxjs';

export enum PAGE_CONTAINER_TEMPLATES {
  PAGE_HEADER = 'page-header',
  PAGE_SIDEBAR = 'page-sidebar',
}

@Injectable({ providedIn: 'root' })
export class MainComponentService {
  _templates = new BehaviorSubject<Map<string, PrimeTemplate | null>>(
    new Map()
  );
  templatesMap$: Observable<Map<string, PrimeTemplate | null>> = this._templates.asObservable();

  setTemplates(type: PAGE_CONTAINER_TEMPLATES, template: PrimeTemplate): void {
    const oldTempl = this._templates.value;
    oldTempl.set(type, template);
    this._templates.next(oldTempl);
  }

  //
  // clearTemplates(types: PAGE_CONTAINER_TEMPLATES[]): void {
  //   types.forEach((type) => {
  //     this.templatesMap.set(type, null)
  //   });
  // }
}
