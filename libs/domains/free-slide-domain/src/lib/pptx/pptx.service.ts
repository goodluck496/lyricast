import { Injectable } from '@nestjs/common';
import { PptxExportAdapterService } from './pptx-export-adapter.service';
import { PptxImportAdapterService } from './pptx-import-adapter.service';
import { SerializedState } from '@lyri-cast/entities';

@Injectable()
export class PptxService {
  constructor(
    private readonly exporter: PptxExportAdapterService,
    private readonly importer: PptxImportAdapterService
  ) {}

  async exportPptx(presentationName: string, slides: SerializedState[]): Promise<Buffer> {
    return this.exporter.export(presentationName, slides);
  }

  async importPptx(fileBuffer: Buffer): Promise<SerializedState[]> {
    return this.importer.import(fileBuffer);
  }
}
