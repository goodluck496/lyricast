import { Injectable } from '@angular/core';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';

export interface MetaFormState {
  title: string;
  description: string;
  language: string;
  coverImage: string;
}

@Injectable({ providedIn: 'root' })
export class MetaDialogService {
  constructor(private api: SongsDictionaryApiService) {}

  createForm(db: SongDatabaseInfoDto | null): MetaFormState {
    return {
      title: db?.title ?? '',
      description: db?.description ?? '',
      language: db?.language ?? '',
      coverImage: db?.coverImage ?? '',
    };
  }

  buildPreview(db: SongDatabaseInfoDto | null, form: MetaFormState): SongDatabaseInfoDto | null {
    if (!db) return null;
    return {
      ...db,
      title: form.title || db.title,
      description: form.description || db.description,
      language: form.language || db.language,
      coverImage: form.coverImage || db.coverImage,
    };
  }

  fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  saveMeta(dbId: string, db: SongDatabaseInfoDto, form: MetaFormState) {
    const fileKey = db.fileKey || db.db;
    return this.api.updateBookMeta(dbId, fileKey, {
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      language: form.language.trim() || null,
      coverImage: form.coverImage || null,
    });
  }
}
