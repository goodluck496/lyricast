import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateSongBookDto {
  @ApiProperty({ description: 'ID каталога, в который создаётся сборник' })
  @IsInt()
  @Min(1)
  catalogId!: number;

  @ApiPropertyOptional({ description: 'Название сборника (meta.title)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Источник/автор (meta.source)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;

  @ApiPropertyOptional({ description: 'Язык сборника (meta.language)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @ApiPropertyOptional({ description: 'Описание (meta.description)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Обложка в формате data URL' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ description: 'Пользовательский fileKey (если не указан, генерится автоматически)' })
  @IsOptional()
  @IsString()
  @MaxLength(190)
  fileKey?: string;
}
