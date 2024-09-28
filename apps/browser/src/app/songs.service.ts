import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable()
export class SongsService {
  constructor(private http: HttpClient) { }
}
