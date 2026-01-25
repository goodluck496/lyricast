import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { SongCastingPreviewComponent } from '../casting-preview/song-casting-preview.component';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import { selectCastingPaused } from '@lyri-cast/song-store';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { CastingService } from '../../services/casting.service';
import { Store } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { selectOpenedWindow, SidebarService } from '@lyri-cast/common-browser';
import { map } from 'rxjs';
import { SongSidebarData } from '../../types';
import { SvgIconComponent } from '@lyri-cast/svg-icons';
import {
  TourAnchorPrimeNgDirective,
  TourPrimeNgModule,
} from 'ngx-ui-tour-primeng';

@Component({
  selector: 'lyri-song-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    SongCastingPreviewComponent,
    NavigatorFeatureComponent,
    SvgIconComponent,
    TourAnchorPrimeNgDirective,
    TourPrimeNgModule,
  ],
  templateUrl: './song-sidebar.component.html',
  styleUrl: './song-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongSidebarComponent {
  private songPageSelectSrv = inject(SongPageSelectService);
  private readonly songsApiService = inject(SongsApiService);
  private readonly castingSrv = inject(CastingService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(Store);
  castingIsPaused$ = this.store.select(selectCastingPaused);
  openedCastingWindow$ = this.store
    .select(selectOpenedWindow)
    .pipe(map((e) => !!e));
  private readonly actions$ = inject(Actions);
  private readonly sidebarService =
    inject<SidebarService<SongSidebarData>>(SidebarService);

  onStartCasting(fromSelectedBlock = false): void {
    const payload =
      this.songPageSelectSrv.getStartCastingPayload(fromSelectedBlock);
    if (!payload) {
      return;
    }

    this.castingSrv.openCastingPageHandler(payload);
  }

  onPauseCasting(): void {
    this.castingSrv.pauseCasting();
  }

  onCloseCasting(): void {
    this.castingSrv.closeCasting();
  }

  onNavigateSlide(dir: 'prev' | 'next') {
    const navigatePayload = this.songPageSelectSrv.getNavigatePayload(dir);
    if (!navigatePayload) {
      console.log('Cancel navigate payload', dir);
      return;
    }
    this.castingSrv.navigateSlide(navigatePayload);
  }
}
