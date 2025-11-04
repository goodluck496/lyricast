import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';

interface AssetRecord {
  id: string;
  mimeType: string;
  data: Blob;
  originalUrl?: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class AssetStorageService {
  private dbName = 'PixiEditorAssets';
  private storeName = 'assets';
  private db: IDBDatabase | null = null;
  private objectURLMap = new Map<string, string>(); // assetId -> objectURL

  constructor() {
    this.openDb();
  }

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) {
      console.log('[AssetStorageService] Using existing IndexedDB connection.');
      return this.db;
    }

    return new Promise((resolve, reject) => {
      console.log('[AssetStorageService] Opening IndexedDB...');
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore(this.storeName, { keyPath: 'id' });
        console.log(
          '[AssetStorageService] IndexedDB upgrade needed, object store created.'
        );
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('[AssetStorageService] IndexedDB opened successfully.');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error(
          '[AssetStorageService] IndexedDB error:',
          (event.target as IDBOpenDBRequest).error
        );
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  private async getObjectStore(
    mode: IDBTransactionMode
  ): Promise<IDBObjectStore> {
    const db = await this.openDb();
    const transaction = db.transaction(this.storeName, mode);
    return transaction.objectStore(this.storeName);
  }

  private async calculateHash(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async saveAsset(
    blob: Blob,
    mimeType: string,
    originalUrl?: string
  ): Promise<string> {
    const id = await this.calculateHash(blob);

    // Check if asset with this hash already exists
    const existingRecord = await this.getAssetRecord(id);
    if (existingRecord) {
      console.log(`[AssetStorageService] Asset with hash ${id} already exists. Reusing.`);
      return id; // Return existing ID
    }

    // If not, save the new asset
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const record: AssetRecord = {
        id, // Use hash as ID
        mimeType,
        data: blob,
        originalUrl,
        timestamp: Date.now(),
      };

      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(record);

      request.onsuccess = () => {
        console.log(`[AssetStorageService] Asset saved with hash ID: ${id}`);
        resolve(id);
      };
      request.onerror = (event) => {
        console.error(
          '[AssetStorageService] Error saving asset:',
          (event.target as IDBRequest).error
        );
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async getAssetRecord(id: string): Promise<AssetRecord | undefined> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result as AssetRecord);
      };
      request.onerror = (event) => {
        console.error(
          '[AssetStorageService] Error getting asset record:',
          (event.target as IDBRequest).error
        );
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async getAssetBlob(id: string): Promise<Blob | undefined> {
    const record = await this.getAssetRecord(id);
    if (record) {
      console.log(
        `[AssetStorageService] Asset blob retrieved for ID: ${id}, mimeType: ${record.mimeType}`
      );
      return record.data;
    }

    console.warn(`[AssetStorageService] No asset found for ID: ${id}`);
    return undefined;
  }

  async getAssetObjectURL(id: string): Promise<string | undefined> {
    if (this.objectURLMap.has(id)) {
      console.log(
        `[AssetStorageService] Returning cached object URL for ID: ${id}`
      );
      return this.objectURLMap.get(id);
    }
    const blob = await this.getAssetBlob(id);
    if (blob) {
      const objectURL = URL.createObjectURL(blob);
      this.objectURLMap.set(id, objectURL);
      return objectURL;
    }
    console.warn(
      `[AssetStorageService] Could not generate object URL, blob not found for ID: ${id}`
    );
    return undefined;
  }

  revokeAssetObjectURL(id: string): void {
    const objectURL = this.objectURLMap.get(id);
    if (objectURL) {
      URL.revokeObjectURL(objectURL);
      this.objectURLMap.delete(id);
      console.log(`[AssetStorageService] Revoked object URL for ID: ${id}`);
    }
  }

  async deleteAsset(id: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      this.revokeAssetObjectURL(id); // Revoke object URL before deleting
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`[AssetStorageService] Asset deleted for ID: ${id}`);
        resolve();
      };
      request.onerror = (event) => {
        console.error(
          '[AssetStorageService] Error deleting asset:',
          (event.target as IDBRequest).error
        );
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async getAllAssets(): Promise<AssetRecord[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result.sort((a: AssetRecord,b: AssetRecord) => b.timestamp - a.timestamp) as AssetRecord[]);
      };

      request.onerror = () => {
        console.error(
          '[AssetStorageService] Error getting all assets:',
          request.error
        );
        reject(request.error);
      };
    });
  }

  async clearAllAssets(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      // Revoke all active object URLs
      this.objectURLMap.forEach((_, id) => this.revokeAssetObjectURL(id));
      this.objectURLMap.clear();

      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[AssetStorageService] All assets cleared.');
        resolve();
      };
      request.onerror = (event) => {
        console.error(
          '[AssetStorageService] Error clearing all assets:',
          (event.target as IDBRequest).error
        );
        reject((event.target as IDBRequest).error);
      };
    });
  }
}
