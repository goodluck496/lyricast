import { SerializedState } from '@lyri-cast/entities';

export interface IPptxExporter {
  export(presentationName: string, slides: SerializedState[]): Promise<Buffer>;
}

export interface IPptxImporter {
  import(fileBuffer: Buffer): Promise<SerializedState[]>;
}
