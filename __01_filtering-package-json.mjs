import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { globby } from 'globby'; // можно добавить в devDependencies, но и так уже присутсвуют в других пакетах;
import { parse } from '@babel/parser'; // можно добавить в devDependencies, но и так уже присутсвуют в других пакетах
import _traverse from '@babel/traverse'; // можно добавить в devDependencies, но и так уже присутсвуют в других пакетах;

const traverse = _traverse.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 *
 * Назначение файла - копирование backend зависимостей из package.json,
 * в новый package.json собранного backend проекта, т.к. приложение состоит из electron и nodejs
 * чтобы electron не запускал в одном потоке работу с БД и т.д. решено было отделить backend от electron
 *
 * при сборке electron, сборщик может копировать package.json, но делает это коряво и с лишними зависимостями,*
 *
 *
 *
 * GPT подсказал скрипт считывания зависимостей для NestJS приложения
 * @type {string}
 *
 * @returns {Promise<void>}
 */
const CONFIG = {
  includePatterns: [
    'apps/backend/**/*.{ts,js}',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts',
    '!src/main.ts', // Исключаем точку входа
  ],
  nestSpecificLibs: [
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/config',
    '@nestjs/typeorm',
    '@nestjs/mongoose',
    'tslib',
  ],
};

function promisifyReadFile(file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data.toString());
    });
  });
}

async function findNestDependencies() {
  const [files, packageJson] = await Promise.all([
    globby(CONFIG.includePatterns),
    promisifyReadFile('package.json').then(JSON.parse),
  ]);

  const usedDependencies = new Set(CONFIG.nestSpecificLibs); // Автоматически включаем основные Nest-модули
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  // Анализ файлов
  for (const file of files) {
    try {
      const content = await promisifyReadFile(file);
      await analyzeNestFile(content, allDependencies, usedDependencies);
    } catch (err) {
      console.warn(`⚠️ Пропускаем ${file}:`, err.message.split('\n')[0]);
    }
  }

  // Генерация нового package.json
  const filteredPackage = {
    name: packageJson.name,
    version: packageJson.version,
    dependencies: {},
  };

  Array.from(usedDependencies).forEach((dep) => {
    if (allDependencies[dep]) {
      filteredPackage.dependencies[dep] = allDependencies[dep];
    }
  });

  const backendDistPath = path.join(__dirname, 'dist', 'apps', 'backend');
  const outputPath = path.join(backendDistPath, 'package.json');
  fs.writeFileSync(outputPath, JSON.stringify(filteredPackage, null, 2));

  console.log(`🏗️ Найдено зависимостей NestJS: ${usedDependencies.size}
📂 Результат: ${outputPath}
  `);
}

async function analyzeNestFile(content, allDeps, usedDeps) {
  const ast = parse(content, {
    sourceType: 'module',
    plugins: [
      'typescript',
      ['decorators', { decoratorsBeforeExport: true }], // Важно для декораторов Nest
      'classProperties',
    ],
  });

  traverse(ast, {
    // Стандартные импорты
    ImportDeclaration(path) {
      const source = path.node.source.value;
      if (!source) return;

      // Обработка node_modules-зависимостей
      if (!source.startsWith('.') && !source.startsWith('/')) {
        const libName = resolveNestLibName(source);
        if (allDeps[libName]) usedDeps.add(libName);
      }
    },

    // Динамические импорты
    CallExpression(path) {
      if (path.node.callee.name === 'require') {
        const source = path.node.arguments[0]?.value;
        if (source && !source.startsWith('.')) {
          const libName = resolveNestLibName(source);
          if (allDeps[libName]) usedDeps.add(libName);
        }
      }
    },

    // Декораторы NestJS
    Decorator(path) {
      if (path.node.expression.callee?.name === 'Module') {
        usedDeps.add('@nestjs/common');
      }
    },
  });
}

function resolveNestLibName(importPath) {
  // Обработка scoped-пакетов (@nestjs/...)
  if (importPath.startsWith('@')) {
    return importPath.split('/').slice(0, 2).join('/');
  }
  return importPath.split('/')[0];
}

findNestDependencies().catch((err) => {
  console.error('💥 Ошибка:', err);
  process.exit(1);
});
