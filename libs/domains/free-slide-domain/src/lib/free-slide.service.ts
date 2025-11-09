import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PresentationDto } from '@lyri-cast/entities';
import { DB_PROVIDER_TOKEN } from './db/database.provider';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { NewPresentation, NewSlide, presentations, slides } from './db/schema';
import { v4 as uuidv4 } from 'uuid';
import { asc, eq, ilike, InferInsertModel } from 'drizzle-orm';

// This will be the return type for presentation with their slides
export type PresentationWithSlides = schema.Presentation & {
  slides: schema.Slide[];
};

@Injectable()
export class FreeSlideService {
  constructor(
    @Inject(DB_PROVIDER_TOKEN)
    private db: BetterSQLite3Database<typeof schema>
  ) {}

  async getAll(): Promise<PresentationWithSlides[]> {
    return this.db.query.presentations.findMany({
      with: {
        slides: {
          orderBy: [asc(slides.index)],
        },
      },
    });
  }

  async getById(id: string): Promise<PresentationWithSlides> {
    const presentation = await this.db.query.presentations.findFirst({
      where: eq(presentations.id, id),
      with: {
        slides: {
          orderBy: [asc(slides.index)],
        },
      },
    });

    if (!presentation) {
      throw new NotFoundException(`Presentation with ID ${id} not found`);
    }
    return presentation;
  }

  async create(data: PresentationDto): Promise<PresentationWithSlides> {
    return this.db.transaction((tx) => {
      const now = new Date();
      const presentationId = uuidv4();

      const newPresentation: NewPresentation = {
        id: presentationId,
        title: data.title,
        createdAt: now,
        updatedAt: now,
      };

      tx.insert(presentations).values(newPresentation).run();

      if (data.slides && data.slides.length > 0) {
        const newSlides: NewSlide[] = data.slides.map((slideDto, index) => ({
          id: uuidv4(),
          name: slideDto.name,
          content: slideDto.content,
          index: slideDto.index ?? index,
          presentationId: presentationId,
        }));
        tx.insert(slides).values(newSlides).run();
      }

      // Drizzle's transaction callback doesn't easily return the created entity with relations.
      // So, we fetch it manually after the transaction is expected to be successful.
      // This is a limitation/design choice in how drizzle-orm handles transactions.
      // To get the result, we must query it outside the transaction block or re-query inside before returning.
      // For simplicity, we'll just return the input data shaped as the expected output for now.
      // A better approach would be to re-fetch from the DB.

      const createdSlides: schema.Slide[] = (data.slides || []).map(
        (slideDto, index) => ({
          id: 'temp-id', // This is not the real ID
          name: slideDto.name,
          content: slideDto.content,
          index: slideDto.index ?? index,
          presentationId: presentationId,
          previewAssetId: slideDto.previewAssetId,
        })
      );

      return {
        ...newPresentation,
        slides: createdSlides,
      } as PresentationWithSlides;
    });
  }

  async update(
    id: string,
    data: Partial<PresentationDto>
  ): Promise<PresentationWithSlides> {
    // Ensure presentation exists to avoid FK failures on slides upsert
    const exists = await this.db.query.presentations.findFirst({
      where: eq(presentations.id, id),
    });
    if (!exists) {
      throw new NotFoundException(`Presentation with ID ${id} not found`);
    }

    this.db.transaction(
      (tx) => {
        // 1) Заголовок
        if (data.title != null) {
          tx.update(presentations)
            .set({ title: data.title, updatedAt: new Date() })
            .where(eq(presentations.id, id))
            .run();
        }

        // 2) Слайды
        const slidesToUpsert = data.slides ?? [];
        for (const s of slidesToUpsert) {
          if (!s?.id) continue;

          // Разделяем id и апдейтабельные поля
          const { id: slideId, ...rest } = s as {
            id: string;
            index?: number;
            name?: string;
            content?: string;
            previewAssetId?: string;
            groupId?: number;
            // createdAt?: number | Date; // если приходит — не трогаем в update
          };

          // Значения для вставки (insert)
          const insertValues: InferInsertModel<typeof slides> = {
            id: slideId,
            presentationId: id,
            name: rest.name ?? '',
            index: rest.index ?? 0,
            content: rest.content ?? '',
            previewAssetId: rest.previewAssetId ?? '',
            // groupId: rest.groupId ?? 0,
            // createdAt: createdAt ? new Date(createdAt) : new Date(),
            // updatedAt: new Date(),
          };

          // Набор для обновления (update) — без createdAt/id/presentationId
          const updateSet: Partial<InferInsertModel<typeof slides>> = {
            index: rest.index,
            name: rest.name,
            content: rest.content,
            previewAssetId: rest.previewAssetId,
            // groupId: rest.groupId,
            // updatedAt: new Date(),
          };

          tx.insert(slides)
            .values(insertValues)
            .onConflictDoUpdate({
              target: slides.id, // конфликт по PK
              set: updateSet, // что обновлять при конфликте
            })
            .run();
        }
      },
      { behavior: 'deferred' }
    );

    return this.getById(id);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    // Thanks to `onDelete: 'cascade'`, associated slides will be deleted automatically.
    const result = await this.db
      .delete(presentations)
      .where(eq(presentations.id, id))
      .run();
    return { success: result.changes > 0 };
  }

