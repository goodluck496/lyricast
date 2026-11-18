import { TestBed } from '@angular/core/testing';
import { SongPageSelectService, SPLIT_PARTS_COUNT } from './song-page-select.service';
import { SongTextLayoutService } from '../../services/song-text-layout.service';
import { ISong, LyricTypeEnum } from '@lyri-cast/entities';

describe('SongPageSelectService', () => {
  let service: SongPageSelectService;

  const mockSong: ISong = {
    number: 1,
    title: 'Тестовая песня',
    key: 'test-song',
    keySignature: 'D',
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
          { index: 0, rangeIndex: '0', globalSongIndex: 0, text: 'Строка 1' },
          { index: 1, rangeIndex: '1', globalSongIndex: 1, text: 'Строка 2' },
          { index: 2, rangeIndex: '2', globalSongIndex: 2, text: 'Строка 3' },
          { index: 3, rangeIndex: '3', globalSongIndex: 3, text: 'Строка 4' },
        ],
      },
      {
        uniqId: 'ch1',
        sectionTitle: 'Припев 1',
        type: LyricTypeEnum.CHORUS,
        songId: '1',
        splitLinesCount: 0,
        lines: [
          { index: 0, rangeIndex: '0', globalSongIndex: 0, text: 'Припев строка 1' },
          { index: 1, rangeIndex: '1', globalSongIndex: 1, text: 'Припев строка 2' },
        ],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SongPageSelectService, SongTextLayoutService],
    });
    service = TestBed.inject(SongPageSelectService);
    service.selectSong(mockSong);
  });

  it('should normalize uniqId by stripping _split_ suffix via getLyricBaseId', () => {
    expect(service.getLyricBaseId('c1')).toBe('c1');
    expect(service.getLyricBaseId('c1_split_2')).toBe('c1');
    expect(service.getLyricBaseId('section_123_split_4_extra')).toBe('section_123');
  });

  it('should not split lyrics when global split is NONE and no overrides are set', () => {
    service.setSplitCountValue(SPLIT_PARTS_COUNT.NONE);
    const lyrics = service.selectedLyricsForCasting();
    expect(lyrics[0].lines.length).toBe(1);
    expect(lyrics[1].lines.length).toBe(1);
    expect(service.isLyricSplit(lyrics[0])).toBe(false);
  });

  it('should split couplet into 2 parts when global split is 2', () => {
    service.setSplitCountValue(SPLIT_PARTS_COUNT.TWO);
    const lyrics = service.selectedLyricsForCasting();
    expect(lyrics[0].lines.length).toBe(2);
    expect(service.isLyricSplit(lyrics[0])).toBe(true);
  });

  it('should give individual block override priority over global split setting', () => {
    // 1. Глобальное деление = 2. Отключаем деление для куплета 1.
    service.setSplitCountValue(SPLIT_PARTS_COUNT.TWO);
    service.setLyricSplitOverride('c1', false);

    let lyrics = service.selectedLyricsForCasting();
    // c1 не должен делиться (1 часть), несмотря на глобальный сплит = 2
    expect(lyrics[0].lines.length).toBe(1);
    expect(service.isLyricSplit(lyrics[0])).toBe(false);

    // 2. Глобальное деление = NONE. Включаем деление для припева.
    service.setSplitCountValue(SPLIT_PARTS_COUNT.NONE);
    service.setLyricSplitOverride('ch1', true);

    lyrics = service.selectedLyricsForCasting();
    // ch1 должен разделиться на 2 части
    expect(lyrics[1].lines.length).toBe(2);
    expect(service.isLyricSplit(lyrics[1])).toBe(true);
  });

  it('should emit splitChanged$ when split setting or override changes', () => {
    let emissions = 0;
    const sub = service.splitChanged$.subscribe(() => {
      emissions++;
    });

    service.setSplitCountValue(2);
    service.setLyricSplitOverride('c1', true);
    expect(emissions).toBe(2);

    sub.unsubscribe();
  });

  it('should restore overrides via setLyricSplitOverrides and clear via clearLyricSplitOverrides', () => {
    service.setLyricSplitOverrides({ c1: false, ch1: true });
    expect(service.getLyricSplitOverride('c1')).toBe(false);
    expect(service.getLyricSplitOverride('ch1')).toBe(true);

    service.clearLyricSplitOverrides();
    expect(service.getLyricSplitOverride('c1')).toBeUndefined();
    expect(service.getLyricSplitOverride('ch1')).toBeUndefined();
  });

  it('should preserve active lyric line position when split recalculates', () => {
    service.setSplitCountValue(SPLIT_PARTS_COUNT.NONE);
    const initialLyrics = service.selectedLyricsForCasting();
    service.showPreview(true, initialLyrics[0], initialLyrics[0].lines[0]);

    // Включаем сплит для куплета c1
    service.setLyricSplitOverride('c1', true);

    const updatedLine = service.selectedLyricLine();
    expect(updatedLine).toBeTruthy();
    expect(updatedLine?.rangeIndex).toBe('0-1');
  });

  it('should update globalSongIndex of selected subsequent lyric line when a preceding block split changes', () => {
    service.setSplitCountValue(SPLIT_PARTS_COUNT.NONE);
    const initialLyrics = service.selectedLyricsForCasting();
    // При NONE: c1 = 1 слайд (globalSongIndex 0), ch1 = 1 слайд (globalSongIndex 1)
    expect(initialLyrics[1].lines[0].globalSongIndex).toBe(1);

    // Выбираем припев ch1 (второй блок)
    service.showPreview(true, initialLyrics[1], initialLyrics[1].lines[0]);
    expect(service.selectedLyricLine()?.globalSongIndex).toBe(1);

    // Включаем сплит для ПРЕДШЕСТВУЮЩЕГО блока (c1 делится на 2 части: 0 и 1)
    service.setLyricSplitOverride('c1', true);

    // У припева ch1 globalSongIndex должен сместиться на 2!
    const updatedLine = service.selectedLyricLine();
    expect(updatedLine).toBeTruthy();
    expect(updatedLine?.globalSongIndex).toBe(2);
    expect(service.getLyricBaseId(service.selectedLyric()?.uniqId ?? '')).toBe('ch1');
  });

  it('should sync selected lyric line globalSongIndex when setLyricSplitOverrides is called', () => {
    service.setSplitCountValue(SPLIT_PARTS_COUNT.NONE);
    const initialLyrics = service.selectedLyricsForCasting();
    // Выбираем припев ch1 (начальный globalSongIndex = 1)
    service.showPreview(true, initialLyrics[1], initialLyrics[1].lines[0]);
    expect(service.selectedLyricLine()?.globalSongIndex).toBe(1);

    // Восстанавливаем оверрайды, где c1 разделен
    service.setLyricSplitOverrides({ c1: true });

    // globalSongIndex должен обновиться до 2
    expect(service.selectedLyricLine()?.globalSongIndex).toBe(2);
  });
});
