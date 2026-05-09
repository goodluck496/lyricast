import { Injectable, inject } from '@angular/core';
import { FreeSlideApiService } from '@lyri-cast/free-slide';
import { FreeSlideService } from '../pages/free-slide-page/free-slide.service';
import { SerializedState } from '@lyri-cast/entities';
import { firstValueFrom, of, take, timeout, catchError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PptxFacadeService {
  private readonly apiService = inject(FreeSlideApiService);
  private readonly slideService = inject(FreeSlideService);

  importPptx(file: File) {
    return this.apiService.importPptx(file);
  }

  async exportPptx(presentationName: string) {
    const saveCompleted = firstValueFrom(
      this.slideService.saveCompleted$.pipe(
        take(1),
        timeout(3000),
        catchError(() => of(undefined))
      )
    );
    this.slideService.requestSaveCurrentSlide$.next();
    await saveCompleted;

    const slides = Array.from(this.slideService.slidesMap.values());
    const states = slides
      .sort((a, b) => a.index - b.index)
      .map(slide => JSON.parse(slide.content) as SerializedState);
    
    this.apiService.exportPptx(presentationName, states).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${presentationName}.pptx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Electron/Chromium can still be reading the object URL after click.
        setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      },
      error: (err) => {
        console.error('Failed to export PPTX', err);
      }
    });
  }
}
