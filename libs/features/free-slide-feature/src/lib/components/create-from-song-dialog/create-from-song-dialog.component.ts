import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { BehaviorSubject, debounceTime, filter, map, of, switchMap, tap } from 'rxjs';
import { IShortSong, ISong, ISongBookName, Lyric, LyricTypeEnum, PresentationDto, SlideDto, SerializedState } from '@lyri-cast/entities';
import { ListBoxComponent, IUiLyriItemInList, IUiLyriListItem, AssetStorageService, ListBoxTemplates } from '@lyri-cast/form';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'lyri-create-from-song-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DropdownModule,
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
  insertChorusBetweenVerses = signal(true);

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
        font: 'Inter',
        weight: 'regular',
        align: 'center',
        valign: 'middle',
        lineHeight: 1.15,
        min: 24,
        max: 240,
        color: 0xffffff,
        colorHex: '#ffffff',
      },
      padding: 40,
      bgFillColor: 0x111826,
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

    const slides = await this.buildSlidesFromSong(song, this.insertChorusBetweenVerses());

    const dto: PresentationDto = {
      title: `Песня: ${song.title}`,
      slides,
    };
    this.create.emit(dto);
  }

  private async buildSlidesFromSong(song: ISong, insertChorus: boolean): Promise<SlideDto[]> {
    // Identify chorus once
    const chorus = song.lyrics.find((l) => l.type === LyricTypeEnum.CHORUS);

    const parts: { name: string; html: string }[] = [];
    let coupletIndex = 0;

    for (const l of song.lyrics) {
      if (l.type === LyricTypeEnum.COUPLET) {
        coupletIndex++;
        parts.push({ name: `Куплет ${coupletIndex}`, html: this.toHtml(l) });
        if (insertChorus && chorus) {
          parts.push({ name: `Припев`, html: this.toHtml(chorus) });
        }
      } else if (l.type === LyricTypeEnum.CHORUS && !insertChorus) {
        // If not inserting automatically, keep original order
        parts.push({ name: `Припев`, html: this.toHtml(l) });
      } else if (l.type !== LyricTypeEnum.PUBLIC && l.type !== LyricTypeEnum.END) {
        parts.push({ name: l.sectionTitle || 'Часть', html: this.toHtml(l) });
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

  private async generatePreview(title: string, html: string): Promise<string | undefined> {
    // Simple canvas-based preview
    const width = 1280;
    const height = 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // Background
    ctx.fillStyle = '#111826';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#90caf9';
    ctx.font = 'bold 40px Inter, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 60, 50);

    // Content
    ctx.fillStyle = '#ffffff';
    ctx.font = '32px Inter, Arial, sans-serif';

    const lines = html.split('<br />');
    let y = 120;
    const lineHeight = 44;
    const maxWidth = width - 120;
    for (const ln of lines) {
      y = this.drawWrappedText(ctx, ln, 60, y, maxWidth, lineHeight);
      y += 4;
      if (y > height - 40) break;
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
