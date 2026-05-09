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
