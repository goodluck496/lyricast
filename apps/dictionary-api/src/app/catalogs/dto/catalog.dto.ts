import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { catalogTypeEnum } from '../../../lib/db/schema';

type CatalogType = (typeof catalogTypeEnum.enumValues)[number];

export class CatalogDto {
  @ApiProperty({ description: 'ID каталога' })
  id!: number;

  @ApiProperty({ description: 'Уникальный код/slug' })
  code!: string;

  @ApiProperty({ description: 'Название каталога' })
  title!: string;

  @ApiProperty({ enum: catalogTypeEnum.enumValues, description: 'Тип каталога' })
  type!: CatalogType;

  @ApiProperty({ description: 'Текущая версия каталога' })
  version!: number;

  @ApiProperty({ description: 'Дата обновления' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: { type: 'string' },
    description: 'Произвольные метаданные каталога',
  })
  meta?: Record<string, string>;
}
