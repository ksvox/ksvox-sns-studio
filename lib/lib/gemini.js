// Gemini API 呼び出し（flash-lite を優先し、失敗したら flash に自動切り替え）
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];

export async function callGemini({ system, prompt, json = false, temperature = 0.8 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('サーバーにGEMINI_API_KEYが設定されていません。');

  let lastError = '';
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              ...(json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        }
      );
      if (!res.ok) {
        lastError = `${model}: ${res.status}`;
        continue;
      }
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) {
        lastError = `${model}: 空の応答`;
        continue;
      }
      return text;
    } catch (e) {
      lastError = `${model}: ${e.message}`;
    }
  }
  throw new Error(`Geminiの応答を取得できませんでした（${lastError}）`);
}
