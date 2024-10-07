import { Injectable } from '@nestjs/common';
import path from 'path';
import fs from 'fs';
import {
  IShortSong,
  ISong,
  ISongBook,
  ISongBookName,
} from '@lyri-cast/entities';

@Injectable()
export class SongsService {
  fileNameSuffix = '.songs.json';

  assetsPath = path.resolve(__dirname, 'assets', 'complete-jsons');

  bookCache: Record<string, ISongBook> = {};
  songCache: Record<string, ISong> = {};

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
        names.push({
          fileKey: preparedBookName,
          humanName: book.header.title,
        });
      }

      return names;
    } catch (error) {
      console.log('ERROR', error);
    }
  }

  readBook(name: string): ISongBook {
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
      throw new Error(error.message);
    }
  }

  getBookSongNames(bookName: string): IShortSong[] {
    const book = this.readBook(bookName);

    return book.songs.map(({ title, number }) => ({ title, number }));
  }

  readSong(bookName: string, songId: number): ISong | undefined {
    const book = this.readBook(bookName);
    const keyInCache = `${book}__${songId}`;

    if (keyInCache in this.songCache) {
      return this.songCache[keyInCache];
    }

    const foundSong = book.songs.find((item) => item.number === songId);
    if (!foundSong) {
      return;
    }

    this.songCache[keyInCache] = foundSong;

    return foundSong;
  }

  findSongByText(bookName: string, text: string, ): ISong[] {
    const book = this.readBook(bookName);
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
      title: song.title
    }
  }
}
