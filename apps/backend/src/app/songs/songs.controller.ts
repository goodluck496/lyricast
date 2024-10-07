import { Controller, Get, Param, Query } from '@nestjs/common';
import { SongsService } from './songs.service';
import { IShortSong } from '@lyri-cast/entities';

@Controller()
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Get('book-names')
  getBookNames() {
    return this.songsService.readBookNames();
  }

  @Get('book/:book')
  getBook(@Param('book') name: string) {
    return this.songsService.readBook(name);
  }

  @Get('book/:book/:songId')
  getSong(@Param('book') bookName: string, @Param('songId') songId: string) {
    return this.songsService.readSong(bookName, Number(songId));
  }

  @Get('book-songs/:book')
  getBookSongs(@Param('book') bookName: string): IShortSong[] {
    return this.songsService.getBookSongNames(bookName);
  }

  @Get('find/:book')
  findSong(
    @Param('book') bookName: string,
    @Query('search') queryText: string,
    @Query('full-model') fullModel: string
  ): IShortSong[] {
    console.log('-----', bookName, queryText);
    const result = this.songsService.findSongByText(bookName, queryText);

    if (fullModel) {
      return result;
    }

    return result.map(this.songsService.convertToShortSong);
  }
}
