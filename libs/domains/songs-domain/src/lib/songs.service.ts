import { Injectable } from '@nestjs/common';
import path from 'path';
import fs from 'fs';
import {
  IShortSong,
  ISong,
  ISongBook,
  ISongBookName,
  ISongForSearch,
  Lyric,
  LyricTypeEnum,
} from '@lyri-cast/entities';

@Injectable()
export class SongsService {
  fileNameSuffix = '.songs.json';

  assetsPath = path.resolve(__dirname, 'assets', 'complete-jsons');
  // assetsPath = path.resolve(__dirname, 'assets', 'complete-jsons');

  bookCache: Record<string, ISongBook> = {};
  songCache: Record<string, ISong> = {};

  isReady = false;

  constructor() {
    this.assetsPath = path.resolve(
      process.env?.['assetsPath'] ?? '',
      'complete-jsons',
      'songs'
    );
  }

  readBookNames(): ISongBookName[] {
    try {
      const files = fs.readdirSync(this.assetsPath);
      const bookFiles = files.filter((file) =>
        file.includes(this.fileNameSuffix)
      );

      const names: ISongBookName[] = [];

      for (const bookName of bookFiles) {
        const preparedBookName = bookName.replace(this.fileNameSuffix, '');
        const book = this.readBook(preparedBookName);
        if (!book || book.header.disabled) {
          continue;
        }
        names.push({
          fileKey: preparedBookName,
          humanName: book.header.title,
        });
      }

      return names.sort((a, b) => {
        return a.humanName.toLowerCase().includes('песнь') ? -1 : 1;
      });
    } catch (error) {
      console.log('ERROR', error);
      return [];
    }
  }

  readBook(name: string): ISongBook | null {
    if (name in this.bookCache) {
      return this.bookCache[name];
    }

    try {
      const filePath = path.resolve(
        this.assetsPath,
        `${name}${this.fileNameSuffix}`
      );

      const jsonBook = fs.readFileSync(filePath);
      const book = JSON.parse(jsonBook.toString());

      this.bookCache[name] = book;

      return book;
    } catch (error) {
      console.log('ERROR', error);
      return null;
    }
  }

  getBookSongNames(bookName: string): IShortSong[] {
    const book = this.readBook(bookName);
    if (!book) {
      return [];
    }

    return book.songs.map(({ title, number }) => ({
      title,
      number,
      bookName: this.convertBookToShortBook(book),
    }));
  }

  readSong(
    bookName: string,
    songId: number,
    chorusAfterCouplet: boolean
  ): ISong | undefined {
    const book = this.readBook(bookName);
    if (!book) {
      return;
    }

    const keyInCache = `${book.header.bookKey}__${songId}`;

    if (keyInCache in this.songCache) {
      return this.songCache[keyInCache];
    }

    const foundSong = book.songs.find((item) => item.number === songId);
    if (!foundSong) {
      return;
    }

    function updateSong(song: ISong): ISong {
      const cloneSong: ISong = JSON.parse(JSON.stringify(song));

      if (!chorusAfterCouplet) {
        return {
          ...cloneSong,
          lyrics: clearChorus(cloneSong.lyrics),
        };
      }

      // удаляет дублирующиеся куплеты
      function clearChorus(lyrics: Lyric[]) {
        const newLyric: Lyric[] = [];

        lyrics.forEach((lyric) => {
          const foundChorus = newLyric.find(
            (el) => el.type === LyricTypeEnum.CHORUS
          );
          if (foundChorus && lyric.type === LyricTypeEnum.CHORUS) {
            return;
          }
          newLyric.push(lyric);
        });

        return newLyric;
      }

      // добавляет куплеты после припевов
      function insertChorus(lyrics: Lyric[]) {
        const result: Lyric[] = [];
        const chorus = lyrics.find(
          (item) => item.type === LyricTypeEnum.CHORUS
        );
        if (!chorus) return lyrics;

        for (let i = 0; i < lyrics.length; i++) {
          const lyric = lyrics[i];
          const nextLyricIsChorus =
            lyrics[i + 1]?.type === LyricTypeEnum.CHORUS;

          result.push(lyric);

          if (lyric.type === LyricTypeEnum.COUPLET && !nextLyricIsChorus) {
            result.push({
              ...chorus,
              uniqId: lyric.uniqId + (Math.random() * 1000).toFixed(0),
            });
          }
        }

        return result;
      }

      cloneSong.lyrics = insertChorus(song.lyrics);

      return cloneSong;
    }

    const updatedSong = updateSong(foundSong);

    this.songCache[keyInCache] = updatedSong;

    return updatedSong;
  }

  findSongByText(bookName: string, text: string): ISong[] {
    const book = this.readBook(bookName);
    if (!book) {
      return [];
    }

    const preparedText = text.trim().toLowerCase();

    return book.songs.filter(
      (item) =>
        String(item.number).includes(preparedText) ||
        item.title.toLowerCase().includes(preparedText) ||
        !!item.lyrics.find((lyric) =>
          lyric.lines.find((el) => {
            return el.trim().toLowerCase().includes(preparedText);
          })
        )
    );
  }

  convertToShortSong(song: ISong): IShortSong {
    return {
      number: song.number,
      title: song.title,
      bookName: song.bookName,
    };
  }

  convertToSearchSong(song: ISong, query: string): ISongForSearch {
    const inlineContent = song.lyrics.reduce((acc, curr) => {
      if (curr.lines.toString().toLowerCase().includes(query)) {
        acc += curr.lines.join(' ');
      }
      return acc;
    }, '');

    return {
      title: song.title,
      number: song.number,
      bookName: song.bookName,
      inlineContent,
    };
  }

  convertBookToShortBook(book: ISongBook): ISongBookName {
    return {
      humanName: book.header.title,
      fileKey: book.header.bookKey,
    };
  }
}
