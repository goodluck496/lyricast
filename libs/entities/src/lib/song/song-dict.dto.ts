import { ISong } from './song.types';

/**
 * Информация о базе песен в словаре (Lyricast Dictionary API)
 */
export interface SongDatabaseInfoDto {
  /** Имя файла БД, например 'songs_ru.sqlite' */
  db: string;
  title?: string;
  description?: string;
  language?: string;
  /** Размер файла БД в байтах */
  sizeBytes?: number;
  /** Общее количество песен во всех сборниках этой БД */
  songCount?: number;
  /** Обложка в формате data:URL */
  coverImage?: string;
}

/**
 * Результат поиска песен в словаре.
 */
export interface SongSearchResultDto {
  items: ISong[];
  totalCount: number;
  page: number;
  pageSize: number;
}
