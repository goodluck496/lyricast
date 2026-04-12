import { ISong } from './song.types';

/**
 * Информация о базе песен в словаре (Lyricast Dictionary API)
 */
export interface SongDatabaseInfoDto {
  /** Имя файла БД, например 'songs_ru.sqlite' */
  db: string;
  /** Ключ сборника (song_books.file_key) */
  fileKey?: string;
  title?: string;
  description?: string;
  language?: string;
  /** Размер файла БД в байтах */
  sizeBytes?: number;
  /** Общее количество песен во всех сборниках этой БД */
  songCount?: number;
  /** Обложка в формате data:URL */
  coverImage?: string;
  /** Версия справочника */
  version?: number;
  /** Email пользователя, который последним обновил справочник */
  updatedBy?: string;
  /** Дата последнего обновления справочника (ISO) */
  updatedAt?: string;
  /** Локальная версия справочника */
  localVersion?: number;
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
