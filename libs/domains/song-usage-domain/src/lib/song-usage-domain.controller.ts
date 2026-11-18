import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { SongUsageDomainService } from './song-usage-domain.service';
import {
  FinishSongUsageSessionDto,
  SaveSongDisplaySettingsDto,
  SaveSongOverrideDto,
  SongDisplaySettingsDto,
  SongOverrideDto,
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

  @Get('override')
  getOverride(
    @Query('songBookKey') songBookKey: string,
    @Query('songNumber') songNumber: string
  ): SongOverrideDto | null {
    return this.service.getOverride({
      songBookKey,
      songNumber: Number(songNumber),
    });
  }

  @Post('override')
  saveOverride(@Body() dto: SaveSongOverrideDto): SongOverrideDto {
    return this.service.saveOverride(dto);
  }

  @Delete('override')
  deleteOverride(
    @Query('songBookKey') songBookKey: string,
    @Query('songNumber') songNumber: string
  ): { success: boolean } {
    return this.service.deleteOverride({
      songBookKey,
      songNumber: Number(songNumber),
    });
  }

  @Get('overrides')
  getBookOverrides(@Query('songBookKey') songBookKey: string): number[] {
    return this.service.getBookOverrides(songBookKey);
  }
}
