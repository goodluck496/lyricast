import { Module } from '@nestjs/common';
import { BibleHtmlParserService } from './bible-html-parser.service';
import { BibleXmlParserService } from './bible-xml-parser.service';
import { BibleByFilesService } from './bible-by-files.service';
import { BibleController } from './bible.controller';

@Module({
  // imports: [TypeOrmModule.forFeature([BibleTranslateEntity])],
  controllers: [BibleController],
  providers: [
    BibleHtmlParserService,
    BibleXmlParserService,
    BibleByFilesService,
  ],
  exports: [BibleByFilesService],
})
export class BibleDomainModule {
  constructor(
    private bibleHtmlParserService: BibleHtmlParserService,
    private bibleXmlParserService: BibleXmlParserService,
    private readonly bibleService: BibleByFilesService
  ) /*@InjectRepository(BibleTranslateEntity)
    private readonly bibleTranslateRepo: Repository<BibleTranslateEntity>*/ {
    if (false /*!environment.production*/) {
      this.init();
    } else {
      this.bibleService.isReady = true;
    }
  }

  init() {
    Promise.all([
      // переводы в HTML формате устаревшие и ошибочные
      // this.bibleHtmlParserService.convertToJson(),
      this.bibleXmlParserService.convertToJson(),
    ]).then(async () => {
      this.bibleService.isReady = true;
      // for (const bibleObj of this.bibleService.getAllShortBibles()) {
      //   const bible = await this.bibleTranslateRepo.findOne({
      //     where: { keyForSearch: Like(bibleObj.keyForSearch) },
      //   });
      //
      //   if (!bible) {
      //     const createdBible = this.bibleTranslateRepo.create({
      //       name: bibleObj.title,
      //       keyForSearch: bibleObj.keyForSearch,
      //       isClassicBookOrder: bibleObj.isClassicBookOrder,
      //       language: bibleObj.lang,
      //     });
      //     await this.bibleTranslateRepo.save(createdBible);
      //   }
      // }
    });
  }
}
