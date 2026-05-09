import { Module } from '@nestjs/common';
import { FreeSlideController } from './free-slide.controller';
import { FreeSlideService } from './free-slide.service';
import { databaseProvider } from './db/database.provider';
import { PptxService } from './pptx/pptx.service';
import { PptxExportAdapterService } from './pptx/pptx-export-adapter.service';
import { PptxImportAdapterService } from './pptx/pptx-import-adapter.service';

@Module({
  controllers: [FreeSlideController],
  providers: [
    databaseProvider,
    FreeSlideService,
    PptxService,
    PptxExportAdapterService,
    PptxImportAdapterService
  ],
  exports: [
    databaseProvider,
    FreeSlideService,
    PptxService
  ],
})
export class FreeSlideDomainModule {}
