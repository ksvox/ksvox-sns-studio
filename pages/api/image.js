import { checkPassword } from '../../lib/auth';
import { callGemini } from '../../lib/gemini';

// アプリ側で必ず追加する K's VOX 用の画づくり指定
const KSVOX_STYLE =
  'cinematic photograph, warm tungsten lighting, amber and deep brown color palette, ' +
  'soft window light, shallow depth of field, moody and elegant atmosphere, ' +
  'intimate vocal studio feeling, subtle film grain, highly detailed, realistic. ' +
  'The center of the frame stays calm and uncluttered. ' +
  'No text, no letters, no words, no captions, no signage, no logo, no watermark.';

const TRANSLATE_SYSTEM = `You write prompts for a photorealistic image generator.
Convert the user's request (Japanese or English) into one concise English prompt of at most 60 words.
Describe the scene, the people (if any), their action and expression, the setting and the lighting.
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

  const userPrompt = String((req.body && req.body.prompt) || '').trim();
  if (!userPrompt) return res.status(400).json({ error: '画像の説明を入力してください。' });

  // 日本語の指示を英語の画像プロンプトに整える（失敗したらそのまま使う）
  let scene = userPrompt;
  try {
    scene = await callGemini({ system: TRANSLATE_SYSTEM, prompt: userPrompt, temperature: 0.6 });
  } catch (e) {
    // 翻訳できなくても生成は続行
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
    res.status(200).json({ image: `data:image/jpeg;base64,${image}`, prompt: userPrompt });
  } catch (e) {
    res.status(500).json({ error: `画像生成サービスに接続できませんでした。（${e.message}）` });
  }
}
