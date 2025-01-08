import { Injectable } from '@nestjs/common';
import path from 'path';
import fs from 'fs';
import {
  ISong,
  ISongBook,
  ISongBookHeader,
  LyricTypeEnum,
} from '@lyri-cast/entities';

@Injectable()
export class ParseSongsService {
  sourceNameSuffix = '.songs.sps';
  jsonNameSuffix = '.songs.json';
  assetsPath = path.resolve(__dirname, 'assets');
  assetsJsonsPath = path.resolve(__dirname, 'assets', 'complete-jsons');

  private parseSong(text: string, bookKey: string): ISong {
    const songObj: ISong = {
      number: 0,
      title: '',
      key: '',
      keySignature: '',
      author: '',
      meta: [],
      lyrics: [],
      bookName: { fileKey: bookKey, humanName: '' },
    };
    const parts = text.split('#$#');

    // Основные метаданные
    songObj.number = Number(parts[0].trim()); // номер
    songObj.title = parts[1]?.trim(); // название
    songObj.key = parts[2]?.trim(); // ключ
    songObj.keySignature = parts[3]?.trim(); // тональность
    songObj.author = parts[4]?.trim(); // автор

    // Блоки мета информации
    const metaBlocks =
      parts[5]?.split('#$#').filter((block) => block.trim()) || [];
    songObj.meta = metaBlocks.map((block) => block.trim());

    // Разделение текста на куплеты и припевы
    const lyrics = parts.slice(6)?.join('#$#'); // соединяем остальную часть
    const sections = lyrics
      .split(/@\$/)
      .map((section) => section.trim())
      .filter((section) => section);

    songObj.lyrics = sections.map((section) => {
      const lines = section
        .split('@%')
        .map((line) => line.trim())
        .filter((line) => line);

      const title = lines[0].trim();
      const lyricType = title.toLowerCase().includes('припев')
        ? LyricTypeEnum.CHORUS
        : LyricTypeEnum.COUPLET;

      const onlyLines = lines.slice(1); // остальная часть - строки
      const splitedVerses = this.splitVerses(onlyLines, 4);

      const splitLinesCount =
        splitedVerses.length > 1 ? 2 : onlyLines.length <= 6 ? 0 : 2;

      return {
        songId: String(songObj.number),
        uniqId: Math.random() / 1000 + lyricType,
        sectionTitle: title, // название секции
        lines: onlyLines,
        type: lyricType,
        splitLinesCount,
      };
    });

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

  private parseSongs(text: string, bookKey: string): ISongBook {
    // Разделяем текст на блоки песен
    const header = text.match(/##[^$].*/gi);
    header.forEach((item) => {
      text = text.replace(item, '');
    });

    const songBlocks = text
      .split(/#\$##\$#\w{0,}#\$##\$#([^КуПр]|$)/gi)
      .filter((block) => block.trim() !== '');

    const parsedSongs = songBlocks.map((block) => {
      return this.parseSong(block, bookKey);
    });

    return {
      header: header.reduce(
        (acc, curr, index) => {
          const headerTextRow = curr.replace('##', '');
          if (index === 0) {
            acc['number'] = headerTextRow;
          }
          if (index === 1) {
            acc['title'] = headerTextRow;
          }
          if (index === 2) {
            const hasDelim = headerTextRow.match('@%');
            if (hasDelim) {
              const chunks = headerTextRow.split('@%');
              acc['author'] = chunks[0];
              acc['updatedAt'] = chunks
                .slice(1)
                .filter((el) => !!el)
                .toString();
            } else {
              acc['author'] = headerTextRow;
            }
          }

          return acc;
        },
        {
          bookKey,
        } as ISongBookHeader
      ),
      songs: parsedSongs.sort((a, b) => a.number - b.number),
    };
  }

  private readBookNames(): string[] {
    try {
      const files = fs.readdirSync(this.assetsPath);
      const songsFiles = files.filter((file) =>
        file.includes(this.sourceNameSuffix)
      );

      return songsFiles.map((item) => item.replace('.songs.sps', ''));
    } catch (error) {
      console.log('ERROR', error);
    }
  }

  convertSourceToJson() {
    const books = this.readBookNames();

    for (const book of books) {
      try {
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
      const parsedData = this.parseSongs(data.toString(), fileName);

      const newFilePath = path.resolve(
        this.assetsJsonsPath,
        `${fileName}${this.jsonNameSuffix}`
      );
      fs.mkdirSync(this.assetsJsonsPath, { recursive: true });

      fs.writeFileSync(newFilePath, JSON.stringify(parsedData));
    } catch (err) {
      console.log('ERROR convertToJson', err);
    }
  }
}