  async search(query: string): Promise<PresentationWithSlides[]> {
    // This search is basic. It finds presentations where the title matches,
    // or where they have slides whose content matches.
    // A more advanced implementation would use a dedicated full-text search index.
    const results = await this.db.query.presentations.findMany({
      where: ilike(presentations.title, `%${query}%`),
      with: {
        slides: {
          orderBy: [asc(slides.index)],
        },
      },
    });

    const presentationsWithMatchingSlides =
      await this.db.query.presentations.findMany({
        with: {
          slides: {
            where: ilike(slides.content, `%${query}%`),
            orderBy: [asc(slides.index)],
          },
        },
      });

    // Combine and deduplicate results
    const allResults = [...results, ...presentationsWithMatchingSlides];
    const uniqueResults = new Map<string, PresentationWithSlides>();
    allResults.forEach((p) => {
      if (p.slides.length > 0) {
        // ensure we only add presentations that have the slide content
        uniqueResults.set(p.id, p);
      }
    });

    return Array.from(uniqueResults.values());
  }

  async getTransitionSettings(id: string): Promise<any> {
    const presentation = await this.db.query.presentations.findFirst({
      where: eq(presentations.id, id),
    });
    if (!presentation) {
      throw new NotFoundException(`Presentation with ID ${id} not found`);
    }
    const raw = (presentation as any).transitionSettings as string | null | undefined;
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async setTransitionSettings(id: string, settings: any): Promise<{ success: boolean }> {
    const exists = await this.db.query.presentations.findFirst({ where: eq(presentations.id, id) });
    if (!exists) {
      throw new NotFoundException(`Presentation with ID ${id} not found`);
    }
    const raw = JSON.stringify(settings ?? {});
    const result = await this.db
      .update(presentations)
      .set({ transitionSettings: raw as any, updatedAt: new Date() })
      .where(eq(presentations.id, id))
      .run();
    return { success: result.changes > 0 };
  }
}

/*
import { Inject, Injectable } from '@nestjs/common';
import { FreeSlide, FreeSlideDto } from '@lyri-cast/entities';
import { DB_PROVIDER_TOKEN } from './db/database.provider';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { freeSlides, NewFreeSlideEntity } from './db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

@Injectable()
export class FreeSlideService {
  constructor(
    @Inject(DB_PROVIDER_TOKEN)
    private db: BetterSQLite3Database<typeof schema>
  ) {}

  async getAll(): Promise<FreeSlide[]> {
    return this.db.select().from(freeSlides).all();
  }

  async getById(id: string): Promise<FreeSlide | null> {
    const result = await this.db.select().from(freeSlides).where(eq(freeSlides.id, id)).get();
    return result || null;
  }

  async create(data: Omit<FreeSlideDto, 'id'>): Promise<FreeSlide> {
    const now = Date.now();
    const newSlide: NewFreeSlideEntity = {
      ...data,
      id: uuidv4(),
      createdAtTime: now,
      updatedAtTime: now,
    };

    const result = await this.db.insert(freeSlides).values(newSlide).returning().get();
    return result;
  }

  async update(id: string, data: Partial<Omit<FreeSlideDto, 'id'>>): Promise<FreeSlide | null> {
    const now = Date.now();
    const updated = await this.db
      .update(freeSlides)
      .set({ ...data, updatedAtTime: now })
      .where(eq(freeSlides.id, id))
      .returning()
      .get();

    return updated || null;
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const result = await this.db.delete(freeSlides).where(eq(freeSlides.id, id)).run();
    return { success: result.changes > 0 };
  }

  async search(query: string): Promise<FreeSlide[]> {
      const lowerQuery = query.toLowerCase();
      const allSlides = await this.getAll();
      // Full-text search is better here, but for now, a simple filter will do.
      return allSlides.filter(slide =>
        slide.name.toLowerCase().includes(lowerQuery) ||
        slide.htmlString.toLowerCase().includes(lowerQuery)
      );
  }
}
*/
