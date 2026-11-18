import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { BibleChapterComponent } from './bible-chapter.component';
import { BibleOnboardingService } from '../../services/bible-onboarding.service';
import { BibleChapterSection, BibleVerse } from '@lyri-cast/entities';
import {
  BibleActions,
  selectSelectedBibleVerse,
  selectSelectedPath,
  selectSelectedPrevOrNextVerse,
  selectSelectedVersesRange,
} from '@lyri-cast/bible-store';

if (typeof (global as any).ResizeObserver === 'undefined') {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function createMockVerse(
  number: number,
  text: string,
  bookId = 1,
  chapterId = 1
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

describe('BibleChapterComponent', () => {
  let component: BibleChapterComponent;
  let fixture: ComponentFixture<BibleChapterComponent>;
  let mockStore: MockStore;

  const mockSections: BibleChapterSection[] = [
    {
      heading: 'Начало',
      bookId: 1,
      chapterId: 1,
      content: [
        createMockVerse(1, 'В начале сотворил Бог небо и землю.'),
        createMockVerse(2, 'Земля же была безвидна и пуста.'),
        createMockVerse(3, 'И сказал Бог: да будет свет. И стал свет.'),
        createMockVerse(4, 'И увидел Бог свет, что он хорош.'),
      ],
    },
  ];

  beforeEach(async () => {
    const mockBibleOnboarding = {
      tryNext: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [BibleChapterComponent],
      providers: [
        provideMockStore({
          selectors: [
            { selector: selectSelectedBibleVerse, value: null },
            { selector: selectSelectedPrevOrNextVerse, value: null },
            { selector: selectSelectedPath, value: [] },
            { selector: selectSelectedVersesRange, value: null },
          ],
        }),
        { provide: BibleOnboardingService, useValue: mockBibleOnboarding },
      ],
    }).compileComponents();

    mockStore = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(BibleChapterComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sections', mockSections);
    fixture.detectChanges();
  });

  it('should create component', () => {
    expect(component).toBeTruthy();
  });

  it('should control floating search bar visibility on hover, focus, or non-empty query', () => {
    expect(component.isFloatingBarVisible()).toBe(false);

    component.isHovered.set(true);
    expect(component.isFloatingBarVisible()).toBe(true);

    component.isHovered.set(false);
    expect(component.isFloatingBarVisible()).toBe(false);

    component.isSearchFocused.set(true);
    expect(component.isFloatingBarVisible()).toBe(true);

    component.isSearchFocused.set(false);
    expect(component.isFloatingBarVisible()).toBe(false);

    component.searchQuery.set('свет');
    expect(component.isFloatingBarVisible()).toBe(true);
  });

  it('should detect number queries correctly', () => {
    component.searchQuery.set('3');
    expect(component.isNumberQuery()).toBe(true);

    component.searchQuery.set(' 14 ');
    expect(component.isNumberQuery()).toBe(true);

    component.searchQuery.set('свет');
    expect(component.isNumberQuery()).toBe(false);

    component.searchQuery.set('3а');
    expect(component.isNumberQuery()).toBe(false);
  });

  it('should select verse on number query input', () => {
    const dispatchSpy = jest.spyOn(mockStore, 'dispatch');
    component.onSearchInput('3');

    expect(dispatchSpy).toHaveBeenCalledWith(
      BibleActions.selectBibleVerse(mockSections[0].content[2])
    );
  });

  it('should filter text matches and navigate with nextMatch and prevMatch', () => {
    component.onSearchInput('свет');
    const matches = component.textMatches();

    expect(matches.length).toBe(2);
    expect(matches[0].number).toBe(3);
    expect(matches[1].number).toBe(4);
    expect(component.activeMatchIndex()).toBe(0);
    expect(component.currentMatchDisplayIndex()).toBe(1);

    component.nextMatch();
    expect(component.activeMatchIndex()).toBe(1);
    expect(component.currentMatchDisplayIndex()).toBe(2);

    component.nextMatch();
    expect(component.activeMatchIndex()).toBe(0);
    expect(component.currentMatchDisplayIndex()).toBe(1);

    component.prevMatch();
    expect(component.activeMatchIndex()).toBe(1);

    component.clearSearch();
    expect(component.searchQuery()).toBe('');
    expect(component.activeMatchIndex()).toBe(0);
    expect(component.textMatches().length).toBe(0);
  });

  it('should handle keyboard navigation on Enter, Shift+Enter and Escape', () => {
    component.onSearchInput('свет');
    expect(component.activeMatchIndex()).toBe(0);

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    jest.spyOn(enterEvent, 'preventDefault');
    component.onSearchKeydown(enterEvent);
    expect(enterEvent.preventDefault).toHaveBeenCalled();
    expect(component.activeMatchIndex()).toBe(1);

    const shiftEnterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
    });
    jest.spyOn(shiftEnterEvent, 'preventDefault');
    component.onSearchKeydown(shiftEnterEvent);
    expect(component.activeMatchIndex()).toBe(0);

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    jest.spyOn(escEvent, 'preventDefault');
    component.onSearchKeydown(escEvent);
    expect(component.searchQuery()).toBe('');
  });

  it('should automatically start search on alphanumeric window keydown when not in input', () => {
    const dispatchSpy = jest.spyOn(mockStore, 'dispatch');

    // 1. Typing a letter triggers search
    const letterEvent = new KeyboardEvent('keydown', {
      key: 'с',
      bubbles: true,
      cancelable: true,
    });
    jest.spyOn(letterEvent, 'preventDefault');
    component.onWindowKeydown(letterEvent);

    expect(letterEvent.preventDefault).toHaveBeenCalled();
    expect(component.searchQuery()).toBe('с');
    expect(component.isFloatingBarVisible()).toBe(true);

    // 2. Modifier key (e.g. Ctrl+C) should be ignored
    const ctrlEvent = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    jest.spyOn(ctrlEvent, 'preventDefault');
    component.onWindowKeydown(ctrlEvent);
    expect(ctrlEvent.preventDefault).not.toHaveBeenCalled();
    expect(component.searchQuery()).toBe('с');

    // 3. Special non-character key (e.g. F5 or ArrowDown) should be ignored
    const arrowEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    jest.spyOn(arrowEvent, 'preventDefault');
    component.onWindowKeydown(arrowEvent);
    expect(arrowEvent.preventDefault).not.toHaveBeenCalled();

    // 4. Typing while focused on an input should be ignored by the window listener
    const inputEl = document.createElement('input');
    document.body.appendChild(inputEl);
    const inputTargetEvent = new KeyboardEvent('keydown', {
      key: 'а',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(inputTargetEvent, 'target', { value: inputEl });
    jest.spyOn(inputTargetEvent, 'preventDefault');
    component.onWindowKeydown(inputTargetEvent);
    expect(inputTargetEvent.preventDefault).not.toHaveBeenCalled();
    expect(component.searchQuery()).toBe('с');
    document.body.removeChild(inputEl);

    // 5. Typing a digit triggers number search and selects verse
    component.clearSearch();
    const digitEvent = new KeyboardEvent('keydown', {
      key: '3',
      bubbles: true,
      cancelable: true,
    });
    jest.spyOn(digitEvent, 'preventDefault');
    component.onWindowKeydown(digitEvent);
    expect(digitEvent.preventDefault).toHaveBeenCalled();
    expect(component.searchQuery()).toBe('3');
    expect(component.isNumberQuery()).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      BibleActions.selectBibleVerse(mockSections[0].content[2])
    );
  });
});
