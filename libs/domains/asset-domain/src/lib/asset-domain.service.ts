import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import 'multer';
import { DB_PROVIDER_TOKEN } from './db/database.provider';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { Asset, NewAsset } from './db/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

// Create a clear, local alias for the Multer file type for better readability.
type UploadedMulterFile = Express.Multer.File;

@Injectable()
export class AssetDomainService {
  private readonly assetsPath: string;

  constructor(
    @Inject(DB_PROVIDER_TOKEN)
    private db: BetterSQLite3Database<typeof schema>
  ) {
    // Все пользовательские ассеты живут в USER_ASSETS_PATH, который указывает
    // на директорию внутри userData (см. configureAppPathsEnv в electron-приложении).
    // SOURCE_DATA_PATH больше не используется для хранения живых файлов.
    const assetsEnvPath =
      process.env['USER_ASSETS_PATH'] || process.env['USER_DATA_PATH'];

    if (!assetsEnvPath) {
      throw new Error('USER_ASSETS_PATH/USER_DATA_PATH is not configured.');
    }

    // Если USER_ASSETS_PATH не задан по какой-то причине, то используем
    // корень USER_DATA_PATH и создаём в нём подпапку user-assets.
    this.assetsPath = process.env['USER_ASSETS_PATH']
      ? assetsEnvPath
      : path.join(assetsEnvPath, 'user-assets');
  }

  async create(file: UploadedMulterFile): Promise<Asset> {
    console.log('file?,',file);
    return this.createFromBuffer({
      buffer: file.buffer as Buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  }

  async createFromBuffer(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
  }): Promise<Asset> {
    const hash = createHash('sha256').update(input.buffer).digest('hex');

    const existingAsset = await this.findOne(hash);
    if (existingAsset) {
      return existingAsset;
    }

    const filePath = path.join(this.assetsPath, hash);
    await fs.writeFile(filePath, input.buffer);

    const newAsset: NewAsset = {
      id: hash,
      originalName: input.originalName,
      filePath: filePath,
      mimeType: input.mimeType,
      size: input.size,
      createdAt: new Date(),
    };

    const result = this.db.insert(schema.assets).values(newAsset).returning().get();
    return result;
  }

  async findAll(): Promise<Asset[]> {
    return this.db.select().from(schema.assets).all();
  }

  async findOne(id: string): Promise<Asset | undefined> {
    return this.db.select().from(schema.assets).where(eq(schema.assets.id, id)).get();
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const asset = await this.findOne(id);
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }

    try {
      await fs.unlink(asset.filePath);
    } catch (error) {
      console.error(`Failed to delete asset file: ${asset.filePath}`, error);
      // Decide if you want to proceed with DB deletion even if file deletion fails
    }

    const result = await this.db.delete(schema.assets).where(eq(schema.assets.id, id)).run();
    return { success: result.changes > 0 };
  }
}
