import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AssetDto } from '@lyri-cast/entities';
import { Observable } from 'rxjs';

export type UploadAssetBase64Payload = {
  originalName: string;
  mimeType: string;
  dataBase64: string;
  kind?: 'content' | 'preview';
};

@Injectable({ providedIn: 'root' })
export class AssetsApiService {
  private readonly http = inject(HttpClient);
  // The hostname 'asset-service' will be resolved by the custom svc protocol in the main process.
  private readonly baseUrl = 'svc://assets';

  getAssets(): Observable<AssetDto[]> {
    return this.http.get<AssetDto[]>(this.baseUrl);
  }

  getAssetUrl(id: string): string {
    return `${this.baseUrl}/${id}/file`;
  }

  uploadAsset(file: File, kind?: string): Observable<AssetDto> {
    const formData = new FormData();
    formData.append('file', file);
    if (kind) {
      formData.append('kind', kind);
    }
    // The full URL will be svc://asset-service/assets/upload
    return this.http.post<AssetDto>(`${this.baseUrl}/upload`, formData);
  }

  uploadAssetBase64(payload: UploadAssetBase64Payload): Observable<AssetDto> {
    return this.http.post<AssetDto>(`${this.baseUrl}/upload-base64`, payload);
  }

  deleteAsset(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
