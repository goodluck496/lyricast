import { Injectable } from '@nestjs/common';
import path from 'path';
import fs from 'fs';
import {
  ISong,
  ISongBook,
  ISongBookHeader,
  LyricTypeEnum,
} from '@lyri-cast/entities';

type LyriRawSong = {
  status: 'complete' | 'build';
  title: string;
  number: string;
  pageNumber: number;
  rawContent: string[];
};

@Injectable()
export class ParseSongsFromJsonService {
  sourceNameSuffix = '.songs.json';
  jsonNameSuffix = '.songs.json';
  assetsPath = path.resolve(__dirname, 'assets');
  assetsJsonsPath = path.resolve(__dirname, 'assets', 'complete-jsons');

  private parseSong(rawObj: LyriRawSong, bookKey: string): ISong {
    const songObj: ISong = {
      number: 0,
      title: rawObj.title,
      key: bookKey,
      keySignature: '',
      author: '',
      meta: [],
      lyrics: [],
      bookName: { fileKey: bookKey, humanName: '' },
    };

    const SECTION_REGEX = /^(\d+)\.\s*(.*)|^(Кайырма:|ѳmмѳ:|Аягы)\s*(.*)/;
    const SECTION_TYPES: Record<string, LyricTypeEnum> = {
      'Кайырма:': LyricTypeEnum.CHORUS,
      'ѳmмѳ:': LyricTypeEnum.PUBLIC,
      'Аягы:': LyricTypeEnum.END,
    };
    const TITLE_REGEX = /^(\d+)\s*(?:\(([^)]+)\))?\s*(?:№(\d+(?:\(\d+\))?))?/;

    const titleMatch = rawObj.title.match(TITLE_REGEX);
    const number = titleMatch ? Number(titleMatch[1]) : Number(rawObj.number);
    const category = titleMatch?.[2] || "";
    const reference = titleMatch?.[3] || "";

    const lyrics = rawObj.rawContent.reduce<ISong["lyrics"]>((acc, line) => {
      const match = line.match(SECTION_REGEX);
      if (match) {
        const isCouplet = !!match[1];
        acc.push({
          songId: rawObj.number,
          uniqId: `${rawObj.number}-${acc.length + 1}`,
          sectionTitle: isCouplet ? `Куплет №${match[1]}` : match[3],
          type: isCouplet ? LyricTypeEnum.COUPLET : SECTION_TYPES[match[3]],
          splitLinesCount: 0,
          lines: match[2] ? [match[2]] : [],
        });
      } else if (line.trim() && acc.length > 0) {
        const lastSection = acc[acc.length - 1];
        lastSection.lines.push(line);

/*
todo доделать сплитование
        const splitedVerses = this.splitVerses(onlyLines, 4);

        const splitLinesCount =
          splitedVerses.length > 1 ? 2 : onlyLines.length <= 6 ? 0 : 2;
*/

        // lastSection.splitLinesCount++;
      }
      return acc;
    }, []);

    songObj.number = number;
    songObj.lyrics = lyrics;
    songObj.ref = reference;
    songObj.category = category;

    return songObj;
  }

  private splitVerses(verses: string[], rowCount: number): string[][] {
    const MAX_LENGTH = 35;

    // Функция для разбиения строки на строки до MAX_LENGTH
    function splitLine(line: string): string[] {
      const result: string[] = [];
      let currentLine = '';

      for (let i = 0; i < line.length; i++) {
        currentLine += line[i];

        if (currentLine.length > MAX_LENGTH) {
          const lastSpace = currentLine.lastIndexOf(' ');
          const lastPunctuation = Math.max(
            currentLine.lastIndexOf(','),
            currentLine.lastIndexOf('-'),
            currentLine.lastIndexOf('.'),
            currentLine.lastIndexOf(';'),
            currentLine.lastIndexOf(':')
          );

          const cutIndex =
            lastPunctuation >= 0 && lastPunctuation >= lastSpace
              ? lastPunctuation + 1
              : lastSpace;

          if (cutIndex > 0) {
            result.push(currentLine.slice(0, cutIndex).trim());
            currentLine = currentLine.slice(cutIndex).trim();
          } else {
            result.push(currentLine.trim());
            currentLine = '';
          }
        }
      }

      if (currentLine) {
        result.push(currentLine.trim());
      }

      return result;
    }

    // Разбиение всех строк и их объединение в один массив
    const allLines = verses.flatMap(splitLine);

    // Формирование двумерного массива
    const result: string[][] = [];
    for (let i = 0; i < allLines.length; i += rowCount) {
      result.push(allLines.slice(i, i + rowCount));
    }

    return result;
  }

  private parseSongs(data: any | object, bookKey: string): ISongBook {
    if (!data) {
      throw new Error('Book is empty');
    }

    const songs = data.data as LyriRawSong[];
    const title = data.bookTitle;
    const date = data.date;



    const parsedSongs = songs.map((block) => {
      return this.parseSong(block, bookKey);
    });

    return {
      header: {
        title,
        bookKey,
        number: '',
        author: '',
        updatedAt: date,
      } satisfies ISongBookHeader,
      songs: parsedSongs.sort((a, b) => a.number - b.number),
    };
  }

  private readBookNames(): string[] {
    try {
      const files = fs.readdirSync(this.assetsPath);
      const songsFiles = files.filter((file) =>
        file.includes(this.sourceNameSuffix)
      );

      return songsFiles.map((item) => item.replace(this.sourceNameSuffix, ''));
    } catch (error) {
      console.log('ERROR', error);
    }
  }

  convertSourceToJson() {
    const books = this.readBookNames();

    for (const book of books) {
      try {
        console.log('convertToJson', book)
        this.convertToJson(book);
      } catch (error) {
        console.log('ERROR convertSourceToJson', error);
      }
    }
  }

  convertToJson(fileName: string) {
    const filePath = path.resolve(
      this.assetsPath,
      `${fileName}${this.sourceNameSuffix}`
    );

    try {
      const data = fs.readFileSync(filePath);
      const fromJsonStr = JSON.parse(data.toString());
      const parsedData = this.parseSongs(fromJsonStr, fileName);

      const newFilePath = path.resolve(
        this.assetsJsonsPath,
        `${fileName}${this.jsonNameSuffix}`
      );
      fs.mkdirSync(this.assetsJsonsPath, { recursive: true });

      fs.writeFileSync(newFilePath, JSON.stringify(parsedData, null, 2));
    } catch (err) {
      console.log('ERROR convertToJson', err);
    }
  }
}
