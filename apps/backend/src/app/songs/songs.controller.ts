import { Controller, Get, Param, Query } from '@nestjs/common';
import { SongsService } from './songs.service';

@Controller()
export class SongsController {
  constructor(
    private readonly songsService: SongsService
  ) {}

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
    return this.songsService.readSong(bookName, songId);
  }

  @Get('book-songs/:book')
  getBookSongs(@Param('book') bookName: string) {
    return this.songsService.getBookSongNames(bookName);
  }

  @Get('find/:book')
  findSong(@Param('book') bookName: string, @Query('query') queryText: string) {
    return this.songsService.findSongByText(bookName, queryText);
  }
}
