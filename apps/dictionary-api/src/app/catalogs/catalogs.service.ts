import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import * as schema from '../../lib/db/schema';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

@Injectable()
export class CatalogsService {
  constructor(private readonly db: DatabaseService) {}

  private async ensureDatasetMeta() {
    const db = this.db.client;
    const [meta] = await db.select().from(schema.datasetMeta).limit(1);
    if (!meta) {
      await db
        .insert(schema.datasetMeta)
        .values({ id: 1, schemaVersion: 1, version: this.randomVersion() });
    }
  }

  async getDatasetVersion() {
    await this.ensureDatasetMeta();
    const db = this.db.client;
    const [meta] = await db.select().from(schema.datasetMeta).limit(1);
    return {
      version: meta?.version ?? this.randomVersion(),
      updatedAt: meta?.updatedAt ?? new Date(),
    };
  }

  async getCatalogVersion(id: number) {
    const db = this.db.client;
    const [catalog] = await db
      .select({
        id: schema.catalogs.id,
        version: schema.catalogs.version,
        updatedAt: schema.catalogs.updatedAt,
      })
      .from(schema.catalogs)
      .where(eq(schema.catalogs.id, id))
      .limit(1);
    if (!catalog) throw new NotFoundException('Catalog not found');

    const dataset = await this.getDatasetVersion();
    return {
      catalogId: catalog.id,
      catalogVersion: catalog.version,
      catalogUpdatedAt: catalog.updatedAt,
      datasetVersion: dataset.version,
      datasetUpdatedAt: dataset.updatedAt,
    };
  }

  private randomVersion() {
    return randomBytes(8).toString('hex');
  }

  private async bumpDatasetVersion() {
    const db = this.db.client;
    await this.ensureDatasetMeta();
    const version = this.randomVersion();
    await db
      .update(schema.datasetMeta)
      .set({ version, updatedAt: new Date() })
      .where(eq(schema.datasetMeta.id, 1));
    return version;
  }

  async create(dto: CreateCatalogDto) {
    const db = this.db.client;
    const title = dto.title.trim();
    let code = dto.code?.trim();

    if (!title) {
      throw new BadRequestException('Title is required');
    }

    if (code && !(await this.isCatalogCodeAvailable(code))) {
      throw new BadRequestException('Catalog code already exists');
    }

    if (!code) {
      code = await this.generateUniqueCatalogCode(title);
    }

    const [created] = await db
      .insert(schema.catalogs)
      .values({
        code,
        title,
        type: dto.type,
      })
      .returning({
        id: schema.catalogs.id,
        code: schema.catalogs.code,
        title: schema.catalogs.title,
        type: schema.catalogs.type,
        version: schema.catalogs.version,
        updatedAt: schema.catalogs.updatedAt,
      });

    await this.bumpDatasetVersion();
    return created;
  }

  async findAll() {
    const db = this.db.client;
    const catalogs = await db
      .select({
        id: schema.catalogs.id,
        code: schema.catalogs.code,
        title: schema.catalogs.title,
        type: schema.catalogs.type,
        version: schema.catalogs.version,
        updatedAt: schema.catalogs.updatedAt,
      })
      .from(schema.catalogs)
      .orderBy(schema.catalogs.id);

    if (catalogs.length === 0) return [];
    const ids = catalogs.map((c) => c.id);
    const metaRows = await db
      .select({
        catalogId: schema.catalogMeta.catalogId,
        key: schema.catalogMeta.metaKey,
        value: schema.catalogMeta.metaValue,
      })
      .from(schema.catalogMeta)
      .where(inArray(schema.catalogMeta.catalogId, ids));

    const metaMap = new Map<number, Record<string, string>>();
    for (const row of metaRows) {
      if (!metaMap.has(row.catalogId)) metaMap.set(row.catalogId, {});
      metaMap.get(row.catalogId)![row.key] = row.value;
    }

    return catalogs.map((c) => ({
      ...c,
      meta: metaMap.get(c.id) ?? {},
    }));
  }

  async findOne(id: number) {
    const db = this.db.client;
    const [catalog] = await db
      .select({
        id: schema.catalogs.id,
        code: schema.catalogs.code,
        title: schema.catalogs.title,
        type: schema.catalogs.type,
        version: schema.catalogs.version,
        updatedAt: schema.catalogs.updatedAt,
      })
      .from(schema.catalogs)
      .where(eq(schema.catalogs.id, id))
      .limit(1);
    if (!catalog) throw new NotFoundException('Catalog not found');

    const metaRows = await db
      .select({
        key: schema.catalogMeta.metaKey,
        value: schema.catalogMeta.metaValue,
      })
      .from(schema.catalogMeta)
      .where(eq(schema.catalogMeta.catalogId, id));
    const meta: Record<string, string> = {};
    for (const row of metaRows) {
      meta[row.key] = row.value;
    }
    return { ...catalog, meta };
  }

  async update(id: number, dto: UpdateCatalogDto, updatedBy?: string) {
    const db = this.db.client;
    const [existing] = await db
      .select({ id: schema.catalogs.id })
      .from(schema.catalogs)
      .where(eq(schema.catalogs.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Catalog not found');

    const updates: Partial<typeof schema.catalogs.$inferInsert> = {};
    if (dto.code) updates.code = dto.code;
    if (dto.title) updates.title = dto.title;
    if (dto.type) updates.type = dto.type;
    if (updatedBy) updates.updatedBy = updatedBy;
    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.catalogs)
        .set({
          ...updates,
          updatedAt: new Date(),
          version: sql`${schema.catalogs.version} + 1`,
        })
        .where(eq(schema.catalogs.id, id));
    }

    if (dto.meta && Object.keys(dto.meta).length > 0) {
      const now = new Date();
      for (const [key, value] of Object.entries(dto.meta)) {
        await db
          .insert(schema.catalogMeta)
          .values({
            catalogId: id,
            metaKey: key,
            metaValue: value,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [schema.catalogMeta.catalogId, schema.catalogMeta.metaKey],
            set: { metaValue: value, updatedAt: now },
          });
      }
    }

    if (dto.deleteKeys && dto.deleteKeys.length > 0) {
      await db
        .delete(schema.catalogMeta)
        .where(
          and(
            eq(schema.catalogMeta.catalogId, id),
            inArray(schema.catalogMeta.metaKey, dto.deleteKeys)
          )
        );
    }

    await this.bumpDatasetVersion();
    return this.findOne(id);
  }

  async remove(id: number) {
    const db = this.db.client;
    const res = await db
      .delete(schema.catalogs)
      .where(eq(schema.catalogs.id, id))
      .returning({
        id: schema.catalogs.id,
      });
    if (res.length === 0) throw new NotFoundException('Catalog not found');
    await this.bumpDatasetVersion();
    return { ok: true, id };
  }

  private async isCatalogCodeAvailable(code: string): Promise<boolean> {
    const db = this.db.client;
    const [existing] = await db
      .select({ id: schema.catalogs.id })
      .from(schema.catalogs)
      .where(eq(schema.catalogs.code, code))
      .limit(1);
    return !existing;
  }

  private async generateUniqueCatalogCode(title: string): Promise<string> {
    const base = this.slugify(title || 'catalog');
    let candidate = base;
    let suffix = 1;
    while (!(await this.isCatalogCodeAvailable(candidate))) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  private slugify(value: string): string {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/--+/g, '-')
        .slice(0, 64) || 'catalog'
    );
  }
}
