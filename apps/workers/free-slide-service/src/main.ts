import 'reflect-metadata';
import { parentPort } from 'node:worker_threads';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { FreeSlideDomainModule } from '@lyri-cast/free-slide-domain';

type Msg =
  | { t: 'ready'; port: number }
  | { t: 'error'; error: string; stack?: string }
  | { t: 'dispose' };

const log = new Logger('FreeSlideWorker');

async function bootstrap() {
  try {
    const expressApp = express();
    const adapter = new ExpressAdapter(expressApp);
    const app = await NestFactory.create(FreeSlideDomainModule, adapter, {
      logger: ['error', 'warn', 'log'],
      cors: false, // ходим через main-прокси
      bodyParser: false,
    });

    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true })
    );
    app.enableShutdownHooks();

    // слушаем СЛУЧАЙНЫЙ порт только на loopback
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
    parentPort?.postMessage({
      t: 'error',
      error: e?.message ?? String(e),
      stack: e?.stack,
    } as Msg);
    process.exit(1);
  }
}

bootstrap();
