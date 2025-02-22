import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class BibleTranslateEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({type: 'varchar', length: 255})
  name: string;

  @Column({type: 'varchar', length: 255})
  language: string;

  @Column({type: 'varchar', length: 255})
  keyForSearch: string;

  @Column()
  isClassicBookOrder: boolean;
}
