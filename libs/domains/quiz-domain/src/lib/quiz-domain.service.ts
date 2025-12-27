import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { QuizSummaryDto, SaveQuizPayloadDto } from '@lyri-cast/entities';

@Injectable()
export class QuizDomainService {
  private getQuizzesDir(): string {
    const userDataPath = process.env['USER_DATA_PATH'];

    if (!userDataPath) {
      throw new Error('USER_DATA_PATH is not configured');
    }

    return path.join(userDataPath, 'quizzes');
  }

  private getLegacyQuizzesDir(): string | null {
    const userDataPath = process.env['USER_DATA_PATH'];
    if (!userDataPath) {
      return null;
    }

    const legacyRoot = path.dirname(userDataPath);
    return path.join(legacyRoot, 'quizzes');
  }

  async listQuizzes(): Promise<QuizSummaryDto[]> {
    try {
      const primaryDir = this.getQuizzesDir();
      const legacyDir = this.getLegacyQuizzesDir();

      const dirs = [primaryDir, legacyDir]
        .filter((d): d is string => !!d)
        .filter((d, idx, arr) => arr.indexOf(d) === idx)
        .filter((d) => fs.existsSync(d));

      const collected: QuizSummaryDto[] = [];
      const seenIds = new Set<string>();

      for (const dir of dirs) {
        const files = await fs.promises.readdir(dir);

        const items = await Promise.all(
          files
            .filter((f) => f.toLowerCase().endsWith('.json'))
            .map(async (file) => {
              const full = path.join(dir, file);

              try {
                const raw = await fs.promises.readFile(full, 'utf-8');
                const data = JSON.parse(raw) as any;
                const id = (data && data.id) || path.basename(file, '.json');
                const title = (data && data.title) || id;
                const date = (data && data.date) || '';

                return { id, title, date } as QuizSummaryDto;
              } catch {
                const id = path.basename(file, '.json');

                return { id, title: id, date: '' } as QuizSummaryDto;
              }
            })
        );

        for (const it of items) {
          if (!seenIds.has(it.id)) {
            seenIds.add(it.id);
            collected.push(it);
          }
        }
      }

      return collected;
    } catch {
      return [];
    }
  }

  async loadQuizById(id: string): Promise<SaveQuizPayloadDto | null> {
    if (!id) {
      return null;
    }

    const primaryDir = this.getQuizzesDir();
    const legacyDir = this.getLegacyQuizzesDir();

    const candidateFiles = [
      path.join(primaryDir, `${id}.json`),
      legacyDir ? path.join(legacyDir, `${id}.json`) : null,
    ].filter((p): p is string => !!p);

    for (const file of candidateFiles) {
      try {
        const raw = await fs.promises.readFile(file, 'utf-8');
        const data = JSON.parse(raw) as any;

        const dtoId = (data && data.id) || id;
        const title = (data && data.title) || dtoId;
        const date = (data && data.date) || undefined;

        // Поддержка двух форматов:
        // 1) Новый/DTO-подобный: { id, title, date, state: { teams, topics } }
        // 2) Legacy: { id, title, date, teams, topics }
        let state: any = null;
        if (data && data.state && typeof data.state === 'object') {
          state = data.state;
        } else {
          state = {
            teams: data?.teams ?? [],
            topics: data?.topics ?? [],
          };
        }

        return {
          id: dtoId,
          title,
          date,
          state,
        } as SaveQuizPayloadDto;
      } catch {
        // пробуем следующий путь
      }
    }

    return null;
  }

  async saveQuizAsNew(payload: SaveQuizPayloadDto): Promise<{ id: string }> {
    const dir = this.getQuizzesDir();
    await fs.promises.mkdir(dir, { recursive: true });

    const now = new Date();
    const isoSafe = now.toISOString().replace(/[:.]/g, '-');
    const id = (payload.id && String(payload.id)) || `quiz-${isoSafe}`;
    const file = path.join(dir, `${id}.json`);

    const title = payload.title?.trim() || id;
    const date = payload.date || now.toISOString().slice(0, 10);

    const body = {
      id,
      title,
      date,
      ...(payload.state || {}),
    };

    await fs.promises.writeFile(file, JSON.stringify(body, null, 2), 'utf-8');

    return { id };
  }

  async deleteQuiz(id: string): Promise<void> {
    if (!id) {
      return;
    }

    const dir = this.getQuizzesDir();
    const file = path.join(dir, `${id}.json`);

    try {
      await fs.promises.unlink(file);
    } catch {
      // ignore
    }
  }
}
