import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsInt } from 'class-validator';

export class BookVersionItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @ApiProperty()
  @IsInt()
  version!: number;
}

export class VersionsCheckRequestDto {
  @ApiProperty({ type: [BookVersionItemDto], required: false })
  @IsOptional()
  @IsArray()
  books?: BookVersionItemDto[];
}

export class VersionsCheckResponseItemDto {
  @ApiProperty()
  fileKey!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  downloadUrl!: string;
}

export class VersionsCheckResponseDto {
  @ApiProperty({ type: [VersionsCheckResponseItemDto] })
  updates!: VersionsCheckResponseItemDto[];

  @ApiProperty()
  totalCount!: number;
}

export class RegistryItemMetaDto {
  @ApiPropertyOptional()
  fileKey?: string | null;

  @ApiPropertyOptional()
  language?: string | null;

  @ApiPropertyOptional()
  title?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional()
  coverImage?: string | null;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional()
  updatedBy?: string | null;

  @ApiPropertyOptional()
  updatedAt?: string | null;

  @ApiProperty()
  songCount!: number;
}

export class RegistryItemDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  fileKey!: string;

  @ApiProperty()
  humanName!: string;

  @ApiProperty()
  catalogId!: number;

  @ApiProperty({ type: RegistryItemMetaDto, required: false })
  meta?: RegistryItemMetaDto;
}

export class RegistryResponseDto {
  @ApiProperty({ type: [RegistryItemDto] })
  items!: RegistryItemDto[];

  @ApiProperty()
  totalCount!: number;
}
