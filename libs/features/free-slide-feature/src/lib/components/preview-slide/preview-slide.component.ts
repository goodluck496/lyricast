import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Slide } from '@lyri-cast/entities';
import { AssetStorageService } from '@lyri-cast/form';
import { BehaviorSubject } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'lyri-preview-slide',
  standalone: true,
  imports: [CommonModule],
  templateUrl: 'preview-slide.component.html',
  styleUrl: 'preview-slide.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewSlideComponent implements OnChanges {
  private assetStorage = inject(AssetStorageService);
  private sanitizer = inject(DomSanitizer);

  slide = input.required<Slide>();
  selected = input(false);

  previewUrl$ = new BehaviorSubject<SafeUrl | null>(null);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['slide']) {
      const assetId = this.slide().previewAssetId;
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
