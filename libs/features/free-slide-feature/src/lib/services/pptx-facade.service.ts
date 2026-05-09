import { Injectable, inject } from '@angular/core';
import { FreeSlideApiService } from '@lyri-cast/free-slide';
import { SerializedState } from '@lyri-cast/entities';

@Injectable({
  providedIn: 'root'
})
export class PptxFacadeService {
  private readonly apiService = inject(FreeSlideApiService);

  importPptx(file: File) {
    return this.apiService.importPptx(file);
  }

  exportPptx(presentationName: string, states: SerializedState[]) {
    return this.apiService.exportPptx(presentationName, states);
  }
}
