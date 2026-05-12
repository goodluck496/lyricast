export interface Asset {
  id: string; // SHA-256 hash of the file
  originalName: string;
  filePath: string;
  mimeType: string;
  size: number; // in bytes
  kind: 'content' | 'preview';
  createdAt: number; // timestamp
}
