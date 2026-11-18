import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { BibleSearchResultComponent } from './bible-search-result.component';
import { BibleSearchService } from '../../bible-search.service';
import { BibleSearchDto, BibleVerse } from '@lyri-cast/entities';
import {
  selectSelectedBook,
  selectSelectedChapter,
  selectSelectedPath,
} from '@lyri-cast/bible-store';

if (typeof (global as any).ResizeObserver === 'undefined') {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function createMockVerse(
  bookId: number,
  chapterId: number,
  number: number,
  text: string
): BibleVerse {
  return {
    contentType: 'line',
    bookId,
    chapterId,
    number,
    text,
    path: [String(bookId), String(chapterId), String(number)],
    prev: {
      contentType: 'line',
      bookId,
      chapterId,
      number: number - 1,
      path: [],
      bookChanged: false,
      chapterChanged: false,
    },
    next: {
      contentType: 'line',
      bookId,
      chapterId,
      number: number + 1,
      path: [],
      bookChanged: false,
      chapterChanged: false,
    },
  };
}

describe('BibleSearchResultComponent', () => {
  let component: BibleSearchResultComponent;
  let fixture: ComponentFixture<BibleSearchResultComponent>;
  let mockStore: MockStore;
  let searchResultSubject: BehaviorSubject<BibleSearchDto>;

  const mockSearchResult: BibleSearchDto = {
    search: 'свет',
    sections: [
      {
        bookId: 1,
        bookShortName: 'Быт',
        chapterId: 1,
        content: createMockVerse(1, 1, 3, 'И сказал Бог: да будет свет. И стал свет.'),
      },
      {
        bookId: 2,
        bookShortName: 'Исх',
        chapterId: 10,
        content: createMockVerse(2, 10, 23, 'у всех же сынов Израилевых был свет в жилищах их.'),
      },
      {
        bookId: 1,
        bookShortName: 'Быт',
        chapterId: 2,
        content: createMockVerse(1, 2, 1, 'Так совершены небо и земля.'),
      },
    ],
  };

  beforeEach(async () => {
    searchResultSubject = new BehaviorSubject<BibleSearchDto>(mockSearchResult);

    const mockBibleSearchService = {
      searchResult$: searchResultSubject,
      isLoading: () => false,
      search: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [BibleSearchResultComponent],
      providers: [
        provideMockStore({
          selectors: [
            {
              selector: selectSelectedBook,
              value: { number: 1, name: 'Бытие', shortName: 'Быт' },
            },
            {
              selector: selectSelectedChapter,
              value: { number: 2 },
            },
            {
              selector: selectSelectedPath,
              value: ['1', '2', '1'],
            },
          ],
        }),
        provideRouter([]),
        { provide: BibleSearchService, useValue: mockBibleSearchService },
      ],
    }).compileComponents();

    mockStore = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(BibleSearchResultComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component', () => {
    expect(component).toBeTruthy();
  });

  it('should prioritize the current book as the first tab and mark isCurrentScope', async () => {
    const result = await firstValueFrom(component.groupedResult$);
    expect(result).toBeTruthy();
    expect(result?.groups.length).toBe(2);

    const firstGroup = result!.groups[0];
    expect(firstGroup.bookId).toBe(1);
    expect(firstGroup.isCurrentScope).toBe(true);

    const secondGroup = result!.groups[1];
    expect(secondGroup.bookId).toBe(2);
    expect(secondGroup.isCurrentScope).toBeUndefined();
  });

  it('should sort sections inside the current book group so current chapter sections are first', async () => {
    const result = await firstValueFrom(component.groupedResult$);
    const book1Group = result!.groups[0];

    expect(book1Group.sections[0].chapterId).toBe(2);
    expect(book1Group.sections[1].chapterId).toBe(1);
  });

  it('should reset selectedTabIndex to 0 when searchResult emits', () => {
    component.selectedTabIndex = 1;
    searchResultSubject.next({
      search: 'мир',
      sections: [],
    });
    expect(component.selectedTabIndex).toBe(0);
  });
});
