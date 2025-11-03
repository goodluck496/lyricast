import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { FreeSlidePages } from '@lyri-cast/free-slide-feature';
import { PrimeTemplate } from 'primeng/api';

@Component({
  selector: 'lyri-free-slide-main',
  standalone: true,
  imports: [CommonModule, PageContainerComponent, PrimeTemplate],
  templateUrl: './free-slide-main.component.html',
  styleUrl: './free-slide-main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideMainComponent {
  protected readonly Pages = Pages;
  protected readonly FreeSlidePages = FreeSlidePages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
}
