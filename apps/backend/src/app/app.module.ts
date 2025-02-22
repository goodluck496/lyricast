import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SongsModule } from './songs/songs.module';
import { BibleModule } from './bible/bible.module';
import { BibleTranslateEntity } from './database/entities/bible/bible-translate.entity';

@Module({
  imports: [
    SongsModule,
    BibleModule,
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      // database: './data/database.sqlite', // Путь к SQLite файлу
      database: './data/database.db', // Путь к SQLite файлу
      entities: [BibleTranslateEntity], // Укажите ваши Entity
      synchronize: true, // Автоматическое создание таблиц
      logging: true, // Для отладки
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
