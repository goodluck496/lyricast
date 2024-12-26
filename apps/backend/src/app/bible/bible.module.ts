import { Module } from '@nestjs/common';
import { BibleHtmlParserService } from './bible-html-parser.service';
import { BibleXmlParserService } from './bible-xml-parser.service';

@Module({
  imports: [],
  providers: [BibleHtmlParserService, BibleXmlParserService],
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
