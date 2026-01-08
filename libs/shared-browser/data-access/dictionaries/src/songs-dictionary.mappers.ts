import { ISong, ISongBookName, Lyric, LyricLine, LyricTypeEnum } from '@lyri-cast/entities';
import { SongDatabaseInfoDto, SongSearchResultDto } from '@lyri-cast/entities';
import { RegistryItem, RegistryItemMeta } from '@lyri-cast/openapi-songs-dictionary';
import { SongBase, SongFull, SongSearchResponse, Lyric as ApiLyric, LyricLine as ApiLyricLine } from '@lyri-cast/openapi-songs-dictionary';

export function mapRegistryItemToSongDatabaseInfoDto(item: RegistryItem): SongDatabaseInfoDto {
  const meta = (item.meta || {}) as RegistryItemMeta;

  return {
    db: item.db,
    fileKey: typeof meta.fileKey === 'string' ? meta.fileKey : undefined,
    title: typeof meta.title === 'string' ? meta.title : undefined,
    description: typeof meta.description === 'string' ? meta.description : undefined,
    language: typeof meta.language === 'string' ? meta.language : undefined,
    sizeBytes: typeof item.size === 'number' ? item.size : typeof meta.size === 'number' ? meta.size : undefined,
    songCount: typeof meta.songCount === 'number' ? meta.songCount : undefined,
    coverImage: typeof meta.coverImage === 'string' ? meta.coverImage : undefined,
    version: typeof meta.version === 'number' ? meta.version : undefined,
    updatedBy: typeof meta.updatedBy === 'string' ? meta.updatedBy : undefined,
    updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : undefined,
  };
}

export function mapSongSearchResponseToDto(res: SongSearchResponse): SongSearchResultDto {
  return {
    items: res.items.map(mapSongUnionToISong),
    totalCount: res.totalCount ?? res.total ?? 0,
    page: res.page,
    pageSize: res.pageSize,
  };
}

export function mapSongUnionToISong(song: SongBase | SongFull): ISong {
  const base: SongBase = song as SongBase;
  const full = (song as SongFull).lyrics ? (song as SongFull) : undefined;

  const bookName: ISongBookName = {
    fileKey: base.bookFileKey,
    humanName: base.bookFileKey,
  };

  const lyrics: Lyric[] = full ? full.lyrics.map(mapApiLyricToLyric) : [];

  return {
    id: (song as any).id,
    number: base.number,
    title: base.title,
    key: base.songKey,
    keySignature: base.keySignature,
    author: base.author,
    meta: [],
    lyrics,
    ref: base.ref ?? undefined,
    category: base.category ?? undefined,
    bookName,
  };
}

export function mapApiLyricToLyric(api: ApiLyric): Lyric {
  return {
    id: api.id,
    songId: String(api.songId ?? ''),
    numericSongId: api.songId ?? null,
    uniqId: api.uniqId,
    sectionTitle: api.sectionTitle,
    type: mapApiLyricType(api.type),
    splitLinesCount: api.splitLinesCount ?? 1,
    lines: (api.lines || []).map(
      (line: ApiLyricLine): LyricLine => ({
        id: line.id,
        rangeIndex: String(line.rangeIndex ?? ''),
        index: line.lineIndex ?? 0,
        globalSongIndex: line.globalSongIndex ?? 0,
        text: String(line.text ?? ''),
      })
    ),
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
