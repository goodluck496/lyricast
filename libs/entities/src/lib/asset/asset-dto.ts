import { Asset } from './asset.types';

// DTO for returning asset metadata
export type AssetDto = Omit<Asset, 'filePath'>;

// DTO for creating an asset (handled by multer, so not really used in controller signature)
// but good for service layer.
export type CreateAssetDto = {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};
