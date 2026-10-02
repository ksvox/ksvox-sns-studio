// K's VOX 投稿画像の「型」を描くエンジン
// 数値を変えると、全画像のレイアウトが一括で変わります。
export const STYLE = {
  catchFont: '"Noto Sans JP", sans-serif',
  catchWeight: 500, // キャッチの太さ（500=標準 / 700=太め）
  catchLineHeight: 1.38,
  subWeight: 400, // サブテキストの太さ
  subLineHeight: 1.5,
  sideMargin: 56, // キャッチ左右の最低余白(px)
  tagFont: '"Shippori Mincho", serif',
  tagSize: 28,
  tagSpacing: 12, // タグの文字間
  tagY: 0.06, // タグの縦位置（写真の上端からの割合）
  urlSize: 24,
  urlSpacing: 7,
  urlY: 0.95, // URLの縦位置（写真の上端からの割合）
  urlText: 'www.ksvox.net',
};

export const CANVAS = {
  square: { w: 1080, h: 1080 },
  vertical: { w: 1080, h: 1920 },
};

export const DEFAULT_CATCH_SIZE = 76;
export const DEFAULT_SUB_SIZE = 40;

export function photoRegion(format) {
  return format === 'vertical' ? { x: 0, y: 420, s: 1080 } : { x: 0, y: 0, s: 1080 };
}

