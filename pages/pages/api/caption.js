import { checkPassword } from '../../lib/auth';
import { callGemini } from '../../lib/gemini';

const SYSTEM = `あなたは「ボーカル道場K's VOX」のSNS担当です。
渡される「K's VOX資料」の内容と方針に忠実に、今回の投稿画像に添える説明文とハッシュタグを作ります。

# ルール
- 説明文は日本語で150〜300字程度。画像のキャッチコピーの意図を深め、読む人が共感・納得できる内容にする
- 複数枚の画像がある場合は、全体の流れがひとつの投稿として伝わるようにまとめる
- 資料に書かれていない事実（料金、キャンペーン、数字の実績、日程など）は作らない
- 資料の「文章のトーン」に従う。誇張や押し売り感のある表現は避ける
- 説明文の中にハッシュタグとURLは入れない
- 締めくくりに自然な一言（お試しレッスンへの誘いなど）を入れてもよいが、毎回入れる必要はない
- ハッシュタグは、この投稿の内容に合ったものをちょうど3つ。「#」から始め、スペースは含めない

# 出力
次のJSONだけを出力する（前置きやコードブロックは不要）
{"caption": "説明文", "hashtags": ["#タグ1", "#タグ2", "#タグ3"]}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPassword(req, res)) return;

  const { docs = '', seriesTag = '', slides = [] } = req.body || {};
  const slideLines = slides
    .map((s, i) => {
      const parts = [`【画像${i + 1}】`];
      parts.push(`キャッチ: ${(s.catch || '').replace(/\n/g, ' ').trim() || '（なし）'}`);
      if (s.prompt) parts.push(`画像の内容（生成プロンプト）: ${s.prompt}`);
      return parts.join('\n');
    })
    .join('\n\n');

  const prompt = `# K's VOX資料
${docs || '（資料なし）'}

# 今回の投稿
シリーズタグ: ${seriesTag || '（なし）'}
画像の枚数: ${slides.length}枚

${slideLines}`;

  try {
    const text = await callGemini({ system: SYSTEM, prompt, json: true, temperature: 0.9 });
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    let tags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
    tags = tags
      .map((t) => String(t).replace(/\s+/g, ''))
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .slice(0, 3);
    while (tags.length < 3) tags.push('');
    res.status(200).json({ caption: String(parsed.caption || '').trim(), hashtags: tags });
  } catch (e) {
    res.status(500).json({ error: `説明文を作成できませんでした。時間をおいて再度お試しください。（${e.message}）` });
  }
}
