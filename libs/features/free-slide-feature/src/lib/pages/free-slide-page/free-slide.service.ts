import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { FreeSlide } from '@lyri-cast/entities';
import { v4 as uuid } from 'uuid';

@Injectable()
export class FreeSlideService {
  slidesMap = new Map<string, FreeSlide>();
  slides$ = new BehaviorSubject<FreeSlide[]>([]);

  // Событие для запроса сохранения текущего слайда
  requestSaveCurrentSlide$ = new Subject<void>();
  saveCompleted$ = new Subject<void>();

  constructor() {
    this._addFirstSlide();
  }

  addSlide(slideData?: Partial<FreeSlide>): FreeSlide {
    const values = Array.from(this.slidesMap.values());

    const newSlide: FreeSlide = {
      // First, apply all data from the copy
      ...(slideData || {}),
      // Then, forcefully override the ID and index to ensure it's a new, unique slide
      id: uuid(),
      name: slideData ? slideData?.name ?? 'Дубль' : 'Новый слайд',
      htmlString: slideData?.htmlString ?? '',
      index: values.length,
      // Set creation time to now, overriding the copied time
      createdAtTime: Date.now(),
    };

    this.slidesMap.set(newSlide.id, newSlide);

    this._updateSlides();

    return newSlide;
  }

  updateSlide(
    slide: Partial<FreeSlide> & Pick<FreeSlide, 'id'>
  ) {
    const foundSlide = this.slidesMap.get(slide.id);

    if (!foundSlide) {
      return;
    }

    this.slidesMap.set(slide.id, { ...foundSlide, ...slide });
    this._updateSlides();
  }

  getSlideByIndex(index: number): FreeSlide | undefined {
    return Array.from(this.slidesMap.values()).find((el) => el.index === index);
  }

  removeSlide(slideId: string) {
    this.slidesMap.delete(slideId);
    this._updateSlides();
  }

  private _addFirstSlide() {
    const firstSlide: FreeSlide = {
      id: uuid(),
      index: 0,
      name: 'Название слайда',
      createdAtTime: Date.now(),
      htmlString: '',
      previewAssetId: '',
      groupId: '',
    };
    this.slidesMap.set(firstSlide.id, firstSlide);
    this._updateSlides();
  }

  private _updateSlides() {
    this.slides$.next(Array.from(this.slidesMap.values()));
  }
}
