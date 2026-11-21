import { execSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Получает историю изменений версий в package.json из git log.
 */
function getVersionHistory() {
  try {
    const diffs = execSync('git log -p package.json', { encoding: 'utf8' });
    const lines = diffs.split('\n');
    let currentCommit = '';
    const history = [];

    for (const line of lines) {
      if (line.startsWith('commit ')) {
        currentCommit = line.split(' ')[1].trim();
      }
      const match = line.match(/^\+\s*"version":\s*"([^"]+)"/);
      if (match) {
        history.push({ commit: currentCommit, version: match[1] });
      }
    }
    return history;
  } catch {
    return [];
  }
}

/**
 * Преобразует входной аргумент (хэш, тег или версию вроде "2.9.0" / "v2.9.0") в валидный git-реф.
 */
function resolveRef(ref) {
  if (!ref) return null;
  const trimmed = ref.trim();

  // 1. Проверяем, понимает ли git этот ref напрямую (хэш, тег, ветка, HEAD~N)
  try {
    const resolved = execSync(`git rev-parse --verify "${trimmed}^{commit}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (resolved) return resolved;
  } catch {
    // Не является прямым git-рефом, возможно это версия вида "2.9.0" или "v2.9.0"
  }

  // 2. Ищем по версии в package.json истории
  const normVersion = trimmed.replace(/^v/i, '');
  const history = getVersionHistory();

  // Точное совпадение версии (например "2.9.0")
  const exactMatch = history.find((h) => h.version === normVersion);
  if (exactMatch) {
    return exactMatch.commit;
  }

  // Совпадение по префиксу (например "2.9" -> "2.9.0")
  const prefixMatch = history.find((h) => h.version.startsWith(normVersion));
  if (prefixMatch) {
    return prefixMatch.commit;
  }

  // 3. Поиск по коммитам изменения версий в git log
  try {
    const raw = execSync('git log --format="%H %s" -n 50 package.json', { encoding: 'utf8' });
    const match = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .find((l) => l.toLowerCase().includes(normVersion));
    if (match) {
      return match.split(' ')[0];
    }
  } catch {
    //
  }

  return trimmed;
}

/**
 * Определяет диапазон коммитов для текущего релиза.
 */
function resolveCommitRange(customFrom, customTo = 'HEAD') {
  if (customFrom) {
    const resolvedFrom = resolveRef(customFrom);
    const resolvedTo = resolveRef(customTo) || customTo;
    return { from: resolvedFrom, to: resolvedTo, label: `${customFrom}..${customTo}` };
  }

  // 1. Ищем явные коммиты обновления версий в package.json (например "upd version" или "update version")
  try {
    const rawCommits = execSync('git log --format="%H %s" package.json', { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const releaseCommits = rawCommits.filter((line) =>
      /^(upd(ate)?\s+version|bump\s+version|release)/i.test(line.split(' ').slice(1).join(' '))
    );

    if (releaseCommits.length > 0) {
      const headCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      const firstReleaseHash = releaseCommits[0].split(' ')[0];

      // Проверяем, сколько коммитов между первым релизным коммитом и HEAD
      const commitsSinceFirst = execSync(`git rev-list --count ${firstReleaseHash}..HEAD`, { encoding: 'utf8' }).trim();

      // Если первый релизный коммит — это текущая версия 2.10.0 (буквально пару коммитов назад)
      if (Number(commitsSinceFirst) <= 3 && releaseCommits.length > 1) {
        const prevReleaseHash = releaseCommits[1].split(' ')[0];
        return {
          from: prevReleaseHash,
          to: 'HEAD',
          label: `${releaseCommits[1].split(' ').slice(1).join(' ')}..HEAD`,
        };
      }

      return {
        from: firstReleaseHash,
        to: 'HEAD',
        label: `${releaseCommits[0].split(' ').slice(1).join(' ')}..HEAD`,
      };
    }
  } catch {
    // игнорируем ошибку
  }

  // 2. Ищем по истории версий в diff package.json
  const history = getVersionHistory();
  if (history.length > 1) {
    // Берем коммит предыдущей версии
    const prev = history[history.length > 2 ? 2 : 1];
    return {
      from: prev.commit,
      to: 'HEAD',
      label: `v${prev.version}..HEAD`,
    };
  }

  // 3. Пытаемся найти последний git-тег
  try {
    const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
    if (lastTag) {
      return { from: lastTag, to: 'HEAD', label: `${lastTag}..HEAD` };
    }
  } catch {
    // теги не найдены
  }

  // 4. Fallback: последние 25 коммитов
  return { from: 'HEAD~25', to: 'HEAD', label: 'HEAD~25..HEAD' };
}

/**
 * Читает и парсит коммиты из диапазона git log.
 */
function getCommits(from, to) {
  try {
    const output = execSync(
      `git log ${from}..${to} --pretty=format:"%H%x1f%s%x1f%b%x1f%an%x1e"`,
      { encoding: 'utf8' }
    );

    const records = output.split('\x1e').map((r) => r.trim()).filter(Boolean);
    const commits = [];

    for (const r of records) {
      const [hash, subject, body, author] = r.split('\x1f');
      if (!subject) continue;

      // Пропускаем сугубо служебные коммиты смены версии
      if (/^(upd(ate)?\s+version|bump\s+version)/i.test(subject.trim())) {
        continue;
      }

      commits.push({
        hash: hash?.slice(0, 7) || '',
        subject: subject.trim(),
        body: body ? body.trim() : '',
        author: author ? author.trim() : '',
      });
    }

    return commits;
  } catch (error) {
    console.warn(`[changelog] Не удалось получить коммиты для ${from}..${to}:`, error.message);
    return [];
  }
}

/**
 * Группирует коммиты по смысловым категориям.
 */
function categorizeCommits(commits) {
  const categories = {
    bibles: { title: '📖 Переводы Библии и справочники', items: [] },
    updater: { title: '🔄 Автообновление (Auto-updater)', items: [] },
    auth: { title: '🔐 Авторизация и доступ (Google OAuth 2.0)', items: [] },
    search: { title: '🔍 Поиск и навигация', items: [] },
    features: { title: '🚀 Новые возможности', items: [] },
    fixes: { title: '🛠 Исправления и оптимизация', items: [] },
    other: { title: '📝 Прочие изменения', items: [] },
  };

  for (const c of commits) {
    const text = `${c.subject} ${c.body}`.toLowerCase();

    if (text.includes('updater') || text.includes('автообновл') || text.includes('update.events')) {
      categories.updater.items.push(c);
    } else if (text.includes('oauth') || text.includes('auth') || text.includes('owneremail') || text.includes('права доступ')) {
      categories.auth.items.push(c);
    } else if (text.includes('bible') || text.includes('библи') || text.includes('перевод') || text.includes('mybible')) {
      categories.bibles.items.push(c);
    } else if (text.includes('search') || text.includes('поиск') || text.includes('навигац') || text.includes('#lc-3')) {
      categories.search.items.push(c);
    } else if (c.subject.startsWith('feat') || text.includes('#lc-') || text.includes('реализован')) {
      categories.features.items.push(c);
    } else if (c.subject.startsWith('fix') || text.includes('исправлен') || text.includes('баг') || text.includes('bug')) {
      categories.fixes.items.push(c);
    } else {
      categories.other.items.push(c);
    }
  }

  return categories;
}

/**
 * Очищает заголовок коммита от префиксов (feat:, fix(scope): и т.д.) для чистого представления.
 */
function cleanSubject(subject) {
  return subject
    .replace(/^\[#lc-\d+\]\s*-\s*/i, '')
    .replace(/^(feat|fix|perf|refactor|chore|docs|style)(\([^)]+\))?:\s*/i, '')
    .trim();
}

/**
 * Извлекает пункты описания (bullet points) из тела коммита.
 */
function extractBodyBullets(body) {
  if (!body) return [];
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = [];

  for (const line of lines) {
    const cleaned = line.replace(/^[-*•]\s*/, '').trim();
    if (cleaned && cleaned.length > 5 && !cleaned.toLowerCase().startsWith('signed-off-by')) {
      bullets.push(cleaned);
    }
  }

  return bullets;
}

/**
 * Копирует текст в буфер обмена операционной системы.
 */
export function copyToClipboard(text) {
  try {
    if (process.platform === 'win32') {
      spawnSync('clip', { input: text, encoding: 'utf8' });
      return true;
    }
    if (process.platform === 'darwin') {
      spawnSync('pbcopy', { input: text, encoding: 'utf8' });
      return true;
    }
    spawnSync('xclip', ['-selection', 'clipboard'], { input: text, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Формирует итоговый Markdown ченжлога.
 */
export async function generateChangelog(options = {}) {
  const packageJsonPath = path.resolve('package.json');
  let version = options.version;

  if (!version) {
    try {
      const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
      version = JSON.parse(packageJsonRaw).version;
    } catch {
      version = 'latest';
    }
  }

  const range = resolveCommitRange(options.from, options.to);
  const commits = getCommits(range.from, range.to);

  if (commits.length === 0) {
    return `# LyriCast v${version} — Release Notes\n\n* Нет новых коммитов в диапазоне ${range.label || `${range.from}..${range.to}`}.`;
  }

  const categorized = categorizeCommits(commits);

  const lines = [];
  lines.push(`# LyriCast v${version} — Release Notes\n`);

  for (const [, cat] of Object.entries(categorized)) {
    if (cat.items.length === 0) continue;

    lines.push(`### ${cat.title}`);
    for (const c of cat.items) {
      const title = cleanSubject(c.subject);
      const bullets = extractBodyBullets(c.body);

      if (bullets.length > 0) {
        lines.push(`- **${title}**:`);
        for (const b of bullets) {
          lines.push(`  - ${b}`);
        }
      } else {
        lines.push(`- ${title}`);
      }
    }
    lines.push('');
  }

  const markdown = lines.join('\n').trim();

  // Сохраняем в RELEASE_NOTES.md
  try {
    await writeFile(path.resolve('RELEASE_NOTES.md'), `${markdown}\n`, 'utf8');
  } catch (err) {
    console.warn('[changelog] Не удалось записать RELEASE_NOTES.md:', err.message);
  }

  return markdown;
}

// Запуск напрямую из CLI: node tools/generate-changelog.mjs [fromRef] [toRef]
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const fromArg = process.argv[2];
  const toArg = process.argv[3];

  generateChangelog({ from: fromArg, to: toArg })
    .then((md) => {
      const copied = copyToClipboard(md);
      console.log('\n======================================================');
      console.log(`📋 RELEASE NOTES ${copied ? '(СКОПИРОВАНО В БУФЕР ОБМЕНА)' : ''}`);
      console.log('======================================================\n');
      console.log(md);
      console.log('\n======================================================');
      console.log('✅ Файл сохранён в RELEASE_NOTES.md');
      if (copied) {
        console.log('📋 Текст автоматически скопирован в буфер обмена!');
      }
      console.log('======================================================\n');
    })
    .catch((err) => {
      console.error('Ошибка генерации ченжлога:', err);
      process.exit(1);
    });
}
