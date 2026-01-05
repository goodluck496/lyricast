import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { SongsService } from './songs.service';
import { IShortSong, ISongForSearch } from '@lyri-cast/entities';

@Controller('songs')
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Get('dictionaries')
  getDictionaries(
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ) {
    const auth =
      authorization ??
      (xAuthToken ? `Bearer ${xAuthToken}` : undefined) ??
      (authToken ? `Bearer ${authToken}` : undefined);
    if (!auth) {
      throw new UnauthorizedException('Authorization is required');
    }

    return this.songsService.getDictionariesStatus(auth).catch((e) => {
      const msg = String((e as any)?.message ?? e);
      if (msg.includes('401') || msg.includes('403')) {
        throw new UnauthorizedException('Unauthorized');
      }
      throw e;
    });
  }

  @Post('dictionaries/install')
  async installDictionary(
    @Body() body: { fileKey: string; downloadUrl?: string },
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ) {
    const auth =
      authorization ??
      (xAuthToken ? `Bearer ${xAuthToken}` : undefined) ??
      (authToken ? `Bearer ${authToken}` : undefined);
    if (!auth) {
      throw new UnauthorizedException('Authorization is required');
    }

    await this.songsService.installDictionary(
      body.fileKey,
      auth,
      body.downloadUrl
    ).catch((e) => {
      const msg = String((e as any)?.message ?? e);
      if (msg.includes('401') || msg.includes('403')) {
        throw new UnauthorizedException('Unauthorized');
      }
      throw e;
    });
    return { ok: true };
  }

  @Post('dictionaries/delete')
  deleteDictionary(@Body() body: { fileKey: string }) {
    return this.songsService.deleteDictionary(body.fileKey);
  }

  @Post('dictionaries/clear')
  clearDictionaries() {
    return this.songsService.clearDictionaries();
  }

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
    return this.songsService.readSong(bookName, Number(songId), true);
  }

  @Get('book-songs/:book')
  getBookSongs(@Param('book') bookName: string): IShortSong[] {
    return this.songsService.getBookSongNames(bookName);
  }

  @Get('find/:book')
  findSong(
    @Param('book') bookName: string,
    @Query('search') queryText: string
  ): ISongForSearch[] {
    const result = this.songsService.findSongByText(bookName, queryText);

    return result.map((el) =>
      this.songsService.convertToSearchSong(el, queryText)
    );
  }
}

