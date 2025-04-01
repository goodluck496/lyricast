import {
  AfterContentInit,
  Component,
  contentChildren,
  DestroyRef,
  inject,
  input,
} from '@angular/core';
import { MainComponentService, Pages } from '@lyri-cast/common-browser';
import { PrimeTemplate } from 'primeng/api';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export enum PAGE_CONTAINER_TEMPLATES {
  PAGE_HEADER = 'page-header'
}

@Component({
  selector: 'lyri-page-container',
  standalone: true,
  templateUrl: './page-container.component.html',
  styleUrl: './page-container.component.scss',
})
export class PageContainerComponent implements AfterContentInit {
  mainComponentService = inject(MainComponentService);
  destroyRef = inject(DestroyRef);

  pagePath = input.required<Array<Pages>>();
  router = inject(Router);

  templates = contentChildren(PrimeTemplate, {
    read: PrimeTemplate,
  });

  ngAfterContentInit() {
    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (e instanceof NavigationEnd) {
          const isActive = this.router.isActive(this.pagePath().join('/'), {
            paths: 'exact',
            queryParams: 'exact',
            fragment: 'ignored',
            matrixParams: 'ignored',
          });
          if (isActive) {
            this.addHeaderToMain();
          }
        }
      });

    this.addHeaderToMain();
  }

  addHeaderToMain() {
    const templates = this.templates();

    const headerTemplate = templates.find((el) => el.name === PAGE_CONTAINER_TEMPLATES.PAGE_HEADER);
    if (headerTemplate) {
      this.mainComponentService.setPageHeaderControlsContainer(
        headerTemplate.template
      );
    }
  }
}
