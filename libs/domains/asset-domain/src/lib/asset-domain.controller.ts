import {
  CallHandler,
  Controller,
  Delete,
  Body,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NestInterceptor,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import 'multer'; // Import multer to make types available
import { AssetDomainService } from './asset-domain.service';
import { Asset } from './db/schema';
import { createReadStream, statSync } from 'fs';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import Busboy from 'busboy';
import { randomUUID } from 'crypto';
import { memoryStorage } from 'multer';
import { catchError, throwError } from 'rxjs';

// Create a clear, local alias for the Multer file type for better readability.
type UploadedMulterFile = Express.Multer.File;

type ParsedMultipart = {
  file: Express.Multer.File;
  fields: Record<string, string>;
};

type UploadAssetBase64Payload = {
  originalName: string;
  mimeType: string;
  dataBase64: string;
};

function parseMultipartToMulterFile(
  req: Request,
  opts?: { maxFileSize?: number; maxFiles?: number }
): Promise<ParsedMultipart> {
  const maxFileSize = opts?.maxFileSize ?? 50 * 1024 * 1024;
  const maxFiles = opts?.maxFiles ?? 1;

  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: maxFiles, fileSize: maxFileSize },
    });

    const fields: Record<string, string> = {};
    let file: Express.Multer.File | null = null;

    bb.on('field', (name: any, val: any) => {
      fields[name] = val;
    });

    bb.on('file', (fieldname: any, stream: any, info: any) => {
      const chunks: Buffer[] = [];
      let size = 0;

      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        chunks.push(chunk);
      });

      stream.on('limit', () => {
        // важно: дочитать поток, иначе bb.finish может не наступить корректно
        stream.resume();
        reject(new Error(`File too large. Limit=${maxFileSize} bytes`));
      });

      stream.on('error', reject);

      stream.on('end', () => {
        // @ts-ignore
        const buffer = Buffer.concat(chunks);

        if (buffer.length === 0) {
          // пустой файл — считаем ошибкой на уровне finish
          return;
        }

        file = {
          fieldname,
          originalname: info.filename,
          encoding: '7bit', // busboy не всегда даёт encoding стабильно
          mimetype: info.mimeType,
          size,
          buffer,
          destination: '',
          filename: randomUUID(),
          path: '',
          stream: undefined as any, // multer заполняет, но нам не нужен
        };
      });
    });

    bb.on('error', reject);

    bb.on('finish', () => {
      if (!file || file.size === 0) {
        reject(new Error('Empty or missing file'));
        return;
      }
      resolve({ file, fields });
    });

    req.pipe(bb);
  });
}

@Injectable()
export class LogErrorsInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError((e) => {
        console.error('UPLOAD ERROR:', e);
        return throwError(() => e);
      })
    );
  }
}

@Controller('assets')
export class AssetDomainController {
  constructor(private assetDomainService: AssetDomainService) {}

  @Post('upload')
  // todo почему-то file возвращается как undefined
  //  надо разобраться, а пока ручная обработка\костыль от GPT
  //  upd 03-01-2026. на версии multer 1.4.12 все работает, а на свежей верии только с костылем
  @UseInterceptors(
    LogErrorsInterceptor,
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, _file, cb) => cb(null, true),
    })
  )
  async uploadFile(@UploadedFile() file: UploadedMulterFile) {
    // async uploadFile(@Req() req: Request) {

    // бай-пасс если multer  не заработает с Express 5+
    // const { file, fields } = await parseMultipartToMulterFile(req);
    return this.assetDomainService.create(file);
  }

  @Post('upload-base64')
  async uploadBase64(@Body() body: UploadAssetBase64Payload): Promise<Asset> {
    const buffer = Buffer.from(body.dataBase64, 'base64');
    return this.assetDomainService.createFromBuffer({
      buffer,
      originalName: body.originalName,
      mimeType: body.mimeType,
      size: buffer.length,
    });
  }

  @Get()
  async findAll(): Promise<Asset[]> {
    return this.assetDomainService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Asset> {
    const asset = await this.assetDomainService.findOne(id);
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }
    return asset;
  }

  @Get(':id/file')
  async getAssetFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const asset = await this.assetDomainService.findOne(id);
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const fileStat = statSync(asset.filePath);
    const fileStream = createReadStream(asset.filePath);

    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', fileStat.size);

    return new StreamableFile(fileStream);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.assetDomainService.remove(id);
  }
}
