import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FreeSlide } from '@lyri-cast/entities';
import { v4 as uuid } from 'uuid';

@Injectable()
export class FreeSlideService {
  slidesMap = new Map<string, FreeSlide>();
  slides$ = new BehaviorSubject<FreeSlide[]>([]);

  constructor() {
    this._addFirstSlide();
  }

  addSlide() {
    const values = Array.from(this.slidesMap.values());

    const newSlide: FreeSlide = {
      id: uuid(),
      index: values.length,
      name: 'Название слайда',
      htmlString: '',
      createdAtTime: Date.now(),
      groupId: '',
    };

    this.slidesMap.set(newSlide.id, newSlide);

    this._updateSlides();

    return newSlide;
  }

  updateSlide(slide: Pick<FreeSlide, 'id' | 'index' | 'name' | 'htmlString'>) {
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
    const firstSlide = {
      id: uuid(),
      index: 0,
      name: 'Название слайда',
      createdAtTime: Date.now(),
      htmlString: '',
      groupId: '',
    };
    this.slidesMap.set(firstSlide.id, firstSlide);
    this._updateSlides();
  }

  private _updateSlides() {
    this.slides$.next(Array.from(this.slidesMap.values()));
  }
}
