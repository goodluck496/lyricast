import { Cheerio } from 'cheerio';

const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const fileName = 'kgz-song-full';
const filePath = path.resolve(__dirname, `./${fileName}.html`);

const html = fs.readFileSync(filePath, 'utf8');
console.log('content', html.length);

const $ = cheerio.load(html);

const PAGE_WRAP_SELECTOR = '.pf.w0.h0';
const PAGE_SELECTOR = '.c.x0.y1.w2.h0';

type Song = {
  title: string | null;
  pageNumber: string | null;
  number: string | null;
  rawContent: string[];
  content: {
    type: 'couplet' | 'pripev';
    number: number;
    lyric: string[];
  }[];
  status: 'init' | 'complete' | 'build';
};

const songs: Song[] = [];
let currentSong: Song = {
  status: 'init',
  title: null,
  number: null,
  pageNumber: null,
  rawContent: [],
  content: [],
};

function getTitle(title: Cheerio<any>): { number: string; title: string } {
  const titleRaw: string = $(title).text().trim() ?? 'empty-title';
  const songNumber =
    titleRaw.match(new RegExp('\\d+'))?.[0] ?? 'not-found-number';

  return {
    number: songNumber,
    title: titleRaw,
  };
}

function checkRowWithTitle(el: Cheerio<any>, count: number): boolean {
  function check(_el: Cheerio<any>): boolean {
    return (
      _el.hasClass('ls1 ws5') ||
      _el.hasClass('ls1c wsc') ||
      _el.hasClass('sc0 ls1c wsc') ||
      _el.hasClass('sc0 lsf0 ws2') ||
      _el.hasClass('sc0 ls204 ws41') ||
      _el.hasClass('sc0 ls93 ws24') ||
      _el.hasClass('sc0 ls1b9 ws2') ||
      _el.hasClass('sc0 ls57 ws1c') ||
      _el.hasClass('sc0 ls86 ws2') ||
      _el.hasClass('wsc') ||
      _el.hasClass('ws5 v3')
    );
  }

  return check($(el));
}

function findTitle(pageEl: Cheerio<any>): {
  takeParent: boolean;
  titleEl: Cheerio<any>;
} {
  const titleSelectors = [
    { clazz: '.ls1.ws5', takeParent: false },
    { clazz: '.ls1c.wsc', takeParent: false },
    { clazz: '.sc0.ls1c.wsc', takeParent: false },
    { clazz: '.ws5.v3', takeParent: true },
    { clazz: '.wsc.v11', takeParent: true },
    { clazz: '.sc0.lsf0.ws2', takeParent: false },
    { clazz: '.sc0.ls204.ws41', takeParent: false },
    { clazz: '.sc0.ls93.ws24', takeParent: false },
    { clazz: '.sc0.ls1b9.ws2', takeParent: false },
    { clazz: '.sc0.ls57.ws1c', takeParent: false },
    { clazz: '.sc0.ls86.ws2', takeParent: false },
    { clazz: '.wsc', takeParent: false },
  ];

  const result = {
    takeParent: false,
    titleEl: pageEl.find(titleSelectors[titleSelectors.length - 1].clazz),
  };

  for (const title of titleSelectors) {
    const wrapper = pageEl.find(title.clazz);
    if (wrapper.length) {
      return {
        takeParent: title.takeParent,
        titleEl: wrapper,
      };
    }
  }
  return result;
}

function pushSong(song: Song) {
  if (song.status !== 'complete') {
    return;
  }
  songs.push(JSON.parse(JSON.stringify(song)));
  currentSong = {
    status: 'init',
    title: null,
    number: null,
    rawContent: [],
    content: [],
    pageNumber: null,
  };
}

function fillSong(
  song: Song,
  nextWrap: Cheerio<any>,
  typeNext: 'title' | 'row',
  takeNextParent = false
): Song {
  if (typeNext == 'title') {
    const { title, number } = getTitle(nextWrap);
    if (!song.title && !song.number) {
      song.title = title;
      song.number = number;
    }
  }

  if (typeNext == 'row') {
    if ($(nextWrap).text().trim()) {
      song.rawContent.push($(nextWrap).text().trim());
    }
  }

  let count = 0;
  let reachNewTitle = false;
  let next = takeNextParent ? $(nextWrap).parent().next() : $(nextWrap).next();

  let skipWhile = false;
  song.status = 'build';
  while (count < 100 && !skipWhile) {
    song.rawContent.push(next.text().trim());

    next = $(next).next();
    reachNewTitle = checkRowWithTitle(next, 0);
    skipWhile = next && reachNewTitle;
    count++;
  }

  song.rawContent = song.rawContent.filter((el) => el.trim());

  if (song.rawContent.length && reachNewTitle) {
    song.status = 'complete';
  }

  return song;
}

