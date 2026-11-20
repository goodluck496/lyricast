import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateBibleDto {
  @ApiProperty({ description: 'ID каталога, в который создаётся перевод' })
  @IsInt()
  @Min(1)
  catalogId!: number;

  @ApiPropertyOptional({ description: 'Название перевода (humanName)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

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

  @ApiPropertyOptional({ description: 'Пользовательский fileKey (если не указан, генерится автоматически)' })
  @IsOptional()
  @IsString()
  @MaxLength(190)
  fileKey?: string;

  @ApiPropertyOptional({ description: 'Является ли переводом по умолчанию' })
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Классический порядок книг' })
  @IsOptional()
  isClassicBookOrder?: boolean;
}