import { Injectable } from '@angular/core';

@Injectable()
export class AssetClipboardService {
  async copyImage(url: string, mimeType: string): Promise<void> {
    this.ensureClipboardSupport();

    const sourceBlob = await this.fetchAssetBlob(url, mimeType);
    const clipboardBlob = await this.toClipboardImageBlob(sourceBlob);

    await navigator.clipboard.write([
      new ClipboardItem({ [clipboardBlob.type]: clipboardBlob }),
    ]);
  }

  private ensureClipboardSupport(): void {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Image clipboard API is not available.');
    }
  }

  private async fetchAssetBlob(url: string, mimeType: string): Promise<Blob> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to load asset: ${response.status}`);
    }

    const blob = await response.blob();

    if (blob.type) {
      return blob;
    }

    return new Blob([await blob.arrayBuffer()], { type: mimeType });
  }

  private async toClipboardImageBlob(blob: Blob): Promise<Blob> {
    if (blob.type === 'image/png') {
      return blob;
    }

    return this.convertToPng(blob);
  }

  private async convertToPng(blob: Blob): Promise<Blob> {
    const image = await createImageBitmap(blob);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas 2D context is not available.');
      }

      context.drawImage(image, 0, 0);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob);
            return;
          }

          reject(new Error('Failed to convert image to PNG.'));
        }, 'image/png');
      });
    } finally {
      image.close();
    }
  }
}
