export enum LyricTypeEnum {
  COUPLET = 'COUPLET',
  CHORUS = 'CHORUS',
}

export interface ILyric {
  uniqId: string;
  sectionTitle: string;
  type: LyricTypeEnum;
  lines: string[];
}

export interface SelectedLyricChunk extends ILyric {
  lyric: ILyric
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
  lyrics: ILyric[];
}

export type IShortSong = Pick<ISong, 'number' | 'title'>

export interface ISongBookHeader {
  number: string;
  title: string;
  author: string;
  updatedAt: string;
}

export interface ISongBook {
  header: ISongBookHeader;
  songs: ISong[];
}

export interface ISongBookName {
  fileKey: string;
  humanName: string;
}
