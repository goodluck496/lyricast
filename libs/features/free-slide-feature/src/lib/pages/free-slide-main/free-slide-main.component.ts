import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { FreeSlidePages, PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { PrimeTemplate } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { FreeSlideApiService } from '@lyri-cast/shared-browser/data-access/free-slide';
import { Observable } from 'rxjs';
import { Presentation } from '@lyri-cast/entities';
import { ActivatedRoute, Router } from '@angular/router';
import { FreeSlideSidebarComponent } from '../../components/free-slide-sidebar/free-slide-sidebar.component';

@Component({
  selector: 'lyri-free-slide-main',
  standalone: true,
  imports: [
    CommonModule,
    PageContainerComponent,
    PrimeTemplate,
    CardModule,
    ButtonModule,
    FreeSlideSidebarComponent,
  ],
  templateUrl: './free-slide-main.component.html',
  styleUrl: './free-slide-main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideMainComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly Pages = Pages;
  protected readonly FreeSlidePages = FreeSlidePages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;

  private readonly api = inject(FreeSlideApiService);

  presentations$!: Observable<Presentation[]>;

  ngOnInit() {
    this.presentations$ = this.api.getAll();
    this.cdr.detectChanges();
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
