import { ApiProperty } from '@nestjs/swagger';

export class SongBookExportLyricLineDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: 'Номер песни строкой' })
  songId!: string;

  @ApiProperty({ nullable: true })
  rangeIndex!: string | null;

  @ApiProperty()
  index!: number;

  @ApiProperty({ nullable: true })
  globalSongIndex!: number | null;

  @ApiProperty()
  text!: string;
}

export class SongBookExportLyricDto {
  @ApiProperty()
  songId!: string;

  @ApiProperty()
  uniqId!: string;

  @ApiProperty()
  sectionTitle!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  splitLinesCount!: number;

  @ApiProperty({ type: [SongBookExportLyricLineDto] })
  lines!: SongBookExportLyricLineDto[];
}

export class SongBookExportBookNameDto {
  @ApiProperty()
  fileKey!: string;

  @ApiProperty()
  humanName!: string;
}

export class SongBookExportSongDto {
  @ApiProperty()
  number!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  keySignature!: string;

  @ApiProperty()
  author!: string;

  @ApiProperty({ type: [String] })
  meta!: string[];

  @ApiProperty({ type: [SongBookExportLyricDto] })
  lyrics!: SongBookExportLyricDto[];

  @ApiProperty({ nullable: true })
  ref?: string | null;

  @ApiProperty({ nullable: true })
  category?: string | null;

  @ApiProperty({ type: SongBookExportBookNameDto })
  bookName!: SongBookExportBookNameDto;
}

export class SongBookExportHeaderDto {
  @ApiProperty()
  number!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  author!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty()
  bookKey!: string;

  @ApiProperty()
  disabled!: boolean;
}

export class SongBookExportDto {
  @ApiProperty({ type: SongBookExportHeaderDto })
  header!: SongBookExportHeaderDto;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  meta!: Record<string, string>;

  @ApiProperty({ type: [SongBookExportSongDto] })
  songs!: SongBookExportSongDto[];
}
