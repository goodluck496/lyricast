import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable, switchMap } from 'rxjs';
import { Presentation, PresentationDto } from '@lyri-cast/entities';

type PptxImportPayload = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

@Injectable({ providedIn: 'root' })
export class FreeSlideApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'svc://free-slide';

  getAll(): Observable<Presentation[]> {
    return this.http.get<Presentation[]>(this.baseUrl);
  }

  getById(id: string): Observable<Presentation> {
    return this.http.get<Presentation>(`${this.baseUrl}/${id}`);
  }

  create(data: PresentationDto): Observable<Presentation> {
    return this.http.post<Presentation>(`${this.baseUrl}/create`, data);
  }

  update(id: string, data: Partial<PresentationDto>): Observable<Presentation> {
    return this.http.put<Presentation>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  search(query: string): Observable<Presentation[]> {
    return this.http.get<Presentation[]>(`${this.baseUrl}/search`, { params: { search: query } });
  }

  getTransitionSettings(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}/transition-settings`);
  }

  setTransitionSettings(id: string, settings: any): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.baseUrl}/${id}/transition-settings`, settings);
  }

  importPptx(file: File): Observable<any[]> {
    return from(file.arrayBuffer()).pipe(
      switchMap((buffer) => {
        const payload: PptxImportPayload = {
          fileName: file.name,
          mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          dataBase64: this.arrayBufferToBase64(buffer),
        };

        return this.http.post<any[]>(`${this.baseUrl}/pptx/import`, payload);
      })
    );
  }

  exportPptx(presentationName: string, slides: any[]): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/pptx/export`, { presentationName, slides }, { responseType: 'blob' });
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks: string[] = [];

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      let binary = '';

      for (const byte of chunk) {
        binary += String.fromCharCode(byte);
      }

      chunks.push(binary);
    }

    return btoa(chunks.join(''));
  }
}
