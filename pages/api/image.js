import { checkPassword } from '../../lib/auth';
import { callGemini } from '../../lib/gemini';
import { buildEnglishFromChoices, summarizeChoicesJa } from '../../lib/promptOptions';

// アプリ側で必ず追加する K's VOX 用の「画づくりの質感」（場所や被写体は決めない）
const KSVOX_STYLE =
  'cinematic photograph, warm color grading with amber tones, shallow depth of field, ' +
  'elegant and moody atmosphere, subtle film grain, highly detailed, photorealistic. ' +
  'The center of the frame stays calm and uncluttered. ' +
  'No text, no letters, no words, no captions, no signage, no logo, no watermark.';

const MERGE_SYSTEM = `You write prompts for a photorealistic image generator.
You receive (1) a base description in English built from menu choices (may be empty) and (2) extra instructions in Japanese.
Write one coherent English prompt of at most 80 words.
The Japanese extra instructions have priority: if they conflict with the base description (for example a different place or person), follow the Japanese instructions and drop the conflicting part.
Keep every non-conflicting detail from the base description.
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

  const choices = (req.body && req.body.choices) || {};
  const extra = String((req.body && req.body.extra) || '').trim();
  const base = buildEnglishFromChoices(choices);
  if (!base && !extra) return res.status(400).json({ error: '項目を選ぶか、追加の指示を入力してください。' });

  // 自由入力（日本語）がある場合だけ、Geminiで英語に直して項目と統合する
  let scene = base;
  if (extra) {
    try {
      scene = await callGemini({
        system: MERGE_SYSTEM,
        prompt: `Base description: ${base || '(none)'}\nExtra instructions (Japanese): ${extra}`,
        temperature: 0.5,
      });
    } catch (e) {
      scene = [extra, base].filter(Boolean).join(', ');
    }
  }
  const finalPrompt = `${scene.replace(/\s+/g, ' ').slice(0, 1200)}. ${KSVOX_STYLE}`;

  try {
    const cf = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
    res.status(200).json({ image: `data:image/jpeg;base64,${image}`, summary: summarizeChoicesJa(choices, extra) });
  } catch (e) {
    res.status(500).json({ error: `画像生成サービスに接続できませんでした。（${e.message}）` });
  }
}
