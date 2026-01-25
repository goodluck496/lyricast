import {
  ISong,
  ISongBookName,
  Lyric,
  LyricLine,
  LyricTypeEnum,
  SongDatabaseInfoDto,
} from '@lyri-cast/entities';
import {
  RegistryItemDto,
  RegistryItemMetaDto,
  SongLyricDto,
  SongLyricLineDto,
} from '@lyri-cast/openapi-songs-dictionary';

export function mapRegistryItemToSongDatabaseInfoDto(
  item: RegistryItemDto
): SongDatabaseInfoDto {
  const meta: RegistryItemMetaDto = {
    version: typeof item.meta?.version === 'number' ? item.meta.version : 0,
    songCount:
      typeof item.meta?.songCount === 'number' ? item.meta.songCount : 0,
    fileKey: item.meta?.fileKey,
    language: item.meta?.language,
    title: item.meta?.title,
    description: item.meta?.description,
    coverImage: item.meta?.coverImage,
    updatedBy: item.meta?.updatedBy,
    updatedAt: item.meta?.updatedAt,
  };

  return {
    db: String(item.id),
    fileKey: typeof meta.fileKey === 'string' ? meta.fileKey : undefined,
    title: typeof meta.title === 'string' ? meta.title : undefined,
    description:
      typeof meta.description === 'string' ? meta.description : undefined,
    language: typeof meta.language === 'string' ? meta.language : undefined,
    songCount: typeof meta.songCount === 'number' ? meta.songCount : undefined,
    coverImage:
      typeof meta.coverImage === 'string' ? meta.coverImage : undefined,
    version: typeof meta.version === 'number' ? meta.version : undefined,
    updatedBy: typeof meta.updatedBy === 'string' ? meta.updatedBy : undefined,
    updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : undefined,
  };
}

export function mapSongUnionToISong(song: unknown): ISong {
  if (!song || typeof song !== 'object') {
    throw new Error('[songs-dictionary.mappers] Invalid song payload');
  }

  const base = song as {
    id?: number;
    number?: number;
    title?: string;
    songKey?: string;
    keySignature?: string;
    author?: string;
    ref?: string | null;
    category?: string | null;
    songBookId?: number;
    lyrics?: SongLyricDto[];
    meta?: string[];
  };

  const bookName: ISongBookName = {
    fileKey: String(base.songBookId ?? ''),
    humanName: String(base.songBookId ?? ''),
  };

  const lyrics: Lyric[] = Array.isArray(base.lyrics)
    ? base.lyrics.map(mapApiLyricToLyric)
    : [];

  return {
    id: base.id,
    number: base.number ?? 0,
    title: base.title ?? '',
    key: base.songKey ?? '',
    keySignature: base.keySignature ?? '',
    author: base.author ?? '',
    meta: Array.isArray(base.meta) ? base.meta : [],
    lyrics,
    ref: base.ref ?? undefined,
    category: base.category ?? undefined,
    bookName,
  };
}

export function mapApiLyricToLyric(api: SongLyricDto): Lyric {
  return {
    id: 0,
    songId: '',
    numericSongId: null,
    uniqId: api.uniqId,
    sectionTitle: api.sectionTitle,
    type: mapApiLyricType(api.type),
    splitLinesCount: api.splitLinesCount ?? 1,
    lines: (api.lyrics || []).map(mapApiLyricLineToLyricLine),
  };
}

function mapApiLyricLineToLyricLine(line: SongLyricLineDto): LyricLine {
  return {
    id: 0,
    rangeIndex: String(line.rangeIndex ?? ''),
    index: typeof line.lineIndex === 'number' ? line.lineIndex : 0,
    globalSongIndex:
      typeof line.globalSongIndex === 'number' ? line.globalSongIndex : 0,
    text: String(line.text ?? ''),
  };
}

function mapApiLyricType(type: string): LyricTypeEnum {
  switch (type) {
    case 'COUPLET':
    case 'CHORUS':
    case 'PUBLIC':
    case 'END':
      return type as LyricTypeEnum;
    default:
      return LyricTypeEnum.COUPLET;
  }
}
