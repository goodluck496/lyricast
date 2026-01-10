import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class SongLyricLineDto {
  @ApiProperty({ example: '0' })
  @IsString()
  @IsOptional()
  rangeIndex?: string;

  @ApiProperty()
  @IsInt()
  lineIndex!: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  globalSongIndex?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1)
  repeatCount?: number = 1;
}

export class SongLyricDto {
  @ApiProperty()
  @IsString()
  uniqId!: string;

  @ApiProperty()
  @IsString()
  sectionTitle!: string;

  @ApiProperty({ example: 'COUPLET' })
  @IsString()
  type!: string;

  @ApiProperty({ default: 0 })
  @IsInt()
  splitLinesCount!: number;

  @ApiProperty({ default: 0 })
  @IsInt()
  sortIndex!: number;

  @ApiProperty({ type: [SongLyricLineDto] })
  @IsArray()
  lyrics!: SongLyricLineDto[];
}
