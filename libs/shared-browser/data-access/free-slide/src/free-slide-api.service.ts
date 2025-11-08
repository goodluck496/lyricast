import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Presentation, PresentationDto } from '@lyri-cast/entities';

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
}
