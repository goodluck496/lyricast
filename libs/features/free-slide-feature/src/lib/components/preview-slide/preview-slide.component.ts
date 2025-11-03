import { ChangeDetectionStrategy, Component, inject, Input, OnChanges, SimpleChanges, } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FreeSlide } from '@lyri-cast/entities';
import { AssetStorageService } from '@lyri-cast/form';
import { BehaviorSubject } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'lyri-preview-slide',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (previewUrl$ | async; as url) {
      <img [src]="url" class="preview-image" alt="Slide preview" />
    } @else {
      <div class="placeholder">
        <span>{{ slide?.index }}</span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        cursor: pointer;
      }

      .preview-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background-color: #333;
        color: #fff;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewSlideComponent implements OnChanges {
  private assetStorage = inject(AssetStorageService);
  private sanitizer = inject(DomSanitizer);

  @Input() slide?: FreeSlide;
  @Input() selected = false;

  previewUrl$ = new BehaviorSubject<SafeUrl | null>(null);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['slide']) {
      const assetId = this.slide?.previewAssetId;
      if (assetId) {
        this.assetStorage.getAssetObjectURL(assetId).then((url) => {
          if (url) {
            this.previewUrl$.next(this.sanitizer.bypassSecurityTrustUrl(url));
          }
        });
      } else {
        this.previewUrl$.next(null);
      }
    }
  }
}