function findNotEmptyRow(el: Cheerio<any>) {
  const isEmpty = !$(el).text().trim().length;
  if (isEmpty) {
    return findNotEmptyRow($(el).next());
  }

  return el;
}

function findMissingNumbers(data: Song[]) {
  const numbers = data
    .map((item) => +item['number']!)
    .filter((el) => !!el)
    .sort((a, b) => a - b);
  const missingNumbers: number[] = [];

  for (let i = 1; i < numbers.length; i++) {
    let expected = numbers[i - 1] + 1;
    while (expected < numbers[i]) {
      missingNumbers.push(expected);
      expected++;
    }
  }

  return missingNumbers;
}

let takeParent = false;
$(PAGE_WRAP_SELECTOR).each((i: number, pageEl: Cheerio<unknown>) => {
  // const page = $(PAGE_SELECTOR, i);
  const page = $(pageEl);
  if (!page) {
    return;
  }

  const data = findTitle(page);
  takeParent = data.takeParent;
  const titleWrappers = data.titleEl;

  if (titleWrappers.length > 1) {
    //сначала дорабатываем с BUILD  статусом
    if (currentSong.status === 'build') {
      //конец песни в начале страницы и несколько заголовков на странице
      const pageContent = $(pageEl).find(PAGE_SELECTOR);
      const pageRows = $('.t', pageContent);
      const firstPageRow = pageRows[0];

      if (!firstPageRow) {
        console.log('not found first row!');
        return;
      }

      const isPageRunFromTitle = checkRowWithTitle(firstPageRow, 0);
      if (isPageRunFromTitle) {
        if (currentSong.status === 'build') {
          currentSong.status = 'complete';
          pushSong(currentSong);
        }
      } else {
        fillSong(currentSong, firstPageRow, 'row');
        pushSong(currentSong);
      }
    }

    if (currentSong.status === 'init') {
      fillSong(currentSong, titleWrappers[0], 'title');
      pushSong(currentSong);
    }

    if (currentSong.status === 'init') {
      const newSong = fillSong(currentSong, titleWrappers[1], 'title');
      pushSong(newSong);
    }
  } else if (titleWrappers.length) {
    if (currentSong.status === 'build') {
      const pageContent = $(pageEl).find(PAGE_SELECTOR).last();
      const pageRows = $('.t', pageContent);
      const firstPageRow = findNotEmptyRow(pageRows[0]);

      if (!firstPageRow) {
        console.log('not found first row!');
        return;
      }

      const isPageRunFromTitle = checkRowWithTitle(firstPageRow, 0);
      if (isPageRunFromTitle) {
        if (currentSong.status === 'build') {
          currentSong.status = 'complete';
          pushSong(currentSong);
        }
      } else {
        fillSong(currentSong, firstPageRow, 'row');
        pushSong(currentSong);
      }
    }

    if (currentSong.status === 'init') {
      fillSong(currentSong, titleWrappers[0], 'title', takeParent);
      if (takeParent) {
        takeParent = false;
      }
      pushSong(currentSong);
    }
  } else {
    if (currentSong.status === 'build') {
      const pageContent = $(pageEl).find(PAGE_SELECTOR);
      const pageRows = $('.t', pageContent);
      const firstPageRow = pageRows[0];

      if (!firstPageRow) {
        console.log('not found first row!');
        return;
      }

      fillSong(currentSong, firstPageRow, 'row');
      pushSong(currentSong);
    }
  }
});

const missingSongsIds = findMissingNumbers(songs);
songs.push(
  ...missingSongsIds.map(
    (el) =>
      ({
        number: `${el}`,
        rawContent: [],
        content: [],
        status: 'build',
        pageNumber: null,
        title: null,
      } satisfies Song)
  )
);
songs.sort((a, b) => +(a?.number || 0) - +(b?.number || 0));

for (const song of songs) {
  const firstRow = song.rawContent[0];
  if (firstRow && firstRow.includes('Mecнь')) {
    song.title += ` ${firstRow}`;
    song.rawContent.shift();
  }
}


try {
  const result = JSON.stringify(songs.slice(50,), null, 2);
  fs.writeFileSync(path.resolve(`./${fileName}.json`), result, 'utf8');
  console.log('READY!');
} catch (err) {
  console.error(err);
}
