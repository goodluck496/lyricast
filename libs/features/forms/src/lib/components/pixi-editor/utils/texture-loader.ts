import { Assets, Texture } from 'pixi.js';

// Robust texture loader utilities
export async function ensureTextureValid(tex: Texture): Promise<void> {
  // If already valid with non-zero size, resolve immediately
  if (tex.width > 0 && tex.height > 0) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      const baseTex = (tex as unknown as { baseTexture?: unknown })
        .baseTexture as unknown;
      const onceFn = (
        baseTex as { once?: (ev: string, cb: () => void) => void } | undefined
      )?.once;
      onceFn?.('loaded', finish);
      onceFn?.('error', finish);
      const resource = (baseTex as { resource?: unknown } | undefined)
        ?.resource as unknown;
      const source = (resource as { source?: unknown } | undefined)
        ?.source as unknown;
      const img = source instanceof Image ? source : null;
      if (img) {
        img.onload = finish;
        img.onerror = finish;
      }
    } catch {
      /* ignore */
    }
    // Safety timeout in case events do not fire
    setTimeout(finish, 1000);
  });
}

export async function loadTextureRobust(url: string): Promise<Texture> {
  if (url.startsWith('svc://')) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch svc:// URL. Status: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const texture = Texture.from(bitmap);
      await ensureTextureValid(texture);
      return texture;
    } catch (e) {
      console.error('[texture-loader] Failed to load texture from svc:// URL:', url, e);
      throw e; // Re-throw the specific error
    }
  }

  // Prioritize manual HTMLImage decode for blob: and data: URLs
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      if ('decode' in img && typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {
          /* older browsers */
        }
      }
      const t = Texture.from(img);
      await ensureTextureValid(t);
      return t;
    } catch (e) {
      console.warn('Manual HTMLImage decode failed for blob/data URL:', url, e);
      // Fall through to other methods if manual decode fails for some reason
    }
  }

  // 1) Try Pixi Assets pipeline
  try {
    const t = (await Assets.load(url)) as Texture;
    if (t) {
      await ensureTextureValid(t);
      return t;
    }
  } catch (e) {
    console.warn('Pixi Assets.load failed:', url, e);
    /* continue */
  }
  // 2) Try direct Texture.from (string URL)
  try {
    const t = Texture.from(url);
    if (t) {
      await ensureTextureValid(t);
      return t;
    }
  } catch (e) {
    console.warn('Pixi Texture.from(string) failed:', url, e);
    /* continue */
  }
  // If all else fails, throw an error
  throw new Error('Failed to load texture from URL: ' + url);
}
