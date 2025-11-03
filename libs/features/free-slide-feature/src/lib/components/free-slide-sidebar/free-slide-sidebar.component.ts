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
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import { BibleState } from '@lyri-cast/bible-store';
import { Router } from '@angular/router';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { Store } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { map, take } from 'rxjs';
import {
  AppActions,
  selectOpenedWindow,
  SidebarService,
} from '@lyri-cast/common-browser';
import { AppWindowTypes } from '@lyri-cast/common-electron';

import { SvgIconComponent } from '@lyri-cast/svg-icons';
import { FreeSlideCastingPreviewComponent } from '../casting-preview/free-slide-casting-preview.component';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  selectFreeSlideCastingPaused,
  selectFreeSlideSelected,
} from '@lyri-cast/free-slide-store';
import { FreeSlideService } from '../../pages/free-slide-page/free-slide.service';
import { filterEmpty } from '@lyri-cast/common';

import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { StorageManagementComponent } from '../management/storage-management/storage-management.component';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { FormsModule } from '@angular/forms';
import { ToggleButtonChangeEvent } from 'primeng/togglebutton/togglebutton.interface';

@Component({
  selector: 'lyri-free-slide-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    NavigatorFeatureComponent,
    SvgIconComponent,
    FreeSlideCastingPreviewComponent,
    DynamicDialogModule,
    ToggleButtonModule,
    FormsModule,
  ],
  templateUrl: './free-slide-sidebar.component.html',
  styleUrl: './free-slide-sidebar.component.scss',
  providers: [DialogService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideSidebarComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);
  private readonly apiSrv = inject(BibleApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  private readonly actions$ = inject(Actions);
  private readonly sidebarService = inject<SidebarService<any>>(SidebarService);
  private readonly slideService = inject(FreeSlideService);
  private readonly dialogService = inject(DialogService);

  openedCastingWindow$ = this.store.select(selectOpenedWindow).pipe(
    map((e) => {
      console.log('openedCastingWindow$', e, !!e);
      return !!e;
    })
  );
  castingIsPaused$ = this.store.select(selectFreeSlideCastingPaused);
  liveSyncEnabled$ = this.slideService.liveSyncEnabled$.asObservable();

  onLiveSyncToggle(event: ToggleButtonChangeEvent) {
    const isEnabled = !!event.checked;
    this.slideService.toggleLiveSync(isEnabled);

    if (isEnabled) {
      this.slideService.requestSaveCurrentSlide$.next();
    }
  }

  openStorageManagement() {
    this.dialogService.open(StorageManagementComponent, {
      header: 'Asset Storage Management',
      width: '70vw',
      height: '70vh',
      dismissableMask: true,
    });
  }

  onStartCasting() {
    console.log('[Sidebar] Starting casting...');

    // Listen for the save to complete, then proceed with casting
    this.slideService.saveCompleted$.pipe(take(1)).subscribe(() => {
      console.log('[Sidebar] Save completed, proceeding with casting.');

      this.store
        .select(selectFreeSlideSelected)
        .pipe(filterEmpty(), take(1))
        .subscribe((slide) => {
          // Get the latest slides data from the service
          const currentSlides = this.slideService.slides$.value;

          this.store.dispatch(
            FreeSlideActions[FreeSlideActionsEnum.openCasting]({
              slideId: slide.id,
              slides: currentSlides,
              fromIndex: slide.index,
            })
          );
        });
    });

    // Request the current slide to be saved
    this.slideService.requestSaveCurrentSlide$.next();
  }

  onStopCasting() {
    console.log('onStopCasting called');
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.stopCasting]());
    // Закрываем окно кастинга
    this.store.dispatch(
      AppActions.closeWindow({
        windowType: AppWindowTypes.CASTING,
      })
    );
  }

  onPauseCasting() {
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.pauseCasting]());
  }
}
