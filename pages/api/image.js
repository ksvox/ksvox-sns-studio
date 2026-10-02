import { checkPassword } from '../../lib/auth';
import { callGemini } from '../../lib/gemini';
import { buildEnglishFromChoices, summarizeChoicesJa } from '../../lib/promptOptions';

// アプリ側で必ず追加する K's VOX 用の「画づくりの質感」（場所や被写体は決めない）
const KSVOX_STYLE =
  'cinematic photograph, warm color grading with amber tones, shallow depth of field, ' +
  'elegant and moody atmosphere, subtle film grain, highly detailed, photorealistic. ' +
  'The center of the frame stays calm and uncluttered. ' +
  'No text, no letters, no words, no captions, no signage, no logo, no watermark.';

const COMPOSE_SYSTEM = `You write prompts for a photorealistic image generator.
You may receive:
(A) extra instructions in Japanese — highest priority
(B) a base description in English built from menu choices
(C) a Japanese social media post that this image will accompany
(D) background notes about a vocal school — context only
Write one coherent English prompt (at most 80 words) describing a single photograph.
Priority is A > B > C > D. When they conflict, follow the higher priority and drop the conflicting part. Keep every non-conflicting detail of A and B.
Use C to choose a scene, situation, emotion and mood that visually expresses the message of the post. Express it through the picture, never through written words.
Use D only to keep the scene appropriate to the school's atmosphere. Never include the school name, logos or any text.
Never ask for text, letters, signs or logos in the image.
Output only the prompt.`;

export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPassword(req, res)) return;

  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) {
    return res.status(500).json({ error: 'サーバーにCF_ACCOUNT_ID / CF_API_TOKENが設定されていません。' });
  }

  const body = req.body || {};
  const choices = body.choices || {};
  const extra = String(body.extra || '').trim();
  const postText = String(body.postText || '').trim().slice(0, 3000);
  const docs = String(body.docs || '').trim().slice(0, 4000);
  const base = buildEnglishFromChoices(choices);
  if (!base && !extra && !postText) {
    return res.status(400).json({ error: '項目を選ぶか、追加の指示かSNS投稿文を入力してください。' });
  }

  // 日本語(追加の指示・投稿文)がある時だけGeminiで英語の指示に組み立てる
  let scene = base;
  if (extra || postText) {
    const parts = [];
    if (extra) parts.push(`(A) Extra instructions (Japanese): ${extra}`);
    if (base) parts.push(`(B) Base description: ${base}`);
    if (postText) parts.push(`(C) Social media post (Japanese): ${postText}`);
    if (docs) parts.push(`(D) Background notes (Japanese): ${docs}`);
    try {
      scene = await callGemini({ system: COMPOSE_SYSTEM, prompt: parts.join('\n\n'), temperature: 0.7 });
    } catch (e) {
      scene = [extra, base].filter(Boolean).join(', ');
      if (!scene) {
        return res.status(502).json({ error: `投稿文を読み取れませんでした。項目を選ぶか、時間をおいて再度お試しください。（${e.message}）` });
      }
    }
  }
  const finalPrompt = `${scene.replace(/\s+/g, ' ').slice(0, 1400)}. ${KSVOX_STYLE}`;

  try {
    const cf = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // seedは指定しない（指定しなければ毎回ランダムに描かれるので、同じ内容でも別の画像になる）
        body: JSON.stringify({ prompt: finalPrompt, steps: 8 }),
      }
    );
    const data = await cf.json().catch(() => ({}));
    const image = data?.result?.image;
    if (!cf.ok || !image) {
      const msg = data?.errors?.[0]?.message || `status ${cf.status}`;
      return res.status(502).json({
        error: `画像を生成できませんでした。今日の無料枠を使い切ったか、一時的な不具合の可能性があります。（${msg}）`,
      });
    }
    const summary = [summarizeChoicesJa(choices, extra), postText ? '投稿文を反映' : ''].filter(Boolean).join(' / ');
    res.status(200).json({ image: `data:image/jpeg;base64,${image}`, summary });
  } catch (e) {
    res.status(500).json({ error: `画像生成サービスに接続できませんでした。（${e.message}）` });
  }
}
