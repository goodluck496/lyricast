import * as express from 'express';
import { join } from 'path';
import { rendererAppName } from './constants';
import * as http from 'http';

/**
 * Сервер статики, он нужен для того, чтобы работали iframe`ы которые можно вставлять в приложение
 * т.к. некоторые ресурсы запрещают использование через протокол file://,
 * приходится придумывать обходные пути
 */
export async function startFileServer(): Promise<{ port: number; server: http.Server }> {
  const app = express();

  // In packaged apps, __dirname is .../dist/apps/electron/
  // The UI assets are in .../dist/apps/browser/
  const staticRoot = join(__dirname, '..', rendererAppName);

  // Serve all files from the static root
  app.use(express.static(staticRoot));

  // Fallback for SPAs: always serve index.html for any non-file route
  app.get(/.*/, (req, res) => {
    res.sendFile(join(staticRoot, 'index.html'));
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/svc/')) {
      return next();
    }
    res.sendFile(join(staticRoot, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);

    server.on('error', (err) => {
      reject(err);
    });

    // Start listening on a dynamic port (0) so the OS chooses a free port
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        reject(new Error('Invalid server address'));
        return;
      }
      console.log(`[FileServer] Started on port ${address.port}`);
      resolve({ port: address.port, server });
    });
  });
}
