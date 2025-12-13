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
import { selectFreeSlideNavigateState, selectFreeSlideSelected } from '@lyri-cast/free-slide-store';
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

  private readonly cache = new Map<string, SafeUrl>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();
  private destroyed = false;

  constructor() {
    const live$ = this.slideService.livePreviewObjectUrl$;
    const selected$ = this.store.select(selectFreeSlideSelected);
    const navigate$ = this.store.select(selectFreeSlideNavigateState);

    // Prefetch previews for the whole deck so selection feels instant.
    this.sub = new Subscription();
    this.sub.add(
      this.slideService.slides$.subscribe((slides) => {
        for (const s of slides) {
          const assetId = (s as any)?.previewAssetId as string | undefined;
          if (!assetId) continue;
          void this.prefetch(assetId);
        }
      })
    );

    this.sub.add(
      combineLatest([live$, navigate$, selected$]).subscribe(
        async ([liveUrl, nav, sel]) => {
          const slide = (nav?.slide ?? sel) as any;
          if (!slide) {
            this.previewUrl$.next(null);
            return;
          }

          if (liveUrl) {
            this.previewUrl$.next(
              this.sanitizer.bypassSecurityTrustUrl(liveUrl)
            );
            return;
          }

          const assetId = slide.previewAssetId as string | undefined;
          if (!assetId) {
            this.previewUrl$.next(null);
            return;
          }

          const cached = this.cache.get(assetId);
          if (cached) {
            this.previewUrl$.next(cached);
            return;
          }

          // Don't block UI: start fetch and update when ready.
          this.previewUrl$.next(null);
          const url = await this.prefetch(assetId);
          if (this.destroyed) return;

          // Ensure the same slide is still selected and we are not showing live preview.
          const currentLive = this.slideService.livePreviewObjectUrl$.value;
          const currentSel = (nav?.slide ?? sel) as any;
          if (currentLive) return;
          if ((currentSel as any)?.previewAssetId !== assetId) return;

          if (url) {
            const safe = this.sanitizer.bypassSecurityTrustUrl(url);
            this.cache.set(assetId, safe);
            this.previewUrl$.next(safe);
          }
        }
      )
    );
  }

  private async prefetch(assetId: string): Promise<string | undefined> {
    if (this.cache.has(assetId)) {
      // Cached as SafeUrl; return the raw url is not necessary here.
      // But for the caller that wants to await, we still resolve to undefined.
      return undefined;
    }
    const existing = this.inflight.get(assetId);
    if (existing) return existing;

    const p = this.assetStorage
      .getAssetObjectURL(assetId)
      .then((url) => url || undefined)
      .finally(() => {
        this.inflight.delete(assetId);
      });
    this.inflight.set(assetId, p);
    return p;
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.sub?.unsubscribe();
  }
}
