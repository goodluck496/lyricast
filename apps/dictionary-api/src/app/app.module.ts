import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { SongsModule } from './songs/songs.module';
import { DraftModule } from './draft/draft.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    CatalogsModule,
    SongsModule,
    DraftModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
