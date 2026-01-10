import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SongLyricDto } from './song-lyrics.dto';

export class CreateSongDto {
  @ApiProperty()
  @IsInt()
  songBookId!: number;

  @ApiProperty()
  @IsInt()
  number!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ default: '' })
  @IsString()
  songKey!: string;

  @ApiProperty({ default: '' })
  @IsString()
  keySignature!: string;

  @ApiProperty({ default: '' })
  @IsString()
  author!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  meta?: string[];

  @ApiProperty({ type: [SongLyricDto] })
  @IsArray()
  lyrics!: SongLyricDto[];
}

export class UpdateSongDto extends PartialType(CreateSongDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deleteMetaKeys?: string[];
}
