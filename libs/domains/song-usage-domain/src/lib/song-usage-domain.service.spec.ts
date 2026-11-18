import { Test, TestingModule } from '@nestjs/testing';
import { SongUsageDomainService } from './song-usage-domain.service';
import { DB_PROVIDER_TOKEN } from './db/database.provider';

describe('SongUsageDomainService overrides (mocked db)', () => {
  let service: SongUsageDomainService;
  let fakeStore: Map<string, any>;

  beforeEach(async () => {
    fakeStore = new Map();

    const mockDb: any = {
      insert: jest.fn(() => ({
        values: jest.fn((val: any) => ({
          onConflictDoUpdate: jest.fn(({ set }: any) => ({
            run: jest.fn(() => {
              fakeStore.set(val.songKey, { ...val, ...set });
            }),
          })),
        })),
      })),
      select: jest.fn((fields?: any) => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            get: jest.fn(() => {
              for (const row of fakeStore.values()) {
                return row;
              }
              return null;
            }),
            all: jest.fn(() => {
              const res: any[] = [];
              for (const row of fakeStore.values()) {
                res.push(fields ? { songNumber: row.songNumber } : row);
              }
              return res;
            }),
          })),
        })),
      })),
      delete: jest.fn(() => ({
        where: jest.fn(() => ({
          run: jest.fn(() => {
            fakeStore.clear();
          }),
        })),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SongUsageDomainService,
        {
          provide: DB_PROVIDER_TOKEN,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<SongUsageDomainService>(SongUsageDomainService);
  });

  it('should save and map override properly', () => {
    const mockLyrics = [{ text: 'Строка 1' }];
    const res = service.saveOverride({
      songBookKey: 'book-1',
      songNumber: 15,
      lyrics: mockLyrics,
    });

    expect(res.songBookKey).toBe('book-1');
    expect(res.songNumber).toBe(15);
    expect(res.songKey).toBe('book-1:15');
    expect(res.lyrics).toEqual(mockLyrics);
  });

  it('should return null when getOverride finds no record', () => {
    const mockDbEmpty: any = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            get: jest.fn(() => null),
          })),
        })),
      })),
    };

    const emptyService = new SongUsageDomainService(mockDbEmpty);
    const res = emptyService.getOverride({ songBookKey: 'b', songNumber: 1 });
    expect(res).toBeNull();
  });

  it('should return mapped record when getOverride finds row', () => {
    const mockDbWithRow: any = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            get: jest.fn(() => ({
              songKey: 'b:1',
              songBookKey: 'b',
              songNumber: 1,
              lyricsJson: JSON.stringify([{ text: 'Тест' }]),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            })),
          })),
        })),
      })),
    };

    const rowService = new SongUsageDomainService(mockDbWithRow);
    const res = rowService.getOverride({ songBookKey: 'b', songNumber: 1 });
    expect(res).toEqual({
      songKey: 'b:1',
      songBookKey: 'b',
      songNumber: 1,
      lyrics: [{ text: 'Тест' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('should delete override', () => {
    const mockDbDelete: any = {
      delete: jest.fn(() => ({
        where: jest.fn(() => ({
          run: jest.fn(),
        })),
      })),
    };

    const deleteService = new SongUsageDomainService(mockDbDelete);
    const res = deleteService.deleteOverride({ songBookKey: 'b', songNumber: 1 });
    expect(res).toEqual({ success: true });
  });

  it('should get book overrides list', () => {
    const mockDbOverrides: any = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            all: jest.fn(() => [{ songNumber: 5 }, { songNumber: 12 }]),
          })),
        })),
      })),
    };

    const listService = new SongUsageDomainService(mockDbOverrides);
    const res = listService.getBookOverrides('b');
    expect(res).toEqual([5, 12]);
  });
});
