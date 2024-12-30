export enum LyricTypeEnum {
  COUPLET = 'COUPLET',
  CHORUS = 'CHORUS',
}

export type LyricLine = {
  /**
   * Номер строки в куплете, здесь может быть как индекс в массиве,
   * так и диапазон индексов, типо 0-4 или 0-2
   */
  rangeIndex: string;
  index: number;
  /**
   * Индекс элемента среди всей песни
   * Например:
   *  если песни из 3 куплетов, то LyricLine будет с индексами 0, 1, 2
   *  если куплеты песни разделены на 2 части, то индексов будет в 2 раза больше 0, 1...5 соответственно
   */
  globalSongIndex: number;
  text: string;
}

export type Lyric = {
  songId: string;
  uniqId: string;
  sectionTitle: string;
  type: LyricTypeEnum;
  splitLinesCount: number;
  lines: string[];
}

export type LyricForCasting = Omit<Lyric, 'lines'> & {
  lines: LyricLine[];
}

export type LyricSelectedForCasting = LyricLine & {
  lyric: LyricForCasting;
}


export interface SelectedLyricChunk extends Lyric {
  lyric: Lyric;
  blockIndex: number;
}

export interface ISong {
  number: number;
  title: string;
  key: string;
  /**
   * Тональность
   */
  keySignature: string;
  author: string;
  /**
   * Мета информация, доп.автор и т.п.
   */
  meta: string[];
  /**
   * Текст песни
   */
  lyrics: Lyric[];

  bookName: ISongBookName;
}

export type IShortSong = Pick<ISong, 'number' | 'title'> & {
  bookName: ISongBookName;
};

export interface ISongBookHeader {
  number: string;
  title: string;
  author: string;
  updatedAt: string;
  bookKey: string;
}

export interface ISongBook {
  header: ISongBookHeader;
  songs: ISong[];
}

export interface ISongBookName {
  fileKey: string;
  humanName: string;
}
