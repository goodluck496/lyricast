import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SongComponent } from './song.component';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { SongTextLayoutService } from '../../services/song-text-layout.service';
import { ISong, LyricTypeEnum } from '@lyri-cast/entities';

if (typeof (global as any).ResizeObserver === 'undefined') {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe('SongComponent', () => {
  let component: SongComponent;
  let fixture: ComponentFixture<SongComponent>;

  const mockSong: ISong = {
    number: 1,
    title: 'Тестовая песня',
    key: 'test',
    keySignature: 'C',
    author: 'Автор',
    meta: [],
    bookName: { fileKey: 'book1', humanName: 'Книга 1' },
    lyrics: [
      {
        uniqId: 'c1',
        sectionTitle: 'Куплет 1',
        type: LyricTypeEnum.COUPLET,
        songId: '1',
        splitLinesCount: 0,
        lines: [
          { index: 0, rangeIndex: '0', globalSongIndex: 0, text: 'Первая строка' },
          { index: 1, rangeIndex: '1', globalSongIndex: 1, text: 'Вторая строка' },
        ],
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SongComponent],
      providers: [SongPageSelectService, SongTextLayoutService],
    }).compileComponents();

    fixture = TestBed.createComponent(SongComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('song', mockSong);
    fixture.detectChanges();
  });

  it('should create and display lyric items', () => {
    expect(component).toBeTruthy();
    expect(component.lyrics().length).toBe(1);
    expect(component.lyrics()[0].sectionTitle).toBe('Куплет 1');
  });

  it('should start editing and pre-populate editableBlock with couplet text', () => {
    const mouseEvent = new MouseEvent('click');
    const lyric = component.lyrics()[0];
    component.startEditing(0, lyric, mouseEvent);

    expect(component.editingLyricIndex()).toBe(0);
    const el = component.editableBlock()?.nativeElement;
    expect(el).toBeTruthy();
    expect(el?.innerText).toBe('Первая строка\nВторая строка');
  });

  it('should cancel editing without saving', () => {
    const mouseEvent = new MouseEvent('click');
    component.startEditing(0, component.lyrics()[0], mouseEvent);
    expect(component.editingLyricIndex()).toBe(0);

    component.cancelEditing();
    expect(component.editingLyricIndex()).toBeNull();
  });

  it('should save edited lines and emit songUpdated', () => {
    const mouseEvent = new MouseEvent('click');
    component.startEditing(0, component.lyrics()[0], mouseEvent);

    const el = component.editableBlock()?.nativeElement;
    if (el) {
      el.innerText = 'Измененная строка 1\r\n\r\nИзмененная строка 2\n  \n';
    }

    let emittedSong: ISong | null = null;
    component.songUpdated.subscribe((song) => {
      emittedSong = song;
    });

    component.saveEditing(0);

    expect(component.editingLyricIndex()).toBeNull();
    expect(emittedSong).toBeTruthy();
    expect(emittedSong!.lyrics[0].lines.length).toBe(2);
    expect(emittedSong!.lyrics[0].lines[0].text).toBe('Измененная строка 1');
    expect(emittedSong!.lyrics[0].lines[1].text).toBe('Измененная строка 2');
    expect(component.lyrics()[0].lines[0].text).toContain('Измененная строка 1');
    expect(component.lyrics()[0].lines[0].text).toContain('Измененная строка 2');
  });

  it('should save properly even when song object is frozen (read-only)', () => {
    const frozenSong = Object.freeze({
      ...mockSong,
      lyrics: Object.freeze(
        mockSong.lyrics.map((l) =>
          Object.freeze({
            ...l,
            lines: Object.freeze(l.lines.map((line) => Object.freeze({ ...line }))),
          })
        )
      ),
    }) as unknown as ISong;

    fixture.componentRef.setInput('song', frozenSong);
    fixture.detectChanges();

    const mouseEvent = new MouseEvent('click');
    component.startEditing(0, component.lyrics()[0], mouseEvent);

    const el = component.editableBlock()?.nativeElement;
    if (el) {
      el.innerText = 'Замороженная строка 1\nЗамороженная строка 2';
    }

    let emittedSong: ISong | null = null;
    component.songUpdated.subscribe((song) => {
      emittedSong = song;
    });

    expect(() => component.saveEditing(0)).not.toThrow();
    expect(emittedSong).toBeTruthy();
    expect(emittedSong!.lyrics[0].lines[0].text).toBe('Замороженная строка 1');
    expect(emittedSong!.lyrics[0].lines[1].text).toBe('Замороженная строка 2');
    expect(component.lyrics()[0].lines[0].text).toContain('Замороженная строка 1');
  });

  it('should not erase couplet if editor was empty on save', () => {
    const mouseEvent = new MouseEvent('click');
    component.startEditing(0, component.lyrics()[0], mouseEvent);

    const el = component.editableBlock()?.nativeElement;
    if (el) {
      el.innerText = '   \n  \n  ';
    }

    let emittedSong: ISong | null = null;
    component.songUpdated.subscribe((song) => {
      emittedSong = song;
    });

    component.saveEditing(0);

    expect(component.editingLyricIndex()).toBeNull();
    expect(emittedSong).toBeNull();
  });

  it('should handle Escape and Ctrl+Enter keyboard shortcuts', () => {
    const mouseEvent = new MouseEvent('click');
    component.startEditing(0, component.lyrics()[0], mouseEvent);

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    const cancelSpy = jest.spyOn(component, 'cancelEditing');
    component.onEditorKeydown(escEvent, 0);
    expect(cancelSpy).toHaveBeenCalled();

    component.startEditing(0, component.lyrics()[0], mouseEvent);
    const saveSpy = jest.spyOn(component, 'saveEditing');
    const ctrlEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
    component.onEditorKeydown(ctrlEnterEvent, 0);
    expect(saveSpy).toHaveBeenCalledWith(0, ctrlEnterEvent);
  });
});
