import { Controller, Get, Param, NotFoundException, Res, Post, UseInterceptors, UploadedFile, Delete, HttpCode, HttpStatus, StreamableFile } from '@nestjs/common';
import 'multer'; // Import multer to make types available
import { AssetDomainService } from './asset-domain.service';
import { Asset } from './db/schema';
import { Response } from 'express';
import { createReadStream, statSync } from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';

// Create a clear, local alias for the Multer file type for better readability.
type UploadedMulterFile = Express.Multer.File;

@Controller('assets')
export class AssetDomainController {
  constructor(private assetDomainService: AssetDomainService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: UploadedMulterFile) {
    return this.assetDomainService.create(file);
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
