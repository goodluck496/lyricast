import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { BehaviorSubject, debounceTime, filter, map, of, switchMap, tap } from 'rxjs';
import { IShortSong, ISong, ISongBookName, Lyric, LyricTypeEnum, PresentationDto, SlideDto, SerializedState } from '@lyri-cast/entities';
import { ListBoxComponent, IUiLyriItemInList, IUiLyriListItem, AssetStorageService, ListBoxTemplates } from '@lyri-cast/form';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'lyri-create-from-song-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    CheckboxModule,
    ListBoxComponent,
    DialogModule,
  ],
  templateUrl: './create-from-song-dialog.component.html',
  styleUrl: './create-from-song-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateFromSongDialogComponent {
  private readonly songsApiService = inject(SongsApiService);
  private readonly assetStorage = inject(AssetStorageService);
  private readonly destroyRef = inject(DestroyRef);

  @Output() cancel = new EventEmitter<void>();
  @Output() create = new EventEmitter<PresentationDto>();

  isLoading = signal(false);
  // Chorus insertion is automatic if chorus exists in the song
  splitCount = signal<number | -1>(-1);
  splitOptions = [
    { label: 'Не делить', value: -1 as const },
    { label: '2', value: 2 as const },
    { label: '3', value: 3 as const },
    { label: '4', value: 4 as const },
  ];

  songBooks$ = this.songsApiService.getAllSongBooks();
  songBooksDict$ = this.songBooks$.pipe(
    map((data) =>
      data.map(
        (el) => ({ title: el.humanName, searchKey: el.fileKey, baseEntity: el }) as IUiLyriListItem<ISongBookName>
      )
    )
  );

  songBooksDict: IUiLyriListItem<ISongBookName>[] = [];

  selectedBook$ = new BehaviorSubject<IUiLyriListItem<ISongBookName> | null>(null);
  currentSongsList$ = new BehaviorSubject<IUiLyriItemInList<IShortSong>[]>([]);
  selectedSongControl = new FormControl<IUiLyriItemInList<IShortSong> | null>(null);
  selectedSong$ = new BehaviorSubject<IUiLyriItemInList<IShortSong> | null>(null);
  fullSong$ = new BehaviorSubject<ISong | null>(null);

  protected readonly ListBoxTemplates = ListBoxTemplates;

  constructor() {
    this.songBooksDict$.pipe(tap((d) => (this.songBooksDict = d))).subscribe();

    this.selectedBook$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter((b): b is IUiLyriListItem<ISongBookName> => !!b),
        tap(() => this.isLoading.set(true)),
        switchMap((value) => this.songsApiService.getAllSongsByBook(value.baseEntity)),
        map((data) => data.map((el) => ({ title: el.title, searchKey: String(el.number), baseEntity: el }) as IUiLyriItemInList<IShortSong>)),
        tap((songs) => {
          this.currentSongsList$.next(songs);
          this.isLoading.set(false);
          if (songs[0]) this.selectedSongControl.setValue(songs[0]);
        })
      )
      .subscribe();

    this.selectedSongControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => this.selectedSong$.next(val));

    // load full song when selection changes
    this.selectedSong$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        debounceTime(50),
        switchMap((itm) => {
          const book = this.selectedBook$.value;
          if (!book || !itm) return of(null);
          this.isLoading.set(true);
          return this.songsApiService.getSong(book.baseEntity, itm.baseEntity.number);
        }),
        tap(() => this.isLoading.set(false))
      )
      .subscribe((song) => this.fullSong$.next(song));
  }

  private buildSerializedContentFromHtml(html: string): SerializedState {
    // Scene defaults correspond to 16:9
    const sceneW = 1920;
    const sceneH = 1080;
    const padding = 40;

    const textNode = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      type: 'text' as const,
      x: 0,
      y: 0,
      width: sceneW,
      height: sceneH,
      rotation: 0,
      alpha: 1,
      textHtml: html,
      style: {
        font: 'Segoe UI',
        weight: 'regular',
        align: 'center',
        valign: 'middle',
        lineHeight: 1.15,
        min: 24,
        max: 240,
        color: 0xffff00,
        colorHex: '#ffff00',
      },
      padding: padding,
      bgFillColor: 0x000000,
    } as const;

    const state: SerializedState = {
      nodes: [textNode],
      zoom: 1,
      sceneBounds: { width: sceneW, height: sceneH },
      aspectRatio: '16:9',
    };
    return state;
  }

  onCancel() { this.cancel.emit(); }

  onSelectBook(book: IUiLyriListItem<ISongBookName>) {
    this.selectedBook$.next(book);
  }

  async onCreate() {
    const song = this.fullSong$.value;
    if (!song) return;

    const slides = await this.buildSlidesFromSong(song, true);

    const dto: PresentationDto = {
      title: `${song.number}. ${song.title}`,
      slides,
    };
    this.create.emit(dto);
  }

  private async buildSlidesFromSong(song: ISong, insertChorus: boolean): Promise<SlideDto[]> {
    // Identify chorus once
    const chorus = song.lyrics.find((l) => l.type === LyricTypeEnum.CHORUS);

    const parts: { name: string; html: string }[] = [];
    let coupletIndex = 0;

    const globalSplit = this.splitCount();

    const pushLyric = (l: Lyric, nameBase: string) => {
      const localSplit = (l as any).splitLinesCount as number | undefined;
      let effectiveSplit: number | -1 = -1;
      if (localSplit === 0) {
        // локальное правило "не делить"
        effectiveSplit = -1;
      } else if (typeof localSplit === 'number' && localSplit >= 2) {
        // локально явно задано деление
        effectiveSplit = Math.floor(localSplit);
      } else {
        // локально не задано — применяем глобальное, если оно >=2
        effectiveSplit = typeof globalSplit === 'number' && globalSplit >= 2 ? Math.floor(globalSplit) : -1;
      }
      const blocks = this.splitLyricIfNeeded(l, effectiveSplit);
      if (blocks.length <= 1) {
        parts.push({ name: nameBase, html: this.toHtml(l) });
      } else {
        blocks.forEach((html, i) => parts.push({ name: `${nameBase} (${i + 1}/${blocks.length})`, html }));
      }
    };

    for (let i = 0; i < song.lyrics.length; i++) {
      const l = song.lyrics[i];
      if (l.type === LyricTypeEnum.COUPLET) {
        coupletIndex++;
        pushLyric(l, `Куплет ${coupletIndex}`);
        if (insertChorus && chorus) {
          const next = song.lyrics[i + 1];
          // Вставляем припев ТОЛЬКО если следующим в исходной структуре не идёт припев
          if (!next || next.type !== LyricTypeEnum.CHORUS) {
            pushLyric(chorus, `Припев`);
          }
        }
      } else if (l.type === LyricTypeEnum.CHORUS) {
        // Если припев присутствует в исходной структуре — добавляем его один раз здесь
        pushLyric(l, `Припев`);
      } else if (l.type !== LyricTypeEnum.PUBLIC && l.type !== LyricTypeEnum.END) {
        pushLyric(l, l.sectionTitle || 'Часть');
      }
    }

    // Generate previews and map to SlideDto
    const slides: SlideDto[] = [];
    let idx = 0;
    for (const p of parts) {
      const content = this.buildSerializedContentFromHtml(p.html);
      const assetId = await this.generatePreview(p.name, p.html);
      slides.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        name: p.name,
        content: JSON.stringify(content),
        index: idx++,
        createdAt: Date.now(),
        previewAssetId: assetId || '',
        groupId: 0,
      });
    }
    return slides;
  }

  private toHtml(lyric: Lyric): string {
    return lyric.lines.join('<br />');
  }

  private splitLyricIfNeeded(lyric: Lyric, split: number | -1): string[] {
    const arr = lyric.lines;
    if (split === -1 || arr.length <= 1) return [this.toHtml(lyric)];
    const parts = Math.min(Math.max(2, Math.floor(split)), arr.length);
    const prepared = arr.map((text, i) => ({ text, i }));
    const buckets: typeof prepared[] = [];
    const base = Math.floor(arr.length / parts);
    let rem = arr.length % parts;
    let s = 0;
    for (let p = 0; p < parts; p++) {
      const e = s + base + (rem > 0 ? 1 : 0);
      buckets.push(prepared.slice(s, e));
      s = e;
      if (rem > 0) rem--;
    }
    return buckets.map((lines) => lines.map((l) => l.text).join('<br />'));
  }

  private async generatePreview(title: string, html: string): Promise<string | undefined> {
    const width = 1920;
    const height = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffff00';
    ctx.textBaseline = 'alphabetic';
    const padding = 40;
    const boxW = width - padding * 2;
    const boxH = height - padding * 2;

    let fontSize = 120;
    const min = 24;
    const lineHeightK = 1.15;
    const measureWrapped = (size: number) => {
      ctx.font = `${size}px Segoe UI, Arial, sans-serif`;
      const words = html.replace(/<br \/>/g, '\n').split(/\s+/);
      const lines: string[] = [];
      let line = '';
      for (const w of words) {
        if (w.includes('\n')) {
          const parts = w.split('\n');
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const test = (line + ' ' + part).trim();
            if (ctx.measureText(test).width > boxW && line) {
              lines.push(line);
              line = part;
            } else {
              line = test;
            }
            if (i < parts.length - 1) {
              lines.push(line);
              line = '';
            }
          }
        } else {
          const test = (line + ' ' + w).trim();
          if (ctx.measureText(test).width > boxW && line) {
            lines.push(line);
            line = w;
          } else {
            line = test;
          }
        }
      }
      if (line) lines.push(line);
      return { lines, height: lines.length * size * lineHeightK };
    };

    while (fontSize >= min) {
      const m = measureWrapped(fontSize);
      if (m.height <= boxH) {
        const startY = padding + (boxH - m.height) / 2 + fontSize; // first baseline
        ctx.font = `${fontSize}px Segoe UI, Arial, sans-serif`;
        ctx.textAlign = 'center';
        let y = startY;
        for (const ln of m.lines) {
          ctx.fillText(ln, width / 2, Math.round(y));
          y += fontSize * lineHeightK;
        }
        break;
      }
      fontSize -= 4;
    }

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return undefined;
    return await this.assetStorage.saveAsset(blob, 'image/jpeg');
  }

  private drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): number {
    const words = text.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
    return y + lineHeight;
  }
}
