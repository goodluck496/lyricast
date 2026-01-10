import { IsOptional, IsString } from 'class-validator';

export class UpdateSongBookMetaDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  language?: string | null;

  @IsOptional()
  @IsString()
  coverImage?: string | null;
}
