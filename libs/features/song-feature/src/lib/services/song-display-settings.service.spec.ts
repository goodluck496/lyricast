import { TestBed } from '@angular/core/testing';
import { SongDisplaySettingsService } from './song-display-settings.service';
import {
  SaveSongDisplaySettingsDto,
  SongDisplaySettingsDto,
  SongUsageApiService,
} from '@lyri-cast/data-access-song-usage';
import { of } from 'rxjs';
import { ISong } from '@lyri-cast/entities';
import { DEFAULT_CASTING_APPEARANCE } from '@lyri-cast/common-browser';

describe('SongDisplaySettingsService', () => {
  let service: SongDisplaySettingsService;
  let apiMock: {
    saveSettings: jest.Mock;
    getSettings: jest.Mock;
  };

  const mockSong: ISong = {
    number: 42,
    title: 'Тест',
    key: 'test-key',
    keySignature: 'C',
    author: 'Автор',
    meta: [],
    bookName: { fileKey: 'book-1', humanName: 'Книга 1' },
    lyrics: [],
  };

  beforeEach(() => {
    apiMock = {
      saveSettings: jest.fn(),
      getSettings: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        SongDisplaySettingsService,
        {
          provide: SongUsageApiService,
          useValue: apiMock,
        },
      ],
    });

    service = TestBed.inject(SongDisplaySettingsService);
  });

  it('should include lyricSplitOverrides in appearance when saving', (done) => {
    const overrides = { c1: false, ch1: true };
    const savedDto: SongDisplaySettingsDto = {
      songBookKey: 'book-1',
      songNumber: 42,
      appearanceSchemaVersion: 1,
      appearance: {},
      splitPartsCount: 2,
      updatedAt: new Date().toISOString(),
    };
    apiMock.saveSettings.mockReturnValue(of(savedDto));

    service
      .save(mockSong, DEFAULT_CASTING_APPEARANCE, 2, false, overrides)
      .subscribe(() => {
        expect(apiMock.saveSettings).toHaveBeenCalled();
        const callArg: SaveSongDisplaySettingsDto =
          apiMock.saveSettings.mock.calls[0][0];
        expect(callArg.appearance).toMatchObject({
          lyricSplitOverrides: { c1: false, ch1: true },
        });
        done();
      });
  });

  it('should restore lyricSplitOverrides from appearance correctly', (done) => {
    const dto: SongDisplaySettingsDto = {
      songBookKey: 'book-1',
      songNumber: 42,
      splitPartsCount: 2,
      appearanceSchemaVersion: 1,
      updatedAt: new Date().toISOString(),
      appearance: {
        ...DEFAULT_CASTING_APPEARANCE,
        fitTextAutoWrapEnabled: true,
        lyricSplitOverrides: {
          c1: false,
          ch1: true,
          invalid: 'string-value',
        },
      },
    };
    apiMock.getSettings.mockReturnValue(of(dto));

    service.restore(mockSong).subscribe((snapshot) => {
      expect(snapshot).toBeTruthy();
      expect(snapshot?.splitPartsCount).toBe(2);
      expect(snapshot?.fitTextAutoWrapEnabled).toBe(true);
      expect(snapshot?.lyricSplitOverrides).toEqual({
        c1: false,
        ch1: true,
      });
      done();
    });
  });

  it('should return empty lyricSplitOverrides if appearance has none or is invalid', (done) => {
    const dto: SongDisplaySettingsDto = {
      songBookKey: 'book-1',
      songNumber: 42,
      splitPartsCount: null,
      appearanceSchemaVersion: 1,
      updatedAt: new Date().toISOString(),
      appearance: {
        ...DEFAULT_CASTING_APPEARANCE,
      },
    };
    apiMock.getSettings.mockReturnValue(of(dto));

    service.restore(mockSong).subscribe((snapshot) => {
      expect(snapshot?.lyricSplitOverrides).toEqual({});
      done();
    });
  });
});
