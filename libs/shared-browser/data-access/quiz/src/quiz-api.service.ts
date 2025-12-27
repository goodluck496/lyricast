import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { QuizSummaryDto, SaveQuizPayloadDto } from '@lyri-cast/entities';

@Injectable({ providedIn: 'root' })
export class QuizApiService {
  //нужно переделать токен, чтобы была фабрика которая возвращает url зависимо от модуля
  // можно сделать на сигналах
  private readonly baseUrl = 'svc://quiz'; //inject(BASE_API_TOKEN);

  private readonly http = inject(HttpClient);

  getQuizList(): Observable<QuizSummaryDto[]> {
    return this.http.get<QuizSummaryDto[]>(`${this.baseUrl}/list`);
  }

  getQuiz(id: string): Observable<SaveQuizPayloadDto> {
    return this.http.get<SaveQuizPayloadDto>(`${this.baseUrl}/${id}`);
  }

  saveQuiz(payload: SaveQuizPayloadDto): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(this.baseUrl, payload);
  }

  deleteQuiz(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
