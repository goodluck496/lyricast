import {
  AfterContentInit, ChangeDetectorRef,
  Component,
  contentChildren,
  DestroyRef, effect,
  inject,
  input
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MainComponentService, PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { debounceTime } from 'rxjs';


@Component({
  selector: 'lyri-page-container',
  standalone: true,
  templateUrl: './page-container.component.html',
  styleUrl: './page-container.component.scss',
})
export class PageContainerComponent implements AfterContentInit {
  cdr = inject(ChangeDetectorRef)
  mainComponentService = inject(MainComponentService);
  destroyRef = inject(DestroyRef);

  pagePath = input.required<Array<Pages | string>>();
  router = inject(Router);

  templates = contentChildren(PrimeTemplate, {
    read: PrimeTemplate,
  });

  constructor() {
    effect(() => {
      const templates = this.templates()
      this.updateTemplates(templates)
    });
  }

  ngAfterContentInit() {
    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef),debounceTime(250))
      .subscribe((e) => {
        if (e instanceof NavigationEnd) {
          const isActive = this.router.isActive(this.pagePath().join('/'), {
            paths: 'exact',
            queryParams: 'exact',
            fragment: 'ignored',
            matrixParams: 'ignored',
          });
          if (isActive) {
            this.updateTemplates();
          }
        }
      });
  }

  updateTemplates(templates = this.templates()) {
      templates.forEach((template: PrimeTemplate) => {
        const type = template.name as PAGE_CONTAINER_TEMPLATES;

        this.mainComponentService.setTemplates(type, template);
      });

      this.cdr.markForCheck();

  }
}
