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
  providers: [
    BibleHtmlParserService,
    BibleXmlParserService,
    BibleByFilesService,
  ],
  exports: [BibleByFilesService]
})
export class BibleModule {
  constructor(
    private bibleHtmlParserService: BibleHtmlParserService,
    private bibleXmlParserService: BibleXmlParserService,
    private readonly bibleService: BibleByFilesService,
    @InjectRepository(BibleTranslateEntity)
    private readonly bibleTranslateRepo: Repository<BibleTranslateEntity>
  ) {
    this.init();
  }

  init() {
    Promise.all([
      this.bibleHtmlParserService.convertToJson(),
      this.bibleXmlParserService.convertToJson(),
    ]).then(async () => {
      this.bibleService.isReady = true;
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
