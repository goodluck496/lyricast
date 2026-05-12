import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SongUsageDomainService } from './song-usage-domain.service';
import {
  FinishSongUsageSessionDto,
  SaveSongDisplaySettingsDto,
  SongDisplaySettingsDto,
  SongUsageSummaryDto,
  StartSongUsageSessionDto,
} from './song-usage-domain.types';

@Controller('song-usage')
export class SongUsageDomainController {
  constructor(private readonly service: SongUsageDomainService) {}

  @Post('sessions')
  startSession(@Body() dto: StartSongUsageSessionDto): { id: string } {
    return this.service.startSession(dto);
  }

  @Post('sessions/:id/finish')
  finishSession(
    @Param('id') id: string,
    @Body() dto: FinishSongUsageSessionDto
  ): { id: string; durationMs: number } {
    return this.service.finishSession(
      id,
      dto.endedAt ? new Date(dto.endedAt) : new Date()
    );
  }

  @Get('summaries')
  getSummaries(): SongUsageSummaryDto[] {
    return this.service.getSummaries();
  }

  @Get('summary')
  getSummary(
    @Query('songBookKey') songBookKey: string,
    @Query('songNumber') songNumber: string
  ): SongUsageSummaryDto | null {
    return this.service.getSummary({
      songBookKey,
      songNumber: Number(songNumber),
    });
  }

  @Get('settings')
  getSettings(
    @Query('songBookKey') songBookKey: string,
    @Query('songNumber') songNumber: string
  ): SongDisplaySettingsDto | null {
    return this.service.getSettings({
      songBookKey,
      songNumber: Number(songNumber),
    });
  }

  @Post('settings')
  saveSettings(
    @Body() dto: SaveSongDisplaySettingsDto
  ): SongDisplaySettingsDto {
    return this.service.saveSettings(dto);
  }
}
