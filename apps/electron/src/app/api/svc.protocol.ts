// svc-protocol.ts
import { protocol } from 'electron';
import { WorkersRegistry } from '@lyri-cast/worker-kit';

function parseSvc(raw: string) {
  const u = new URL(raw);
  const path = u.pathname + u.search;
  return {
    worker: u.hostname,
    path: path.startsWith('/') ? path.slice(1) : path,
  };
}

function filterHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'connection') return; // не прокидываем
    out.set(k, v);
  });
  return out;
}

export function registerSvcProtocol(registry: WorkersRegistry) {
  // напоминание: схему объяви до whenReady():
  // protocol.registerSchemesAsPrivileged([{ scheme:'svc', privileges:{ secure:true, standard:true, supportFetchAPI:true, corsEnabled:true } }]);

  protocol.handle('svc', async (req: Request): Promise<Response> => {
    try {
      // CORS preflight для Angular
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers':
              req.headers.get('access-control-request-headers') ?? '*',
            'access-control-allow-methods':
              req.headers.get('access-control-request-method') ?? '*',
          },
        });
      }

      const { worker, path } = parseSvc(req.url);
      const workerReg = registry.get(worker);
      const base = workerReg.getBaseUrl(); // http://127.0.0.1:<port>
      const targetUrl = [base, workerReg.spec.rootApiPath, path].join('/');

      // Заголовки и тело запроса
      const headers = filterHeaders(req.headers);
      const body =
        req.method === 'GET' || req.method === 'HEAD' || req.body == null
          ? undefined
          : (req.body as ReadableStream<Uint8Array>);

      // Проксируем в воркер обычным fetch (Node 22)
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body, // передаём поток как есть, без чтения
      });

      // Возвращаем web-совместимый Response
      return new Response(upstream.body ?? null, {
        status: upstream.status,
        headers: upstream.headers,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'svc proxy error';
      return new Response(msg, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
}

export function unregisterSvcProtocol() {
  protocol.unhandle('svc');
}
