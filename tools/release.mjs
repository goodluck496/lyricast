import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { stdin, stdout, exit, argv } from 'node:process';
import { spawn } from 'node:child_process';
import path from 'node:path';

const versionTypes = ['major', 'minor', 'patch'];

function bumpVersion(version, releaseType) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    throw new Error(`Неподдерживаемый формат версии: ${version}`);
  }

  const parts = match.slice(1).map((part) => Number(part));
  const [major, minor, patch] = parts;

  if (releaseType === 'major') {
    return `${major + 1}.0.0`;
  }

  if (releaseType === 'minor') {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

async function askReleaseType() {
  const cliReleaseType = argv[2]?.trim().toLowerCase();

  if (cliReleaseType && versionTypes.includes(cliReleaseType)) {
    return cliReleaseType;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    stdout.write('Какую версию повысить?\n');
    stdout.write('1. patch\n');
    stdout.write('2. minor\n');
    stdout.write('3. major\n');

    const answer = (await rl.question('Выбор [patch/minor/major]: '))
      .trim()
      .toLowerCase();

    if (!answer) {
      return 'patch';
    }

    const selectedType =
      answer === '1'
        ? 'patch'
        : answer === '2'
          ? 'minor'
          : answer === '3'
            ? 'major'
            : answer;

    if (!versionTypes.includes(selectedType)) {
      throw new Error(
        'Неверный выбор. Используйте один из вариантов: patch, minor, major.'
      );
    }

    return selectedType;
  } finally {
    rl.close();
  }
}

async function updatePackageVersion(releaseType) {
  const packageJsonPath = path.resolve('package.json');
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);
  const currentVersion = packageJson.version;
  const nextVersion = bumpVersion(currentVersion, releaseType);

  packageJson.version = nextVersion;

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  stdout.write(`Версия обновлена: ${currentVersion} -> ${nextVersion}\n`);
}

function runPublishScript() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell',
      ['-ExecutionPolicy', 'Bypass', '-File', path.resolve('tools/publish-release.ps1')],
      { stdio: 'inherit' }
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`publish-release.ps1 завершился с кодом ${code ?? 'null'}`));
    });
  });
}

try {
  const releaseType = await askReleaseType();

  await updatePackageVersion(releaseType);
  await runPublishScript();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  exit(1);
}
