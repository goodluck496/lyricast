import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { selectFreeSlideSelected } from '@lyri-cast/free-slide-store';
import { filterEmpty } from '@lyri-cast/common';
import { AssetStorageService } from '@lyri-cast/form';
import { FreeSlideService } from '../../pages/free-slide-page/free-slide.service';

@Component({
  selector: 'lyri-free-slide-casting-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './free-slide-casting-preview.component.html',
  styleUrl: './free-slide-casting-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideCastingPreviewComponent implements OnDestroy {
  private store = inject(Store);
  private assetStorage = inject(AssetStorageService);
  private sanitizer = inject(DomSanitizer);
  private slideService = inject(FreeSlideService);

  previewUrl$ = new BehaviorSubject<SafeUrl | null>(null);
  private sub?: Subscription;

  constructor() {
    const live$ = this.slideService.livePreviewObjectUrl$;
    const selected$ = this.store.select(selectFreeSlideSelected).pipe(filterEmpty());
    this.sub = combineLatest([live$, selected$]).subscribe(async ([liveUrl, slide]) => {
      if (liveUrl) {
        this.previewUrl$.next(this.sanitizer.bypassSecurityTrustUrl(liveUrl));
        return;
      }
      const assetId = slide.previewAssetId;
      if (assetId) {
        const url = await this.assetStorage.getAssetObjectURL(assetId);
        if (url) {
          this.previewUrl$.next(this.sanitizer.bypassSecurityTrustUrl(url));
          return;
        }
      }
      this.previewUrl$.next(null);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
