import { Application, Graphics, Text, TextStyle } from 'pixi.js';

(async () => {
  // ===== 1) APP =====
  const app = new Application();
  await app.init({ resizeTo: window, background: '#ffffff' });
  document.body.appendChild(app.canvas);
  app.stage.eventMode = 'static';

  // ===== 2) CONSTS & STATE =====
  const PADDING = 20; // внутренние поля блока
  const FIT_MARGIN = 14; // зазор, чтобы не "на грани" (убирает мерцание)
  const FONT_MIN = 8;
  const FONT_MAX = 200; // верхняя теоретическая граница (динамически подберём реальный максимум)
  const STEP = 2; // шаг изменения fontSize (2–4 даёт стабильность и меньше дёрганий)

  const baseStyle = {
    fontFamily: 'Arial',
    fill: '#FFFFFF',
    wordWrap: true,
    align: 'center',
    dropShadow: true,
    dropShadowAlpha: 0.2,
    dropShadowAngle: 1,
    dropShadowDistance: 6,
    fontWeight: 'bold',
    padding: 11,
    stroke: '#000',
    strokeThickness: 10,
  };

  let lastFontSize = 32; // стартовая эвристика, дальше будет подбираться
  let lastW = 0,
    lastH = 0; // кэш последнего размера блока

  // ===== 3) NODES =====
  const text = new Text({
    text: `Течет ли жизнь мирно, подобно реке,
Несусь ли на грозных волнах, -
Во всякое время, вблизи, вдалеке
В Твоих я покоюсь руках.`,
    style: new TextStyle({
      ...baseStyle,
      fontSize: lastFontSize,
      wordWrapWidth: 300 - PADDING,
    }),
  });

  const background = new Graphics().roundRect(0, 0, 300, 150, 5).fill(0xe0e0e0);
  background.position.set(100, 100);

  const resizeHandle = new Graphics().rect(0, 0, 12, 12).fill(0x333333);
  resizeHandle.cursor = 'nwse-resize';
  resizeHandle.eventMode = 'static';

  const container = app.stage.addChild(background);
  container.addChild(text);
  container.addChild(resizeHandle);

  // ===== 4) FIT-TEXT (быстро и без дёрганий) =====
  async function fitTextToBox(maxWidth, maxHeight) {
    const content = text.text;

    // единичный скрытый экземпляр для измерений
    const testText = new Text({
      text: content,
      style: new TextStyle({ ...baseStyle }),
    });
    testText.visible = false;
    app.stage.addChild(testText);

    // бинарный поиск по fontSize с шагом STEP
    let lo = FONT_MIN,
      hi = FONT_MAX,
      best = lo;

    while (lo <= hi) {
      // округляем середину к ближайшему кратному STEP
      const midRaw = (lo + hi) / 2;
      const mid = Math.round(midRaw / STEP) * STEP;

      testText.style = new TextStyle({
        ...baseStyle,
        fontSize: mid,
        wordWrapWidth: maxWidth - PADDING,
      });

      // ждём кадр: Pixi обновит размеры текста
      // (requestAnimationFrame нужен, иначе testText.width/height бывают устаревшими)
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => requestAnimationFrame(r));

      const fits =
        testText.width <= maxWidth - FIT_MARGIN &&
        testText.height <= maxHeight - FIT_MARGIN;

      if (fits) {
        best = mid;
        lo = mid + STEP; // пробуем ещё крупнее
      } else {
        hi = mid - STEP; // уменьшаем
      }
    }

    // очистка измерителя
    app.stage.removeChild(testText);
    testText.destroy(true);

    // применяем найденный размер ОДИН раз — без промежуточных мерцаний
    lastFontSize = best;
    text.style = new TextStyle({
      ...baseStyle,
      fontSize: best,
      wordWrapWidth: maxWidth - PADDING,
    });

    // центрируем после того, как Pixi пересчитает метрики
    requestAnimationFrame(() => {
      text.position.set(
        (maxWidth - text.width) / 2,
        (maxHeight - text.height) / 2
      );
    });
  }

  // ===== 5) UPDATE SIZE =====
  async function updateSize(width, height) {
    // небольшая «мёртвая зона», чтобы не перерасчитывать слишком часто
    if (Math.abs(width - lastW) < 2 && Math.abs(height - lastH) < 2) return;
    lastW = width;
    lastH = height;

    // фон и ручка — сразу, чтобы пользователь видел отклик
    background.clear().roundRect(0, 0, width, height, 5).fill(0xe0e0e0);
    resizeHandle.position.set(width - 12, height - 12);

    // подгон текста — отдельно (без фризов)
    await fitTextToBox(width, height);
  }

  // ===== 6) DRAG RESIZE =====
  let dragging = false;
  let draggingId = -1;
  let start = { x: 0, y: 0 };
  let initial = { w: 0, h: 0 };

  resizeHandle.on('pointerdown', (e) => {
    dragging = true;
    draggingId = e.pointerId;

    const clientX = e.client?.x ?? e.data?.originalEvent?.clientX ?? 0;
    const clientY = e.client?.y ?? e.data?.originalEvent?.clientY ?? 0;

    start = { x: clientX, y: clientY };
    initial = { w: background.width, h: background.height };
    resizeHandle.cursor = 'grabbing';
  });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerId === draggingId) {
      dragging = false;
      draggingId = -1;
      resizeHandle.cursor = 'nwse-resize';
    }
  });

  // throttle: считаем не чаще, чем 1 раз за ~16мс (один кадр)
  let rafScheduled = false;
  let pendingW = 0,
    pendingH = 0;

  function scheduleUpdate(w, h) {
    pendingW = w;
    pendingH = h;
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(async () => {
      rafScheduled = false;
      await updateSize(pendingW, pendingH);
    });
  }

  window.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== draggingId) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const newW = Math.max(150, initial.w + dx);
    const newH = Math.max(80, initial.h + dy);

    // лёгкий throttle через rAF — плавнее и без фризов
    scheduleUpdate(newW, newH);
  });

  // ===== 7) INITIAL =====
  await updateSize(300, 150);
})();
