import { TestBed } from '@angular/core/testing';
import { SongOverrideService } from './song-override.service';
import { SongUsageApiService } from '@lyri-cast/data-access-song-usage';
import { of } from 'rxjs';
import { ISong, Lyric, LyricTypeEnum } from '@lyri-cast/entities';

describe('SongOverrideService', () => {
  let service: SongOverrideService;
  let apiMock: {
    getOverride: jest.Mock;
    saveOverride: jest.Mock;
    deleteOverride: jest.Mock;
    getBookOverrides: jest.Mock;
  };

  beforeEach(() => {
    apiMock = {
      getOverride: jest.fn(),
      saveOverride: jest.fn(),
      deleteOverride: jest.fn(),
      getBookOverrides: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        SongOverrideService,
        {
          provide: SongUsageApiService,
          useValue: apiMock,
        },
      ],
    });

    service = TestBed.inject(SongOverrideService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get override lyrics array when present', (done) => {
    const mockLyrics: Lyric[] = [
      {
        uniqId: 'u1',
        sectionTitle: 'Куплет 1',
        type: LyricTypeEnum.COUPLET,
        songId: '1',
        splitLinesCount: 0,
        lines: [{ index: 0, rangeIndex: '0', globalSongIndex: 0, text: 'Строка' }],
      },
    ];

    apiMock.getOverride.mockReturnValue(
      of({
        songBookKey: 'book',
        songNumber: 1,
        songKey: 'book:1',
        lyrics: mockLyrics,
        updatedAt: '2026-01-01',
      })
    );

    service.getOverride('book', 1).subscribe((lyrics) => {
      expect(lyrics).toEqual(mockLyrics);
      expect(apiMock.getOverride).toHaveBeenCalledWith({
        songBookKey: 'book',
        songNumber: 1,
      });
      done();
    });
  });

  it('should return null when override is missing or invalid', (done) => {
    apiMock.getOverride.mockReturnValue(of(null));

    service.getOverride('book', 2).subscribe((lyrics) => {
      expect(lyrics).toBeNull();
      done();
    });
  });

  it('should save override with correct payload', (done) => {
    const mockSong: ISong = {
      id: 1,
      number: 42,
      title: 'Песня',
      key: 'pesni:42',
      keySignature: 'C',
      author: 'Автор',
      meta: [],
      bookName: { fileKey: 'pesni', humanName: 'Песни' },
      lyrics: [],
    };
    const mockLyrics: Lyric[] = [];

    apiMock.saveOverride.mockReturnValue(
      of({
        songBookKey: 'pesni',
        songNumber: 42,
        songKey: 'pesni:42',
        lyrics: mockLyrics,
        updatedAt: '2026-01-01',
      })
    );

    service.saveOverride(mockSong, mockLyrics).subscribe((result) => {
      expect(apiMock.saveOverride).toHaveBeenCalledWith({
        songBookKey: 'pesni',
        songNumber: 42,
        lyrics: mockLyrics,
      });
      expect(result.songKey).toBe('pesni:42');
      done();
    });
  });

  it('should save override with fallback bookKey when song.bookName is missing', (done) => {
    const mockSongWithoutBook = {
      id: 1,
      number: 42,
      title: 'Песня',
      key: 'pesni:42',
      keySignature: 'C',
      author: 'Автор',
      meta: [],
      lyrics: [],
    } as any;
    const mockLyrics: Lyric[] = [];

    apiMock.saveOverride.mockReturnValue(
      of({
        songBookKey: 'custom-book',
        songNumber: 42,
        songKey: 'custom-book:42',
        lyrics: mockLyrics,
        updatedAt: '2026-01-01',
      })
    );

    service.saveOverride(mockSongWithoutBook, mockLyrics, 'custom-book').subscribe((result) => {
      expect(apiMock.saveOverride).toHaveBeenCalledWith({
        songBookKey: 'custom-book',
        songNumber: 42,
        lyrics: mockLyrics,
      });
      expect(result.songKey).toBe('custom-book:42');
      done();
    });
  });

  it('should delete override', (done) => {
    apiMock.deleteOverride.mockReturnValue(of({ success: true }));

    service.deleteOverride('pesni', 42).subscribe((res) => {
      expect(apiMock.deleteOverride).toHaveBeenCalledWith({
        songBookKey: 'pesni',
        songNumber: 42,
      });
      expect(res.success).toBe(true);
      done();
    });
  });

  it('should get book overrides', (done) => {
    apiMock.getBookOverrides.mockReturnValue(of([1, 2, 3]));

    service.getBookOverrides('pesni').subscribe((res) => {
      expect(apiMock.getBookOverrides).toHaveBeenCalledWith('pesni');
      expect(res).toEqual([1, 2, 3]);
      done();
    });
  });
});
