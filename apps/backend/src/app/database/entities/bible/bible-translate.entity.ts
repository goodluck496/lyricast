import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class BibleTranslateEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  language: string;

  @Column()
  keyForSearch: string;

  @Column()
  isClassicBookOrder: boolean;
}
