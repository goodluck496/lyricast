import { Injectable } from '@nestjs/common';
import path from 'path';
import fs from 'fs';
import { DateTime } from 'luxon';
import { FreeSlide } from '@lyri-cast/entities';

@Injectable()
export class FreeSlideService {
  isReady = false;
  private readonly assetsPath = path.resolve(
    __dirname,
    'assets',
    'complete-jsons',
    'free-slides'
  );
  private cache: Record<string, Map<string, FreeSlide>> = {};

  getAllSlides(): FreeSlide[] {
    const result: FreeSlide[] = [];

    for (const fileName of fs.readdirSync(this.assetsPath)) {
      const cacheId = fileName.replace('.json', '');

      if (!this.cache[cacheId]) {
        const data = this._readJsonFile(this._getFilePath(cacheId));
        this.cache[cacheId] = new Map(Object.entries(data));
      }

      result.push(...this.cache[cacheId].values());
    }

    return result;
  }

  getSlide(
    id: string
  ): FreeSlide | { empty: 'not-found-in-file' | 'error-parse' } {
    const cacheId = this._getCacheIdNow();
    const cache = this.cache[cacheId];

    if (cache?.has(id)) return cache.get(id)!;

    const filePath = this._getFilePath(cacheId);
    const data = this._readJsonFile(filePath);

    if (data[id]) {
      if (!this.cache[cacheId]) this.cache[cacheId] = new Map();
      this.cache[cacheId].set(id, data[id]);
      return data[id];
    }

    return { empty: 'not-found-in-file' };
  }

  saveSlide(slide: FreeSlide): boolean {
    // Найдём, где уже есть этот слайд (если есть)
    let foundCacheId: string | null = null;

    for (const [cacheId, slidesMap] of Object.entries(this.cache)) {
      if (slidesMap.has(slide.id)) {
        foundCacheId = cacheId;
        break;
      }
    }

    // Если не нашли в кеше, попытаемся найти в файлах
    if (!foundCacheId) {
      for (const fileName of fs.readdirSync(this.assetsPath)) {
        const cacheId = fileName.replace('.json', '');
        const filePath = this._getFilePath(cacheId);
        const data = this._readJsonFile(filePath);

        if (data[slide.id]) {
          foundCacheId = cacheId;
          this.cache[cacheId] = new Map(Object.entries(data)); // закешируем
          break;
        }
      }
    }

    // Если так и не нашли — сохраняем в текущий месяц
    const targetCacheId = foundCacheId || this._getCacheIdNow();
    const filePath = this._getFilePath(targetCacheId);
    const data = this._readJsonFile(filePath);

    data[slide.id] = slide;

    if (!this.cache[targetCacheId]) this.cache[targetCacheId] = new Map();
    this.cache[targetCacheId].set(slide.id, slide);

    return this._writeJsonFile(filePath, data);
  }

  searchSlides(query: string): FreeSlide[] {
    const lower = query.toLowerCase();
    return this.getAllSlides().filter((slide) =>
      Object.values(slide)
        .filter((v) => typeof v === 'string')
        .some((str) => str.toLowerCase().includes(lower))
    );
  }

  private _getCacheIdNow(): string {
    return DateTime.now().toFormat('yyyy-MM');
  }

  private _getFilePath(cacheId: string): string {
    return path.join(this.assetsPath, `${cacheId}.json`);
  }

  private _readJsonFile(filePath: string): Record<string, FreeSlide> {
    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '{}', 'utf8');
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error('Failed to read or parse JSON file:', filePath, err);
      return {};
    }
  }

  private _writeJsonFile(
    filePath: string,
    data: Record<string, FreeSlide>
  ): boolean {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Failed to write JSON file:', filePath, err);
      return false;
    }
  }
}
