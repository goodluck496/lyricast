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
    const isPackaged = process.env.IS_PACKAGED === 'true';
    const userDataPath = process.env.USER_DATA_PATH!;
    const sourceDataPath = process.env.SOURCE_DATA_PATH!;
    const assetsDirName = 'user-assets';

    if (isPackaged) {
      this.assetsPath = path.join(userDataPath, assetsDirName);
    } else {
      this.assetsPath = path.resolve(sourceDataPath, 'data', assetsDirName);
    }
  }

  async create(file: UploadedMulterFile): Promise<Asset> {
    const hash = createHash('sha256').update(file.buffer).digest('hex');

    const existingAsset = await this.findOne(hash);
    if (existingAsset) {
      return existingAsset;
    }

    const filePath = path.join(this.assetsPath, hash);
    await fs.writeFile(filePath, file.buffer);

    const newAsset: NewAsset = {
      id: hash,
      originalName: file.originalname,
      filePath: filePath,
      mimeType: file.mimetype,
      size: file.size,
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
