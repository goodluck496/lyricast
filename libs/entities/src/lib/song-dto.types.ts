import { ISongBookName, ISongForSearch } from './song.types';

export type SongsSearchDto = {
  search: string;
  bookName: ISongBookName;
  songs: ISongForSearch[];
};
