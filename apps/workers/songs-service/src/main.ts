import fs from 'fs';
import path from 'path';
import 'reflect-metadata';
import { parentPort } from 'node:worker_threads';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { SongsDomainModule } from '@lyri-cast/songs-domain';

type Msg =
  | { t: 'ready'; port: number }
  | { t: 'error'; error: string; stack?: string }
  | { t: 'dispose' };

const log = new Logger('SongsWorker');

async function bootstrap() {
  try {
    const expressApp = express();
    const adapter = new ExpressAdapter(expressApp);
    log.log('Creating Nest app for SongsDomainModule...');
    const app = await NestFactory.create(SongsDomainModule, adapter, {
      logger: ['error', 'warn', 'log'],
      cors: false, // ходим через main-прокси
    });

    log.log('Nest app created, configuring pipes and shutdown hooks...');

    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true })
    );
    app.enableShutdownHooks();

    // слушаем СЛУЧАЙНЫЙ порт только на loopback
    log.log('Starting HTTP listener on random port...');
    await app.listen(0, '127.0.0.1');

    const addr = app.getHttpServer().address();
    const port = typeof addr === 'object' && addr ? (addr as any).port : 0;

    log.log(`HTTP on http://127.0.0.1:${port}`);
    parentPort?.postMessage({ t: 'ready', port } as Msg);

    parentPort?.on('message', async (m: Msg) => {
      if (m?.t === 'dispose') {
        try {
          await app.close();
        } finally {
          process.exit(0);
        }
      }
    });
  } catch (e: any) {
    // Максимально подробный лог ошибки старта воркера, чтобы main-процесс мог её увидеть
    const errMsg = e?.message ?? String(e);
    const errStack = e?.stack ?? '';
    log.error(e);
    log.error('bootstrap error: ' + errMsg, errStack);

    parentPort?.postMessage({
      t: 'error',
      error: errMsg,
      stack: errStack,
    } as Msg);
    process.exit(1);
  }
}

bootstrap();
