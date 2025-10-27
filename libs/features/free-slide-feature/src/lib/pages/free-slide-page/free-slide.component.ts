import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { Store } from '@ngrx/store';
import { FreeSlide } from '@lyri-cast/entities';
import { Actions } from '@ngrx/effects';
import { FormsModule } from '@angular/forms';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { DropdownModule } from 'primeng/dropdown';
import { FreeSlideService } from './free-slide.service';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { debounceTime, first, Subject, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgScrollbar } from 'ngx-scrollbar';
import { PreviewSlideComponent } from '../../components/preview-slide/preview-slide.component';
import { FreeSlideSidebarComponent } from '../../components/free-slide-sidebar/free-slide-sidebar.component';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  selectFreeSlideCastingStarted,
} from '@lyri-cast/free-slide-store';
import { PixiSlideEditorV2Component } from '@lyri-cast/form';

@Component({
  selector: 'lyri-free-slide',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    FormsModule,
    PageContainerComponent,
    DropdownModule,
    CardModule,
    InputTextModule,
    NgScrollbar,
    PreviewSlideComponent,
    FreeSlideSidebarComponent,
    PixiSlideEditorV2Component,
  ],
  templateUrl: './free-slide.component.html',
  styleUrl: './free-slide.component.scss',
  providers: [FreeSlideService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideComponent implements AfterViewInit {
  cdr = inject(ChangeDetectorRef);
  store = inject(Store);
  actions$ = inject(Actions);
  slideService = inject(FreeSlideService);
  destroyRef = inject(DestroyRef);

  @ViewChild(PixiSlideEditorV2Component) pixiEditor!: PixiSlideEditorV2Component;

  currentSlideId = '';
  currentSlideIndex = 1;
  currentSlideName = '';

  slides$ = this.slideService.slides$.asObservable();

  // Автосохранение с debounce при изменениях в редакторе
  private autoSave$ = new Subject<void>();

  onAddNewSlide() {
    const newSlide = this.slideService.addSlide();
    this.onSelectSlide(newSlide);
  }

  onSelectSlide(slide: FreeSlide) {
    // Автосохранение текущего слайда перед переключением
    if (this.currentSlideId && this.pixiEditor) {
      this.onSaveSlide();
    }

    this.currentSlideName = slide.name;
    this.currentSlideId = slide.id;
    this.currentSlideIndex = slide.index;

    if (this.pixiEditor) {
      if (slide.htmlString) {
        try {
          const slideData = JSON.parse(slide.htmlString);
          this.pixiEditor.deserializeState(slideData);
        } catch (e) {
          console.error('Error parsing slide data, clearing editor', e);
          this.pixiEditor.clearAllNodes();
        }
      } else {
        this.pixiEditor.clearAllNodes();
      }
    }

    this.store.dispatch(
      FreeSlideActions[FreeSlideActionsEnum.selectSlide](slide)
    );

    this.store
      .select(selectFreeSlideCastingStarted)
      .pipe(take(1))
      .subscribe((started) => {
        if (!started) {
          return;
        }
        this.store.dispatch(
          FreeSlideActions[FreeSlideActionsEnum.slideNavigate]({
            slide: slide,
            index: slide.index,
          })
        );
      });
  }

  onSaveSlide() {
    if (!this.pixiEditor) {
      console.warn('[FreeSlide] Cannot save: pixiEditor is not ready');
      return;
    }
    const editorState = this.pixiEditor.serializeState();
    const htmlString = JSON.stringify(editorState);

    console.log('[FreeSlide] Saving slide:', {
      id: this.currentSlideId,
      name: this.currentSlideName,
      index: this.currentSlideIndex,
      nodesCount: editorState.nodes.length,
      htmlStringLength: htmlString.length,
    });
    console.log('[FreeSlide] Serialized nodes:', editorState.nodes);

    this.slideService.updateSlide({
      id: this.currentSlideId,
      name: this.currentSlideName,
      index: this.currentSlideIndex,
      htmlString: htmlString,
    });
  }

  onDeleteSelected() {
    const nextSlide = this.slideService.getSlideByIndex(
      this.currentSlideIndex + 1
    );
    const prevSlide = this.slideService.getSlideByIndex(
      this.currentSlideIndex - 1
    );

    this.slideService.removeSlide(this.currentSlideId);

    if (nextSlide) {
      this.onSelectSlide(nextSlide);
    } else if (prevSlide) {
      this.onSelectSlide(prevSlide);
    } else {
      const list = Array.from(this.slideService.slidesMap.values());
      this.onSelectSlide(list[list.length - 1]);
    }
  }

  onResetSlide() {
    this.onSaveSlide();
  }

  /**
   * Сохраняет текущий слайд перед трансляцией.
   * Этот метод вызывается из сайдбара перед началом кастинга.
   */
  saveCurrentSlide() {
    if (this.pixiEditor && this.currentSlideId) {
      this.onSaveSlide();
    }
  }

  ngAfterViewInit() {
    // Сброс состояния кастинга при инициализации free-slide фичи
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.stopCasting]());

    // Подписка на запросы сохранения текущего слайда (например, перед трансляцией)
    this.slideService.requestSaveCurrentSlide$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.onSaveSlide();
      });

    // Автосохранение с задержкой 3 секунды после изменений
    this.autoSave$
      .pipe(
        debounceTime(3000),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.onSaveSlide();
      });

    // Подписка на изменения в редакторе (команды)
    // Запускаем автосохранение при любых изменениях
    setTimeout(() => {
      if (this.pixiEditor?.bus) {
        this.pixiEditor.bus.commands$
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.autoSave$.next();
          });
      }
    }, 200);

    // Даём время на инициализацию PixiJS редактора перед загрузкой первого слайда
    this.slides$.pipe(first()).subscribe((slides) => {
      const firstSlide = slides[0];
      if (firstSlide) {
        // Небольшая задержка для завершения инициализации PixiJS
        setTimeout(() => {
          this.onSelectSlide(firstSlide);
        }, 150);
      }
    });
  }

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
  protected readonly Pages = Pages;
}
