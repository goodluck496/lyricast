import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { FreeSlidePages, PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { PrimeTemplate } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { FreeSlideApiService } from '@lyri-cast/shared-browser/data-access/free-slide';
import { BehaviorSubject, first } from 'rxjs';
import { Presentation } from '@lyri-cast/entities';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { NgScrollbarCdkVirtualScroll } from 'ngx-scrollbar/cdk';
import { NgScrollbarExt } from 'ngx-scrollbar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Ripple } from 'primeng/ripple';
import { AssetStorageService } from '@lyri-cast/form';


export type PresentationWithPreview = Presentation & { previewUrl?: string };

@Component({
  selector: 'lyri-free-slide-main',
  standalone: true,
  imports: [
    CommonModule,
    PageContainerComponent,
    PrimeTemplate,
    CardModule,
    ButtonModule,
    NgScrollbarCdkVirtualScroll,
    NgScrollbarExt,
    Ripple,
  ],
  templateUrl: './free-slide-main.component.html',
  styleUrl: './free-slide-main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideMainComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  protected readonly Pages = Pages;
  protected readonly FreeSlidePages = FreeSlidePages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;

  private readonly api = inject(FreeSlideApiService);
  private readonly assetStorage = inject(AssetStorageService);

  presentations$ = new BehaviorSubject<PresentationWithPreview[]>([]);

  ngOnInit() {
    this.loadPresentations();

    this.cdr.detectChanges();

    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.loadPresentations();
        }
      });
  }

  loadPresentations() {
    this.api
      .getAll()
      .pipe(first())
      .subscribe(async (data) => {
        const presentationsWithPreviews = await Promise.all(
          data.map(async (p) => {
            const firstSlide = p.slides?.[0];
            if (firstSlide?.previewAssetId) {
              const url = await this.assetStorage.getAssetObjectURL(
                firstSlide.previewAssetId
              );
              return { ...p, previewUrl: url };
            }
            return p;
          })
        );
        this.presentations$.next(presentationsWithPreviews);
      });
  }

  onCreateNew() {
    this.api
      .create({
        title: 'Новая презентация',
        slides: [],
      })
      .subscribe((data) => {
        this.router.navigate(['..', FreeSlidePages.SLIDE, data.id], {
          relativeTo: this.route,
        });
      });
  }
  onSelect(presentation: Presentation) {
    this.router.navigate(['..', FreeSlidePages.SLIDE, presentation.id], {
      relativeTo: this.route,
    });
  }
}