export function drawCover(ctx, src, x, y, w, h) {
  const sw = src.width;
  const sh = src.height;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

// 縦長時の上下余白：写真を極小に縮めてから拡大 → どのブラウザでも同じぼかしになる
function makeBlurredFill(src, W, H) {
  const tiny = document.createElement('canvas');
  tiny.width = 24;
  tiny.height = Math.round((24 * H) / W);
  const tc = tiny.getContext('2d');
  tc.imageSmoothingEnabled = true;
  tc.imageSmoothingQuality = 'high';
  drawCover(tc, src, 0, 0, tiny.width, tiny.height);

  const mid = document.createElement('canvas');
  mid.width = 120;
  mid.height = Math.round((120 * H) / W);
  const mc = mid.getContext('2d');
  mc.imageSmoothingEnabled = true;
  mc.imageSmoothingQuality = 'high';
  mc.drawImage(tiny, 0, 0, mid.width, mid.height);

  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const fc = full.getContext('2d');
  fc.imageSmoothingEnabled = true;
  fc.imageSmoothingQuality = 'high';
  fc.drawImage(mid, 0, 0, W, H);
  fc.fillStyle = 'rgba(0,0,0,0.3)';
  fc.fillRect(0, 0, W, H);
  return full;
}

// 写真の上下の境目を、ぼかし背景になじませる
function featherEdges(ctx, blur, r, W) {
  const F = 70;
  [
    [r.y, 1, 0],
    [r.y + r.s - F, 0, 1],
  ].forEach(([y, a0, a1]) => {
    const strip = document.createElement('canvas');
    strip.width = W;
    strip.height = F;
    const sc = strip.getContext('2d');
    sc.drawImage(blur, 0, y, W, F, 0, 0, W, F);
    sc.globalCompositeOperation = 'destination-in';
    const g = sc.createLinearGradient(0, 0, 0, F);
    g.addColorStop(0, `rgba(0,0,0,${a0})`);
    g.addColorStop(1, `rgba(0,0,0,${a1})`);
    sc.fillStyle = g;
    sc.fillRect(0, 0, W, F);
    ctx.drawImage(strip, 0, y);
  });
}

// 写真の暗さ調整（all：全体 / center：文字の周りだけ）
function applyDim(ctx, r, dim, mode) {
  const a = Math.max(0, Math.min(0.8, (dim || 0) / 100));
  if (!a) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.s, r.s);
  ctx.clip();
  if (mode === 'center') {
    const cx = r.x + r.s / 2;
    const cy = r.y + r.s / 2;
    ctx.translate(cx, cy);
    ctx.scale(1, 0.5);
    const rad = r.s * 0.62;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    const strong = Math.min(0.9, a * 1.35);
    g.addColorStop(0, `rgba(0,0,0,${strong})`);
    g.addColorStop(0.5, `rgba(0,0,0,${strong * 0.75})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
  } else {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(r.x, r.y, r.s, r.s);
  }
  ctx.restore();
}

// 中央（キャッチの位置）の明るさを測る → 0〜1
export function measureCenterBrightness(src) {
  const c = document.createElement('canvas');
  c.width = 60;
  c.height = 60;
  const cc = c.getContext('2d');
  drawCover(cc, src, 0, 0, 60, 60);
  const d = cc.getImageData(9, 20, 42, 20).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4) / 255;
}

// 明るさから「おまかせ初期調整」の暗さを決める
export function autoDimFor(src) {
  const lum = measureCenterBrightness(src);
  if (lum <= 0.35) return 0;
  return Math.round(Math.min(50, (lum - 0.35) * 110));
}

function drawSpaced(ctx, text, cx, cy, spacing) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, cy);
    x += widths[i] + spacing;
  });
}

function spacedWidth(ctx, text, spacing) {
  const chars = [...text];
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
}

export function catchLines(text) {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2);
}

// 1枚分を描く。戻り値の shrunk が true なら、キャッチが長すぎて自動縮小したことを示す
export function renderSlide(ctx, slide, { format, tag, showUrl }) {
  const { w: W, h: H } = CANVAS[format];
  const r = photoRegion(format);
  const cx = r.x + r.s / 2;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d0a08';
  ctx.fillRect(0, 0, W, H);

  if (format === 'vertical') {
    const blur = makeBlurredFill(slide.source, W, H);
    ctx.drawImage(blur, 0, 0);
    drawCover(ctx, slide.source, r.x, r.y, r.s, r.s);
    featherEdges(ctx, blur, r, W);
  } else {
    drawCover(ctx, slide.source, r.x, r.y, r.s, r.s);
  }

  applyDim(ctx, r, slide.dim, slide.dimMode);

  // 写真の上下をほんのり暗く（縦長ではぼかし部分まで続けて、境目を目立たせない）
  const ext = format === 'vertical' ? 220 : 0;
  const topH = r.s * 0.28;
  const top = ctx.createLinearGradient(0, r.y - ext, 0, r.y + topH);
  if (ext) top.addColorStop(0, 'rgba(0,0,0,0)');
  top.addColorStop(ext / (ext + topH), 'rgba(0,0,0,0.55)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(r.x, r.y - ext, r.s, topH + ext);
  const botH = r.s * 0.26;
  const bottomStart = r.y + r.s - botH;
  const bottom = ctx.createLinearGradient(0, bottomStart, 0, r.y + r.s + ext);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(botH / (botH + ext), 'rgba(0,0,0,0.5)');
  if (ext) bottom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(r.x, bottomStart, r.s, botH + ext);

  ctx.textBaseline = 'middle';

  // シリーズタグ（全画像共通・位置固定）
  const tagText = (tag || '').trim();
  if (tagText) {
    let size = STYLE.tagSize;
    let spacing = STYLE.tagSpacing;
    ctx.font = `400 ${size}px ${STYLE.tagFont}`;
    const maxW = r.s - 80;
    while (spacedWidth(ctx, tagText, spacing) > maxW && size > 16) {
      size -= 1;
      spacing = Math.max(4, spacing - 0.4);
      ctx.font = `400 ${size}px ${STYLE.tagFont}`;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    drawSpaced(ctx, tagText, cx, r.y + r.s * STYLE.tagY, spacing);
    ctx.shadowBlur = 0;
  }

  // キャッチ＋サブテキスト（ひとかたまりで写真の上下中央・各行は左右中央）
  const lines = catchLines(slide.catch);
  const subLines = catchLines(slide.sub);
  let shrunk = false;
  const maxW = r.s - STYLE.sideMargin * 2;
  const fit = (ls, size, weight) => {
    if (!ls.length) return size;
    ctx.font = `${weight} ${size}px ${STYLE.catchFont}`;
    const widest = Math.max(...ls.map((l) => ctx.measureText(l).width));
    if (widest > maxW) {
      shrunk = true;
      return Math.floor((size * maxW) / widest);
    }
    return size;
  };
  if (lines.length || subLines.length) {
    const cSize = fit(lines, slide.size || DEFAULT_CATCH_SIZE, STYLE.catchWeight);
    const sSize = fit(subLines, slide.subSize || DEFAULT_SUB_SIZE, STYLE.subWeight);
    const cLH = cSize * STYLE.catchLineHeight;
    const sLH = sSize * STYLE.subLineHeight;
    const gap = lines.length && subLines.length ? Math.max(cSize * 0.3, sSize * 0.5) : 0;
    const cH = lines.length * cLH;
    const sH = subLines.length * sLH;
    let y = r.y + r.s / 2 - (cH + gap + sH) / 2;

    ctx.textAlign = 'center';
    ctx.font = `${STYLE.catchWeight} ${cSize}px ${STYLE.catchFont}`;
    ctx.fillStyle = slide.color || '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = cSize * 0.28;
    ctx.shadowOffsetY = cSize * 0.04;
    lines.forEach((l, i) => ctx.fillText(l, cx, y + cLH * (i + 0.5)));
    y += cH + gap;

    ctx.font = `${STYLE.subWeight} ${sSize}px ${STYLE.catchFont}`;
    ctx.fillStyle = slide.subColor || '#FBF3E4';
    ctx.shadowBlur = sSize * 0.3;
    ctx.shadowOffsetY = sSize * 0.04;
    subLines.forEach((l, i) => ctx.fillText(l, cx, y + sLH * (i + 0.5)));
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  // URL（☑で表示切替）
  if (showUrl) {
    ctx.font = `400 ${STYLE.urlSize}px ${STYLE.tagFont}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    drawSpaced(ctx, STYLE.urlText, cx, r.y + r.s * STYLE.urlY, STYLE.urlSpacing);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
  return { shrunk };
}

// フォントの読み込みを待ってから描く（書体ズレ防止）
export async function ensureFonts(texts) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = (texts.filter(Boolean).join('') || 'あ') + STYLE.urlText;
  try {
    await Promise.all([
      document.fonts.load(`${STYLE.catchWeight} 40px "Noto Sans JP"`, sample),
      document.fonts.load(`${STYLE.subWeight} 40px "Noto Sans JP"`, sample),
      document.fonts.load(`400 28px "Shippori Mincho"`, sample),
    ]);
  } catch (e) {
    // 読み込めなくても代替フォントで描画は続行
  }
}

// 1枚をフルサイズのキャンバスに描いて返す
export function renderToCanvas(slide, opts) {
  const { w, h } = CANVAS[opts.format];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  renderSlide(c.getContext('2d'), slide, opts);
  return c;
}
