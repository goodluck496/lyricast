import { Module } from '@nestjs/common';
import { BibleHtmlParserService } from './bible-html-parser.service';
import { BibleXmlParserService } from './bible-xml-parser.service';
import { BibleService } from './bible.service';
import { BibleController } from './bible.controller';

@Module({
  imports: [],
  controllers: [BibleController],
  providers: [BibleHtmlParserService, BibleXmlParserService, BibleService],
})
export class BibleModule {
  constructor(
    bibleHtmlParserService: BibleHtmlParserService,
    bibleXmlParserService: BibleXmlParserService
  ) {
    bibleHtmlParserService.convertToJson();
    bibleXmlParserService.convertToJson();
  }
}
