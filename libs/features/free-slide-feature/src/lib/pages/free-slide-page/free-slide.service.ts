import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, first, Subject } from 'rxjs';
import { Presentation, Slide } from '@lyri-cast/entities';
import { v4 as uuid } from 'uuid';
import { FreeSlideApiService } from '@lyri-cast/free-slide';

@Injectable({ providedIn: 'root' })
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

  // Live preview for sidebar: updated immediately from editor snapshots (not from DB)
  livePreviewObjectUrl$ = new BehaviorSubject<string | null>(null);
  private lastPreviewObjectUrl: string | null = null;

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

  setLivePreviewObjectUrl(url: string | null) {
    if (this.lastPreviewObjectUrl && this.lastPreviewObjectUrl !== url) {
      try { URL.revokeObjectURL(this.lastPreviewObjectUrl); } catch {}
    }
    this.lastPreviewObjectUrl = url;
    this.livePreviewObjectUrl$.next(url);
  }

  clear() {
    this.currentPresentation$.next({
      id: '',
      title: '',
      slides: [],
      createdAt: 0,
      updatedAt: 0,
    });
    this.slidesMap.clear();
    this.slides$.next([]);
    this.setLivePreviewObjectUrl(null);
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

  reorderSlides(previousIndex: number, currentIndex: number) {
    const ordered = this._orderedSlides();
    if (previousIndex < 0 || previousIndex >= ordered.length) return;
    if (currentIndex < 0 || currentIndex >= ordered.length) currentIndex = ordered.length - 1;
    const [moved] = ordered.splice(previousIndex, 1);
    ordered.splice(currentIndex, 0, moved);
    this._reindexAndCommit(ordered);
  }

  copySlide(fromIndex: number, toIndex: number) {
    const ordered = this._orderedSlides();
    if (fromIndex < 0 || fromIndex >= ordered.length) return;
    const source = ordered[fromIndex];
    const copy: Slide = {
      ...source,
      id: uuid(),
      createdAt: Date.now(),
      name: this._nextCopyName(source.name),
    };
    const insertIndex = Math.min(Math.max(toIndex, 0), ordered.length);
    ordered.splice(insertIndex, 0, copy);
    this._reindexAndCommit(ordered);
  }

  updateSlide(
    slide: Partial<Slide> & Pick<Slide, 'id'>,
    options: { suppressUiUpdate?: boolean } = {}
  ) {
    const foundSlide = this.slidesMap.get(slide.id);
    if (!foundSlide) {
      return;
    }

    this.slidesMap.set(slide.id, { ...foundSlide, ...slide });
    this._updateSlides({ suppressUiUpdate: options.suppressUiUpdate });
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

  notifyUiUpdate() {
    this.slides$.next(Array.from(this.slidesMap.values()));
  }

  private _updateSlides(options: { suppressUiUpdate?: boolean } = {}) {
    const slides = Array.from(this.slidesMap.values());
    if (!options.suppressUiUpdate) {
      this.slides$.next(slides);
    }

    const presentation = this.currentPresentation$.value;

    this.api
      .update(presentation.id, {
        ...presentation,
        slides,
      })
      .pipe(first())
      .subscribe();
  }

  private _orderedSlides(): Slide[] {
    return Array.from(this.slidesMap.values()).sort((a, b) => a.index - b.index);
  }

  private _reindexAndCommit(ordered: Slide[]) {
    const updated = ordered.map((s, i) => ({ ...s, index: i }));
    this.slidesMap = new Map(updated.map((s) => [s.id, s]));
    this._updateSlides();
  }

  private _nextCopyName(baseName: string): string {
    const strip = baseName.replace(/\s*\(\s*copy(\s\d+)?\s*\)$/i, '');
    const names = new Set(Array.from(this.slidesMap.values()).map((s) => s.name));
    let name = `${strip} (copy)`;
    let n = 2;
    while (names.has(name)) {
      name = `${strip} (copy ${n})`;
      n++;
    }
    return name;
  }
}
