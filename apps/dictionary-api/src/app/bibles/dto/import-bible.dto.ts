import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BibleTranslate } from '@lyri-cast/entities';

export class ImportBibleDto {
  @ApiProperty({ description: 'ID каталога, в который помещаем перевод' })
  @IsInt()
  @Min(1)
  catalogId!: number;

  @ApiProperty({ description: 'Полный объект перевода BibleTranslate' })
  @IsDefined()
  @ValidateNested()
  @Type(() => Object) // BibleTranslate — сложный тип, валидация в сервисе
  data!: BibleTranslate;
}