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
    // не прокидываем hop-by-hop и конфликтующие заголовки
    if ([
      'host',
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'content-length',     // важно: убираем
      'expect',             // бывает 100-continue
    ].includes(lk)) return;
    out.set(k, v);
  });
  return out;
}

export function registerSvcProtocol(registry: WorkersRegistry) {
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
            // по ситуации:
            // 'access-control-allow-credentials': 'true',
          },
        });
      }

      const { worker, path } = parseSvc(req.url);
      const workerReg = registry.get(worker);

      // корректнее собирать URL через URL(), чтобы не словить // или пропущенные /
      const baseUrl = new URL(workerReg.getBaseUrl()); // напр. http://127.0.0.1:3001/
      const root = workerReg.spec.rootApiPath?.replace(/^\/|\/$/g, '') ?? '';
      const rel = path.replace(/^\/+/g, '');
      const targetUrl = new URL([root, rel].filter(Boolean).join('/'), baseUrl).toString();

      // Заголовки
      const headers = filterHeaders(req.headers);

      // Некоторые окружения/схемы могут не прокидывать Authorization в req.headers,
      // но наш authInterceptor всегда добавляет X-Auth-Token. Восстанавливаем Bearer.
      const xAuthToken =
        headers.get('x-auth-token') ??
        headers.get('X-Auth-Token') ??
        headers.get('X-AUTH-TOKEN');
      if (!headers.get('authorization') && xAuthToken) {
        headers.set('authorization', `Bearer ${xAuthToken}`);
      }

      // Тело запроса: для GET/HEAD вовсе не передаём body
      let body: RequestInit['body'] | undefined = undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const buffer = await req.arrayBuffer();

        if (buffer.byteLength > 0) {
          body = Buffer.from(buffer) as any;
        }
      }

      // Готовим init без мутирующих полей
      const init: RequestInit = {
        method: req.method,
        headers,
        // body добавим ниже, чтобы не тащить его в GET/HEAD
      };
      if (body != null) {
        (init as any).duplex = 'half'; // <-- критично для Node fetch
        (init as any).body = body;
      }

      const upstream = await fetch(targetUrl, init);

      // Проксируем ответ как поток + вернём CORS заголовок
      const respHeaders = new Headers(upstream.headers);
      // если ждёшь вызовы из браузера (Angular) — добавь CORS в обычные ответы тоже
      respHeaders.set('access-control-allow-origin', '*');
      // при необходимости:
      // respHeaders.set('access-control-allow-credentials', 'true');

      if ([204, 205, 304].includes(upstream.status)) {
        return new Response(null, {
          status: upstream.status,
          headers: respHeaders,
        });
      }

      return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers: respHeaders,
      });
    } catch (e) {
      console.log('svc proxy error:', e);
      const msg = e instanceof Error ? e.message : 'svc proxy error';
      return new Response(msg, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
      });
    }
  });
}

export function unregisterSvcProtocol() {
  protocol.unhandle('svc');
}
