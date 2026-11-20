import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateBibleVerseDto {
  @ApiProperty({ description: 'Новый текст стиха (HTML с поддержкой <span style="font-style: italic;">)' })
  @IsString()
  @IsNotEmpty()
  text!: string;
}