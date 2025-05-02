import { ISong, ISongBookName, LyricForCasting } from '@lyri-cast/entities';
import { Pages } from '@lyri-cast/common-browser';
import { SONG_ACTIONS } from './song.actions';
import { APP_COMMON_ACTIONS } from '@lyri-cast/common-electron';

// export type SongActionEvents = (typeof SONG_ACTIONS)[keyof typeof SONG_ACTIONS];

export type SongPayloadsMap = {
  [APP_COMMON_ACTIONS.openPage]: { path: Pages[] };
  [SONG_ACTIONS.openedPage]: { page: Pages };
  [SONG_ACTIONS.selectBook]: ISongBookName;
  [SONG_ACTIONS.selectSong]: {
    song: ISong;
    bookName: ISongBookName;
  };
  [SONG_ACTIONS.openCasting]: {
    song: ISong;
    currentLyric: LyricForCasting;
    lyrics: LyricForCasting[];
    fromIndex?: number;
  };
  [SONG_ACTIONS.startCasting]: {
    song: ISong;
    currentLyric: LyricForCasting;
    lyrics: LyricForCasting[];
    fromIndex?: number;
  };
  [SONG_ACTIONS.pauseCasting]: void;
  [SONG_ACTIONS.pauseCasting]: void;
  [SONG_ACTIONS.slideNavigate]: {
    currentLyric: LyricForCasting;
    /**
     * Перемещает слайды по порядку
     */
    direction?: 'next' | 'prev';
    /**
     * Выбирает слайд по индексу
     */
    index?: number;
  };
  [SONG_ACTIONS.castingStarted]: void;
};
