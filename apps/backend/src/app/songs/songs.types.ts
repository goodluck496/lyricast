export enum LyricTypeEnum {
  COUPLET = 'COUPLET',
  CHORUS = 'CHORUS',
}

export interface ILyric {
  sectionTitle: string;
  type: LyricTypeEnum;
  lines: string[];
}

export interface ISong {
  number: string;
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
