import { Module } from '@nestjs/common';
import { BibleHtmlParserService } from './bible-html-parser.service';
import { BibleXmlParserService } from './bible-xml-parser.service';
import { BibleByFilesService } from './bible-by-files.service';
import { BibleController } from './bible.controller';
import { BibleTranslateEntity } from '../database/entities/bible/bible-translate.entity';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([BibleTranslateEntity])],
  controllers: [BibleController],
  providers: [BibleHtmlParserService, BibleXmlParserService, BibleByFilesService],
})
export class BibleModule {
  constructor(
    bibleHtmlParserService: BibleHtmlParserService,
    bibleXmlParserService: BibleXmlParserService,
    private readonly bibleService: BibleByFilesService,
    @InjectRepository(BibleTranslateEntity)
    private readonly bibleTranslateRepo: Repository<BibleTranslateEntity>
  ) {
    Promise.all([
      bibleHtmlParserService.convertToJson(),
      bibleXmlParserService.convertToJson(),
    ]).then(async () => {
      for (const bibleObj of this.bibleService.getAllShortBibles()) {
        const bible = await this.bibleTranslateRepo.findOne({
          where: { keyForSearch: Like(bibleObj.keyForSearch) },
        });

        if (!bible) {
          const createdBible = this.bibleTranslateRepo.create({
            name: bibleObj.title,
            keyForSearch: bibleObj.keyForSearch,
            isClassicBookOrder: bibleObj.isClassicBookOrder,
            language: bibleObj.lang,
          });
          await this.bibleTranslateRepo.save(createdBible);
        }
      }
    });
  }
}
