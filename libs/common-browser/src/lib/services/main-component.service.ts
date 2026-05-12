import { Injectable, signal } from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { BehaviorSubject, Observable } from 'rxjs';

export enum PAGE_CONTAINER_TEMPLATES {
  PAGE_HEADER = 'page-header',
  PAGE_SIDEBAR = 'page-sidebar',
}

@Injectable({ providedIn: 'root' })
export class MainComponentService {
  private readonly _templates = new BehaviorSubject<
    Map<string, PrimeTemplate | null>
  >(new Map());
  templatesMap$: Observable<Map<string, PrimeTemplate | null>> =
    this._templates.asObservable();

  $disableSidebar = signal(false)

  setTemplates(type: PAGE_CONTAINER_TEMPLATES, template: PrimeTemplate): void {
    const templates = new Map(this._templates.value);
    templates.set(type, template);
    this._templates.next(templates);
  }

  clearTemplates(types: PAGE_CONTAINER_TEMPLATES[]): void {
    const templates = new Map(this._templates.value);

    types.forEach((type) => {
      templates.delete(type);
    });

    this._templates.next(templates);
  }
}
