import {
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { SongsService } from './songs.service';

@Controller('songs/dictionaries')
export class ExportController {
  constructor(private readonly songsService: SongsService) {}

  @Post('song-books/:songBookId/export-json')
  async createJsonExportJob(
    @Param('songBookId', ParseIntPipe) songBookId: number,
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ) {
    const auth = this.resolveAuth(authorization, xAuthToken, authToken);
    return this.songsService.createJsonExportJob(songBookId, auth);
  }

  @Post('song-books/:songBookId/export-sqlite')
  async createSqliteExportJob(
    @Param('songBookId', ParseIntPipe) songBookId: number,
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ) {
    const auth = this.resolveAuth(authorization, xAuthToken, authToken);
    return this.songsService.createSqliteExportJob(songBookId, auth);
  }

  @Get('export-jobs/:jobId')
  async getExportJob(
    @Param('jobId') jobId: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ) {
    const auth = this.resolveAuth(authorization, xAuthToken, authToken);
    return this.songsService.getExportJob(jobId, auth);
  }

  @Post('export-jobs/:jobId/cancel')
  async cancelExportJob(
    @Param('jobId') jobId: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ) {
    const auth = this.resolveAuth(authorization, xAuthToken, authToken);
    return this.songsService.cancelExportJob(jobId, auth);
  }

  @Get('export-jobs/:jobId/file')
  async downloadExportFile(
    @Param('jobId') jobId: string,
    @Res() res: Response,
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ) {
    const auth = this.resolveAuth(authorization, xAuthToken, authToken);
    const { buffer, headers } = await this.songsService.downloadExportFile(
      jobId,
      auth
    );

    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.send(buffer);
  }

  private resolveAuth(
    authorization?: string,
    xAuthToken?: string,
    authToken?: string
  ): string {
    const auth =
      authorization ??
      (xAuthToken ? `Bearer ${xAuthToken}` : undefined) ??
      (authToken ? `Bearer ${authToken}` : undefined);
    if (!auth) {
      throw new UnauthorizedException('Authorization is required');
    }
    return auth;
  }
}
