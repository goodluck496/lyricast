/**
 * Типы экспорта SongBook, совместимые с openapi SongBookExport.
 */
export interface SongBookExport {
  header: SongBookExportHeader;
  meta: Record<string, string>;
  songs: SongBookExportSong[];
}

export interface SongBookExportHeader {
  number: string;
  title: string;
  author: string;
  updatedAt: string;
  bookKey: string;
  disabled: boolean;
}

export interface SongBookExportBookName {
  fileKey: string;
  humanName: string;
}

export interface SongBookExportSong {
  number: number;
  title: string;
  key: string;
  keySignature: string;
  author: string;
  meta: string[];
  lyrics: SongBookExportLyric[];
  ref?: string | null;
  category?: string | null;
  bookName: SongBookExportBookName;
}

export interface SongBookExportLyric {
  songId: string;
  uniqId: string;
  sectionTitle: string;
  type: string;
  splitLinesCount: number;
  lines: SongBookExportLyricLine[];
}

export interface SongBookExportLyricLine {
  id: number;
  songId: string;
  rangeIndex?: string | null;
  index: number;
  globalSongIndex?: number | null;
  text: string;
}
