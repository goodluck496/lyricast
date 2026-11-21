import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBibleMetaDto {
  @ApiPropertyOptional({ description: 'Название перевода (title/humanName)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Название перевода (humanName)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  humanName?: string;

  @ApiPropertyOptional({ description: 'Исходное название (sourceTitle)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceTitle?: string;

  @ApiPropertyOptional({ description: 'Язык перевода (lang)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @ApiPropertyOptional({ description: 'Версия перевода (version)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  version?: string;

  @ApiPropertyOptional({ description: 'Является ли переводом по умолчанию' })
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Классический порядок книг' })
  @IsOptional()
  isClassicBookOrder?: boolean;

  @ApiPropertyOptional({ description: 'Обложка / фоновое изображение (data:URL или URL)' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ description: 'Email владельца перевода' })
  @IsOptional()
  @IsString()
  ownerEmail?: string;
}