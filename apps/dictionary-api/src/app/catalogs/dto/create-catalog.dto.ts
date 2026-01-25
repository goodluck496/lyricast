import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { catalogTypeEnum } from '../../../lib/db/schema';

type CatalogType = (typeof catalogTypeEnum.enumValues)[number];

export class CreateCatalogDto {
  @ApiPropertyOptional({
    description: 'Уникальный код/slug. Если не передан — сгенерируется автоматически из title.',
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({ description: 'Человекочитаемое название каталога' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ enum: catalogTypeEnum.enumValues, description: 'Тип каталога' })
  @IsEnum(catalogTypeEnum.enumValues as CatalogType[])
  type!: CatalogType;
}
