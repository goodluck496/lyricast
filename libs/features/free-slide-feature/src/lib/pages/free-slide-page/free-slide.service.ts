import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, first, Subject } from 'rxjs';
import { Presentation, Slide } from '@lyri-cast/entities';
import { v4 as uuid } from 'uuid';
import { FreeSlideApiService } from '@lyri-cast/free-slide';

@Injectable()
export class FreeSlideService {
  private readonly api = inject(FreeSlideApiService);

  currentPresentation$ = new BehaviorSubject<Presentation>({
    id: '',
    title: '',
    slides: [],
    createdAt: 0,
    updatedAt: 0,
  });

  slidesMap = new Map<string, Slide>();
  slides$ = new BehaviorSubject<Slide[]>([]);

  // Событие для запроса сохранения текущего слайда
  requestSaveCurrentSlide$ = new Subject<void>();
  saveCompleted$ = new Subject<void>();
  liveSyncEnabled$ = new BehaviorSubject<boolean>(true);

  constructor() {
    // this._addFirstSlide();
  }

  setPresentation(presentation: Presentation) {
    this.currentPresentation$.next(presentation);
    this.slides$.next(presentation.slides);
    if (!presentation.slides.length) {
      this.addFirstSlide();
    } else {
      this.slidesMap = new Map(
        presentation.slides.map((slide) => [slide.id, slide])
      );
    }
  }

  toggleLiveSync(enabled: boolean) {
    this.liveSyncEnabled$.next(enabled);
  }

  addSlide(slideData?: Partial<Slide>): Slide {
    const values = Array.from(this.slidesMap.values());

    const newSlide: Slide = {
      // First, apply all data from the copy
      ...(slideData || {}),
      // Then, forcefully override the ID and index to ensure it's a new, unique slide
      id: uuid(),
      name: slideData ? slideData?.name ?? 'Дубль' : 'Новый слайд',
      content: slideData?.content ?? '',
      index: values.length,
      groupId: slideData?.groupId ?? 0,
      previewAssetId: slideData?.previewAssetId ?? '',
      // Set creation time to now, overriding the copied time
      createdAt: Date.now(),
    };

    this.slidesMap.set(newSlide.id, newSlide);

    this._updateSlides();

    return newSlide;
  }

  updateSlide(slide: Partial<Slide> & Pick<Slide, 'id'>) {
    const foundSlide = this.slidesMap.get(slide.id);
    if (!foundSlide) {
      return;
    }

    this.slidesMap.set(slide.id, { ...foundSlide, ...slide });
    this._updateSlides();
  }

  getSlideByIndex(index: number): Slide | undefined {
    return Array.from(this.slidesMap.values()).find((el) => el.index === index);
  }

  removeSlide(slideId: string) {
    this.slidesMap.delete(slideId);
    this._updateSlides();
  }

  addFirstSlide() {
    const firstSlide: Slide = {
      id: uuid(),
      index: 0,
      name: 'Название слайда',
      createdAt: Date.now(),
      content: '',
      previewAssetId: '',
      groupId: 0,
    };
    this.slidesMap.set(firstSlide.id, firstSlide);
    this._updateSlides();
  }

  private _updateSlides() {
    const slides = Array.from(this.slidesMap.values());
    this.slides$.next(slides);

    const presentation = this.currentPresentation$.value;

    this.api
      .update(presentation.id, {
        ...presentation,
        slides,
      })
      .pipe(first())
      .subscribe();
  }
}
