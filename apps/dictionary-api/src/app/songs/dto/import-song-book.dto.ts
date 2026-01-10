import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SongBookExportDto } from './song-book-export.dto';

export class ImportSongBookDto {
  @ApiProperty({ description: 'ID каталога, в который помещаем сборник' })
  @IsInt()
  @Min(1)
  catalogId!: number;

  @ApiProperty({ type: SongBookExportDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SongBookExportDto)
  data!: SongBookExportDto;
}
