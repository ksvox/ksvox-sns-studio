// 画像がないときに使う「おしゃれなダーク背景」をその場で描く
const SIZE = 1080;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c;
}

function vignette(ctx, strength = 0.6) {
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.25, SIZE / 2, SIZE / 2, SIZE * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function grain(ctx, amount = 10) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function sparkle(ctx, x, y, len) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, len * 0.7, 'rgba(255,244,220,0.55)');
  for (const [dx, dy, k] of [
    [1, 0, 1],
    [0, 1, 1],
    [0.7, 0.7, 0.45],
    [0.7, -0.7, 0.45],
  ]) {
    const l = len * k;
    const lg = ctx.createLinearGradient(x - dx * l, y - dy * l, x + dx * l, y + dy * l);
    lg.addColorStop(0, 'rgba(255,240,210,0)');
    lg.addColorStop(0.5, 'rgba(255,250,238,0.95)');
    lg.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = Math.max(1, len / 16);
    ctx.beginPath();
    ctx.moveTo(x - dx * l, y - dy * l);
    ctx.lineTo(x + dx * l, y + dy * l);
    ctx.stroke();
  }
  ctx.restore();
}

// 星空（宇宙のキラキラ）
function starry() {
  const c = newCanvas();
  const ctx = c.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, SIZE * 0.3, SIZE);
  base.addColorStop(0, '#07081a');
  base.addColorStop(0.55, '#130d1e');
  base.addColorStop(1, '#0c0706');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const nebula = ['rgba(96,58,150,0.32)', 'rgba(170,100,45,0.26)', 'rgba(45,80,150,0.28)', 'rgba(160,60,95,0.22)'];
  for (let i = 0; i < 5; i++) glow(ctx, rnd(0, SIZE), rnd(0, SIZE), rnd(260, 540), pick(nebula));
  ctx.restore();

  for (let i = 0; i < 750; i++) {
    ctx.fillStyle = `rgba(${pick(['255,255,255', '255,240,215', '215,225,255'])},${rnd(0.25, 0.9)})`;
    ctx.beginPath();
    ctx.arc(rnd(0, SIZE), rnd(0, SIZE), rnd(0.3, 1.2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(255,245,225,0.9)';
  ctx.shadowBlur = 8;
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = `rgba(255,248,235,${rnd(0.6, 1)})`;
    ctx.beginPath();
    ctx.arc(rnd(0, SIZE), rnd(0, SIZE), rnd(1.2, 2.3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < 8; i++) sparkle(ctx, rnd(40, SIZE - 40), rnd(40, SIZE - 40), rnd(12, 34));

  vignette(ctx, 0.5);
  grain(ctx, 8);
  return c;
}

// 上質なグラデーション
function gradient() {
  const palettes = [
    ['#1a0b0e', '#5a1a26', '#0b0506'], // ボルドー
    ['#0a0f1f', '#22325a', '#06070d'], // ミッドナイトネイビー
    ['#1b120c', '#5a3a22', '#0a0705'], // ブラウン×ゴールド
    ['#07130f', '#1a453c', '#040907'], // ディープティール
    ['#140c1c', '#44265e', '#07050b'], // プラム
  ];
  const p = pick(palettes);
  const c = newCanvas();
  const ctx = c.getContext('2d');
  const base = ctx.createLinearGradient(0, SIZE, SIZE, 0);
  base.addColorStop(0, p[2]);
  base.addColorStop(0.5, p[0]);
  base.addColorStop(1, p[2]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  glow(ctx, rnd(200, 880), rnd(150, 500), rnd(520, 720), p[1] + 'ee');
  glow(ctx, rnd(100, 980), rnd(600, 950), rnd(350, 550), p[1] + '88');
  glow(ctx, rnd(250, 830), rnd(250, 830), rnd(200, 320), 'rgba(212,170,90,0.10)');
  ctx.restore();

  // 光の筋
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(rnd(-0.6, -0.3));
  const beam = ctx.createLinearGradient(0, -320, 0, 320);
  beam.addColorStop(0, 'rgba(255,230,180,0)');
  beam.addColorStop(0.5, 'rgba(255,230,180,0.07)');
  beam.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(-SIZE, -320, SIZE * 2, 640);
  ctx.restore();

  vignette(ctx, 0.55);
  grain(ctx, 10);
  return c;
}

function drawNote(ctx, x, y, s, type) {
  const head = () => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.55, s * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const stemX = x + s * 0.48;
  if (type === 'pair') {
    const x2 = x + s * 1.9;
    drawNote(ctx, x, y, s, 'quarter');
    drawNote(ctx, x2, y - s * 0.5, s, 'quarter');
    ctx.lineWidth = s * 0.28;
    ctx.beginPath();
    ctx.moveTo(stemX, y - s * 2.6);
    ctx.lineTo(x2 + s * 0.48, y - s * 3.1);
    ctx.stroke();
    return;
  }
  head();
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(stemX, y - s * 0.1);
  ctx.lineTo(stemX, y - s * 2.6);
  ctx.stroke();
  if (type === 'eighth') {
    ctx.lineWidth = s * 0.13;
    ctx.beginPath();
    ctx.moveTo(stemX, y - s * 2.6);
    ctx.bezierCurveTo(stemX + s * 0.95, y - s * 2.0, stemX + s * 0.95, y - s * 1.4, stemX + s * 0.35, y - s * 0.95);
    ctx.stroke();
  }
}

// 五線譜と音符の透かし柄
function watermark() {
  const c = newCanvas();
  const ctx = c.getContext('2d');
  const tones = [
    ['#1c140f', '#0a0706'],
    ['#101522', '#06070c'],
    ['#1a0e12', '#080506'],
  ];
  const t = pick(tones);
  const base = ctx.createRadialGradient(SIZE / 2, SIZE * 0.45, 50, SIZE / 2, SIZE / 2, SIZE * 0.8);
  base.addColorStop(0, t[0]);
  base.addColorStop(1, t[1]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  glow(ctx, SIZE / 2, SIZE / 2, 480, 'rgba(200,150,80,0.08)');

  const ink = 'rgba(214,180,120,';
  const staves = [];
  for (let k = 0; k < 3; k++) {
    const baseY = 180 + k * 330 + rnd(-40, 40);
    const amp = rnd(30, 70);
    const freq = rnd(0.002, 0.004);
    const phase = rnd(0, Math.PI * 2);
    staves.push({ baseY, amp, freq, phase });
    ctx.strokeStyle = ink + '0.14)';
    ctx.lineWidth = 1.6;
    for (let line = 0; line < 5; line++) {
      ctx.beginPath();
      for (let x = -20; x <= SIZE + 20; x += 10) {
        const y = baseY + line * 16 + Math.sin(x * freq + phase) * amp;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  ctx.fillStyle = ink + '0.17)';
  ctx.strokeStyle = ink + '0.17)';
  for (let i = 0; i < 14; i++) {
    const st = pick(staves);
    const x = rnd(40, SIZE - 120);
    const y = st.baseY + rnd(0, 64) + Math.sin(x * st.freq + st.phase) * st.amp;
    drawNote(ctx, x, y, rnd(14, 26), pick(['quarter', 'eighth', 'eighth', 'pair']));
  }

  vignette(ctx, 0.55);
  grain(ctx, 9);
  return c;
}

export const BACKGROUND_TYPES = [
  { id: 'starry', label: '星空' },
  { id: 'gradient', label: 'グラデーション' },
  { id: 'watermark', label: '透かし柄' },
  { id: 'random', label: 'おまかせ' },
];

export function generateBackground(type = 'random') {
  const t = type === 'random' ? pick(['starry', 'gradient', 'watermark']) : type;
  if (t === 'starry') return starry();
  if (t === 'watermark') return watermark();
  return gradient();
}
