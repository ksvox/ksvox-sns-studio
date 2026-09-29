// 複数枚をフェード付きのMP4動画にする（ブラウザ内で完結・無料）
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const FPS = 30;
const FADE = 0.8; // 切り替えフェードの秒数
const EDGE_FADE = 0.5; // 最初と最後の黒からのフェード

async function pickCodec(width, height) {
  const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.640032', 'avc1.42e032'];
  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 8_000_000, framerate: FPS });
      if (supported) return codec;
    } catch (e) {
      // 次の候補へ
    }
  }
  return null;
}

export function canExportVideo() {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;
}

export async function exportMp4(frames, secondsPerSlide, onProgress) {
  if (!canExportVideo()) {
    throw new Error('このブラウザは動画の書き出しに対応していません。PCのChromeでお試しください。');
  }
  const width = frames[0].width;
  const height = frames[0].height;
  const codec = await pickCodec(width, height);
  if (!codec) throw new Error('このブラウザではMP4形式で書き出せません。PCのChromeでお試しください。');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  });
  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure({ codec, width, height, bitrate: 8_000_000, framerate: FPS, avc: { format: 'avc' } });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const total = frames.length * secondsPerSlide;
  const frameCount = Math.round(total * FPS);
  const frameDur = 1e6 / FPS;

  for (let f = 0; f < frameCount; f++) {
    if (encodeError) throw encodeError;
    const t = f / FPS;
    const idx = Math.min(frames.length - 1, Math.floor(t / secondsPerSlide));
    const local = t - idx * secondsPerSlide;

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(frames[idx], 0, 0);

    // 次の画像へクロスフェード
    if (idx < frames.length - 1 && local > secondsPerSlide - FADE) {
      ctx.globalAlpha = (local - (secondsPerSlide - FADE)) / FADE;
      ctx.drawImage(frames[idx + 1], 0, 0);
      ctx.globalAlpha = 1;
    }
    // 最初と最後だけ黒からフェード
    let edge = 0;
    if (t < EDGE_FADE) edge = 1 - t / EDGE_FADE;
    if (t > total - EDGE_FADE) edge = Math.max(edge, (t - (total - EDGE_FADE)) / EDGE_FADE);
    if (edge > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, edge)})`;
      ctx.fillRect(0, 0, width, height);
    }

    const frame = new VideoFrame(canvas, { timestamp: Math.round(f * frameDur), duration: Math.round(frameDur) });
    encoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();

    if (encoder.encodeQueueSize > 20) {
      await new Promise((r) => setTimeout(r, 5));
    }
    if (f % 15 === 0) {
      onProgress && onProgress(f / frameCount);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  if (encodeError) throw encodeError;
  muxer.finalize();
  onProgress && onProgress(1);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
