export * from './create-bible.dto';
export * from './update-bible-meta.dto';
export * from './bible-verse.dto';
export * from './import-bible.dto';

// Re-export из entities для удобства
export type {
  BibleDictionaryCardDto,
  BibleRegistryItemMetaDto,
  BibleRegistryItemDto,
  BibleRegistryResponseDto,
  BibleVersionItemDto,
  BibleVersionsCheckRequestDto,
  BibleVersionsCheckResponseItemDto,
  BibleVersionsCheckResponseDto,
  BibleExportDto,
} from '@lyri-cast/entities';