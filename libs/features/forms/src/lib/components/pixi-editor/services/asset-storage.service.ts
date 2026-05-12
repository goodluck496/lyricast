import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AssetsApiService } from '@lyri-cast/shared-browser/data-access/assets';
import { firstValueFrom, map } from 'rxjs';

// This interface is kept for backward compatibility with consumers of this service.
export interface AssetRecord {
  id: string;
  mimeType: string;
  data: Blob;
  originalUrl?: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class AssetStorageService {
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly http = inject(HttpClient);

  /**
   * Saves an asset using the asset worker.
   * @param blob The data to save.
   * @param mimeType The MIME type of the blob.
   * @param originalUrl The original URL of the asset, used to derive a filename.
   * @returns A promise that resolves with the ID of the saved asset.
   */
  async saveAsset(
    blobOrFile: Blob | File,
    mimeType: string,
    originalUrl?: string,
    kind?: 'content' | 'preview'
  ): Promise<string> {
    let fileToUpload: File;

    if (blobOrFile instanceof File) {
      // If it's already a File (e.g., from clipboard), use it directly.
      // We create a new file just to ensure a consistent name if the original has none.
      const fileName = blobOrFile.name || `asset-${Date.now()}`;
      fileToUpload = new File([blobOrFile], fileName, { type: blobOrFile.type });
    } else {
      // It's a generic Blob (e.g., from an HTTP request), so create a new File.
      let filename = `asset-${Date.now()}`;
      if (originalUrl) {
        try {
          const url = new URL(originalUrl);
          const pathname = url.pathname;
          const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
          if (lastSegment) {
            filename = decodeURIComponent(lastSegment);
          }
        } catch (e) {
          filename = originalUrl.substring(originalUrl.lastIndexOf('/') + 1) || filename;
        }
      }
      fileToUpload = new File([blobOrFile], filename, { type: mimeType });
    }
    const asset$ = this.assetsApiService
      .uploadAssetBase64({
        originalName: fileToUpload.name,
        mimeType: fileToUpload.type || mimeType || 'application/octet-stream',
        dataBase64: await this.blobToBase64(fileToUpload),
        kind: kind,
      })
      .pipe(map((dto) => dto.id));
    return firstValueFrom(asset$);
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
  }

  /**
   * Retrieves the raw blob data for an asset.
   */
  async getAssetBlob(id: string): Promise<Blob | undefined> {
    const url = this.assetsApiService.getAssetUrl(id);
    try {
      const blob$ = this.http.get(url, { responseType: 'blob' });
      return await firstValueFrom(blob$);
    } catch (error) {
      console.error(`[AssetStorageService] Failed to fetch asset blob for ID: ${id}`, error);
      return undefined;
    }
  }

  /**
   * Returns a persistent URL to the asset.
   */
  async getAssetObjectURL(id: string): Promise<string | undefined> {
    // The new service provides a direct, persistent URL.
    // We wrap it in a resolved promise to maintain API compatibility.
    const url = this.assetsApiService.getAssetUrl(id);
    return Promise.resolve(url);
  }

  /**
   * This method is deprecated and will be removed.
   * It returns an empty array and logs a warning.
   */
  async getAllAssets(): Promise<AssetRecord[]> {
    console.warn('[AssetStorageService] getAllAssets() is deprecated and returns an empty array. Please update consumer code to use AssetsApiService directly.');
    // Returning an empty array to avoid breaking existing code that might call this.
    return Promise.resolve([]);
  }

  /**
   * Deletes an asset.
   */
  async deleteAsset(id: string): Promise<void> {
    const delete$ = this.assetsApiService.deleteAsset(id);
    return firstValueFrom(delete$);
  }

  /**
   * This method is deprecated. The backend does not support clearing all assets.
   */
  async clearAllAssets(): Promise<void> {
    console.warn('[AssetStorageService] clearAllAssets() is deprecated and does nothing.');
    return Promise.resolve();
  }

  /**
   * This method is no longer needed as the new URLs are not temporary.
   */
  revokeAssetObjectURL(id: string): void {
    // No-op for compatibility.
  }

  /**
   * Imports an asset from a given URL, saves it locally, and returns the new asset ID.
   * @param url The URL of the asset to import.
   * @returns A promise that resolves with the new asset ID.
   */
  async importAssetFromUrl(url: string): Promise<string> {
    try {
      if (url.startsWith('data:')) {
        const dataAsset = this.dataUrlToBlob(url);
        return await this.saveAsset(
          dataAsset.blob,
          dataAsset.mimeType,
          this.createDataUrlFileName(dataAsset.mimeType),
          'content'
        );
      }

      const response = await firstValueFrom(
        this.http.get(url, { observe: 'response', responseType: 'blob' })
      );
      const blob = response.body;
      const mimeType = response.headers.get('Content-Type');

      if (!blob) {
        throw new Error('Failed to fetch blob from URL');
      }

      return await this.saveAsset(blob, mimeType || 'application/octet-stream', url, 'content');
    } catch (error) {
      console.error(`[AssetStorageService] Failed to import asset from URL: ${url}`, error);
      throw error; // Re-throw to allow the caller to handle it
    }
  }

  private dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl);
    if (!match) {
      throw new Error('Invalid data URL');
    }

    const mimeType = match[1] || 'application/octet-stream';
    const isBase64 = match[2] === ';base64';
    const data = match[3] || '';
    const binary = isBase64 ? atob(data) : decodeURIComponent(data);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return {
      blob: new Blob([bytes], { type: mimeType }),
      mimeType,
    };
  }

  private createDataUrlFileName(mimeType: string): string {
    const extensionByMimeType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };
    const extension = extensionByMimeType[mimeType.toLowerCase()] || 'bin';

    return `asset-${Date.now()}.${extension}`;
  }

  /**
   * Ensures an asset is stored locally.
   * If the source is a URL, it imports it.
   * If the source is already a local asset ID, it returns it directly.
   * @param source The asset ID or URL.
   * @returns A promise that resolves with the local asset ID.
   */
  public async ensureAssetIsLocal(source: string): Promise<string> {
    if (source.startsWith('http') || source.startsWith('data:')) {
      return this.importAssetFromUrl(source);
    }
    // Otherwise, assume it's already a local asset ID
    return Promise.resolve(source);
  }

  // The following methods from the original service are removed as they are no longer relevant:
  // - openDb
  // - getObjectStore
  // - calculateHash
  // - getAssetRecord
}
