import Database from 'better-sqlite3';
import * as fs from 'fs';

const DB_PATH = 'RST+.SQLite3'; // Укажи путь к файлу SQLite
// const DB_PATH = 'KYB.SQLite3'; // Укажи путь к файлу SQLite
const OUTPUT_FILE = 'bible.xml'; // Имя выходного JSON-файла
// const OUTPUT_FILE = 'kyb-bible.xml'; // Имя выходного JSON-файла

// Функция для удаления всех XML-тегов и их содержимого из текста
function cleanText(text: string): string {
  // Удаляем теги <S> и их содержимое, например <S>7225</S>
  text = text.replace(/<S>.*?<\/S>/g, ''); // Удаляет все <S>...</S> с содержимым

  /// Удаляем нестандартные теги (которые не являются стандартными HTML), например <pb>, <t>
  text = text.replace(/<(?!\/?(i|b|u|em|strong|sub|sup|a)[^>]*>)[^>]+>/g, ''); // Разрешаем только стандартные HTML теги

  // Удаляем одиночные теги, например <pb/>
  text = text.replace(/<[^>]+\/>/g, '');

  // Удаляем <t> и </t> (содержимое сохраняем)
  text = text.replace(/<t>/g, '').replace(/<\/t>/g, '');
  text = text.replace(/<j>/g, '').replace(/<\/j>/g, '');
  text = text
    .replace(/<i>/g, '<span style="font-style: italic;">')
    .replace(/<\/i>/g, '</span>');

  return text.trim(); // Убираем пробелы в начале и в конце
}

try {
  const db = new Database(DB_PATH, { fileMustExist: true });

  // Получаем все книги
  const info = db.prepare('SELECT * FROM info ').all();
  const desc: any = info.find((el: any) => el.name === 'description')!;
  const translateName = desc.value;

  const books = db.prepare('SELECT * FROM books ORDER BY book_number').all();

  const OLD_TESTAMENT_BOOKS = 39;
  // Разделение книг по заветам
  const oldTestamentBooks = books.filter(
    (book: any, index: number) => index + 1 <= OLD_TESTAMENT_BOOKS
  );
  const newTestamentBooks = books.filter(
    (book: any, index: number) => index + 1 > OLD_TESTAMENT_BOOKS
  );

  // Первые 39 книг — Ветхий Завет
  function generateTestamentXml(testamentName: string, books: any[]) {
    let xml = `\t<testament name="${testamentName}">\n`;

    books.forEach((book, index) => {
      // Получаем все стихи для данной книги
      const verses = db
        .prepare(
          'SELECT * FROM verses WHERE book_number = ? ORDER BY chapter, verse'
        )
        .all(book.book_number);

      // Группировка стихов по главам
      const chapters: Record<number, { number: number; text: string }[]> = {};
      verses.forEach(({ chapter, verse, text }: any) => {
        if (!chapters[chapter]) {
          chapters[chapter] = [];
        }
        chapters[chapter].push({ number: verse, text: cleanText(text) });
      });

      // xml += `\t\t<book number="${book.book_number / 10}" short_name="${book.short_name}" long_name="${book.long_name}">\n`;
      xml += `\t\t<book number="${index + 1}" short_name="${
        book.short_name
      }" long_name="${book.long_name}">\n`;

      Object.entries(chapters).forEach(([chapter, verses]) => {
        xml += `\t\t\t<chapter number="${chapter}">\n`;
        verses.forEach(({ number, text }) => {
          xml += `\t\t\t\t<verse number="${number}">${text}</verse>\n`;
        });
        xml += `\t\t\t</chapter>\n`;
      });

      xml += `\t\t</book>\n`;
    });

    xml += `\t</testament>\n`;
    return xml;
  }

  // Генерация XML
  let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xmlContent += `<bible translation="${translateName}" status="Public Domain">\n`;
  xmlContent += generateTestamentXml('Old', oldTestamentBooks);
  xmlContent += generateTestamentXml('New', newTestamentBooks);
  xmlContent += `</bible>`;

  // Сохраняем XML-файл
  fs.writeFileSync(OUTPUT_FILE, xmlContent, 'utf8');
  console.log(`Файл ${OUTPUT_FILE} успешно создан!`);

  db.close();
} catch (error) {
  console.error('Ошибка работы с SQLite:', error);
}
