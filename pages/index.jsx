import { useEffect, useRef, useState } from 'react';
import {
  CANVAS,
  DEFAULT_CATCH_SIZE,
  DEFAULT_SUB_SIZE,
  renderSlide,
  renderToCanvas,
  ensureFonts,
  drawCover,
  autoDimFor,
} from '../lib/render';
import { PROMPT_FIELDS } from '../lib/promptOptions';
import { generateBackground, BACKGROUND_TYPES } from '../lib/backgrounds';
import { DEFAULT_DOCS } from '../lib/defaultDocs';
import { idbGet, idbSet, sourceToBlob, rememberBlob } from '../lib/store';

const COLORS = [
  { v: '#FFFFFF', n: 'ホワイト' },
  { v: '#FBF3E4', n: 'クリーム' },
  { v: '#F3E0A8', n: 'ライトゴールド' },
  { v: '#D4AF37', n: 'ゴールド' },
  { v: '#E9A23B', n: 'アンバー' },
];
const LS = { pw: 'ksvox_pw', docs: 'ksvox_docs' };
const DURATIONS = [5, 6, 7, 8, 9, 10];
const HISTORY_MAX = 10;

let idSeq = 0;
const newId = () => `s${Date.now()}_${idSeq++}`;

function makeThumb(source) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  drawCover(c.getContext('2d'), source, 0, 0, 160, 160);
  return c.toDataURL('image/jpeg', 0.8);
}

function makeSlide(source, extra = {}) {
  return {
    id: newId(),
    source,
    thumb: makeThumb(source),
    catch: '',
    color: '#FFFFFF',
    size: DEFAULT_CATCH_SIZE,
    sub: '',
    subColor: '#FBF3E4',
    subSize: DEFAULT_SUB_SIZE,
    auto: false,
    bgType: null,
    prompt: '',
    dim: 0,
    dimMode: 'center',
    ...extra,
  };
}

const autoSlide = () => makeSlide(generateBackground('random'), { auto: true, bgType: 'random' });

async function imageToSource(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const max = 2400;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function blobToSource(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const src = await imageToSource(url);
    rememberBlob(src, blob);
    return src;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `通信エラー（${res.status}）`);
  return data;
}

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/* ───────── ログイン画面 ───────── */
function Login({ onSuccess, initialError }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setError('');
    try {
      await postJSON('/api/login', { password: pw });
      onSuccess(pw);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <p className="login-brand">K&apos;s VOX</p>
        <h1 className="login-title">投稿スタジオ</h1>
        <label className="label" htmlFor="pw">パスワード</label>
        <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !pw}>
          {busy ? '確認しています…' : '開く'}
        </button>
      </form>
    </div>
  );
}

/* 色とサイズの調整（キャッチ・サブテキスト共通） */
function StyleControls({ color, size, min, max, defaultSize, onColor, onSize }) {
  return (
    <>
      <div className="swatches">
        {COLORS.map((c) => (
          <button
            key={c.v}
            className={`swatch ${color.toUpperCase() === c.v ? 'is-on' : ''}`}
            style={{ background: c.v }}
            onClick={() => onColor(c.v)}
            aria-label={c.n}
            title={c.n}
          />
        ))}
        <label className="swatch-free" title="自由に選ぶ">
          <input type="color" value={color} onChange={(e) => onColor(e.target.value.toUpperCase())} />
          <span>自由に選ぶ</span>
        </label>
      </div>
      <div className="range-row">
        <span className="sub-label">
          サイズ <span className="value">{size}</span>
        </span>
        <input type="range" min={min} max={max} value={size} onChange={(e) => onSize(Number(e.target.value))} />
        <button className="link" onClick={() => onSize(defaultSize)}>
          標準
        </button>
      </div>
    </>
  );
}

/* ───────── メイン ───────── */
export default function Home() {
  const [auth, setAuth] = useState('checking'); // checking | locked | ok
  const [authError, setAuthError] = useState('');
  const pwRef = useRef('');

  const [ready, setReady] = useState(false); // 保存データの復元が終わったか
  const [format, setFormat] = useState('square');
  const [tag, setTag] = useState('');
  const [showUrl, setShowUrl] = useState(true);
  const [duration, setDuration] = useState(6);
  const [postText, setPostText] = useState('');

  const [slides, setSlides] = useState([]);
  const [active, setActive] = useState(0);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  const [aiOpen, setAiOpen] = useState(false);
  const [aiChoices, setAiChoices] = useState({});
  const [aiExtra, setAiExtra] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiDone, setAiDone] = useState(false);

  const [history, setHistory] = useState([]); // AI画像の履歴（最新10枚）
  const historyRef = useRef(history);
  historyRef.current = history;
  const [histOpen, setHistOpen] = useState(false);
  const [histSelecting, setHistSelecting] = useState(false);
  const [histSelected, setHistSelected] = useState([]);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [exportError, setExportError] = useState('');
  const [result, setResult] = useState(null); // スマホ用の保存パネル

  const [docs, setDocs] = useState(DEFAULT_DOCS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [docsDraft, setDocsDraft] = useState('');

  const [shrunk, setShrunk] = useState(false);
  const [toast, setToast] = useState('');
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);
  const saving = useRef(Promise.resolve());

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => setToast(''), 2400);
  };

  /* 起動時：保存済みパスワードの確認 */
  useEffect(() => {
    const saved = localStorage.getItem(LS.pw);
    if (!saved) {
      setAuth('locked');
      return;
    }
    postJSON('/api/login', { password: saved })
      .then(() => {
        pwRef.current = saved;
        setAuth('ok');
      })
      .catch((e) => {
        localStorage.removeItem(LS.pw);
        setAuthError(e.message);
        setAuth('locked');
      });
  }, []);

  /* ログイン後：前回の作業とAI画像履歴を復元 */
  useEffect(() => {
    if (auth !== 'ok' || ready) return;
    (async () => {
      const d = localStorage.getItem(LS.docs);
      if (d) setDocs(d);
      try {
        const work = await idbGet('work');
        if (work) {
          setFormat(work.format || 'square');
          setTag(work.tag || '');
          setShowUrl(work.showUrl !== false);
          setDuration(work.duration || 6);
          setPostText(work.postText || '');
          setAiChoices(work.aiChoices || {});
          setAiExtra(work.aiExtra || '');
        }
        let restored = [];
        if (work && Array.isArray(work.slides) && work.slides.length) {
          restored = (
            await Promise.all(
              work.slides.map(async ({ blob, ...rest }) => {
                try {
                  const src = await blobToSource(blob);
                  return makeSlide(src, { ...rest, id: newId() });
                } catch (e) {
                  return null;
                }
              })
            )
          ).filter(Boolean);
        }
        if (restored.length) {
          setSlides(restored);
          setActive(Math.min(work.active || 0, restored.length - 1));
        } else {
          setSlides([autoSlide()]);
          setActive(0);
        }
        const hist = (await idbGet('history')) || [];
        const loaded = (
          await Promise.all(
            hist.map(async (h) => {
              try {
                const src = await blobToSource(h.blob);
                return { ...h, source: src, thumb: makeThumb(src) };
              } catch (e) {
                return null;
              }
            })
          )
        ).filter(Boolean);
        setHistory(loaded);
      } catch (e) {
        setSlides([autoSlide()]);
        setActive(0);
      }
      setReady(true);
    })();
  }, [auth, ready]);

  /* 作業内容の自動保存（操作が落ち着いてから0.8秒後） */
  useEffect(() => {
    if (!ready) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snapshot = {
        list: slidesRef.current,
        format,
        tag,
        showUrl,
        duration,
        postText,
        aiChoices,
        aiExtra,
        active,
      };
      saving.current = saving.current.then(async () => {
        try {
          const slidesData = await Promise.all(
            snapshot.list.map(async ({ source, thumb, id, ...rest }) => ({ ...rest, blob: await sourceToBlob(source) }))
          );
          const { list, ...meta } = snapshot;
          await idbSet('work', { ...meta, slides: slidesData });
        } catch (e) {
          // 保存に失敗しても作業は続けられる
        }
      });
    }, 800);
  }, [ready, slides, format, tag, showUrl, duration, postText, aiChoices, aiExtra, active]);

  /* プレビュー描画 */
  useEffect(() => {
    const slide = slides[active];
    const c = canvasRef.current;
    if (!slide || !c) return;
    let cancelled = false;
    (async () => {
      await ensureFonts([tag, slide.catch, slide.sub]);
      if (cancelled) return;
      const { w, h } = CANVAS[format];
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const info = renderSlide(c.getContext('2d'), slide, { format, tag, showUrl });
      setShrunk(info.shrunk);
    })();
    return () => {
      cancelled = true;
    };
  }, [slides, active, format, tag, showUrl, auth, ready]);

  /* ───── 画像の操作 ───── */
  const addSlides = (newOnes) => {
    if (!newOnes.length) return;
    const prev = slidesRef.current;
    const replacePlaceholder = prev.length === 1 && prev[0].auto && !prev[0].catch.trim() && !prev[0].sub.trim();
    const base = replacePlaceholder ? [] : prev;
    setSlides([...base, ...newOnes]);
    setActive(base.length);
  };

  const updateActive = (patch) => {
    setSlides((prev) => prev.map((s, i) => (i === active ? { ...s, ...patch } : s)));
  };

  const removeSlide = (index) => {
    const prev = slidesRef.current;
    if (prev.length === 1) {
      setSlides([autoSlide()]);
      setActive(0);
      return;
    }
    const next = prev.filter((_, i) => i !== index);
    setSlides(next);
    setActive((a) => Math.max(0, Math.min(next.length - 1, a > index ? a - 1 : a)));
  };

  const moveSlide = (index, dir) => {
    const prev = slidesRef.current;
    const to = index + dir;
    if (to < 0 || to >= prev.length) return;
    const next = [...prev];
    [next[index], next[to]] = [next[to], next[index]];
    setSlides(next);
    setActive(to);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
    const results = await Promise.all(
      files.map(async (f) => {
        const url = URL.createObjectURL(f);
        try {
          return await imageToSource(url);
        } catch (err) {
          return null;
        } finally {
          URL.revokeObjectURL(url);
        }
      })
    );
    const ok = results.filter(Boolean);
    addSlides(ok.map((src) => makeSlide(src, { dim: autoDimFor(src) })));
    if (ok.length < files.length) showToast(`${files.length - ok.length}枚の画像を読み込めませんでした`);
    else showToast(`${ok.length}枚の画像を追加しました`);
  };

  const addBackground = (type) => addSlides([makeSlide(generateBackground(type), { bgType: type })]);

  const redrawBackground = () => {
    const s = slides[active];
    if (!s || !s.bgType) return;
    const src = generateBackground(s.bgType);
    updateActive({ source: src, thumb: makeThumb(src) });
  };

  const startOver = () => {
    if (!window.confirm('今の作業を消して、新しく始めますか？\n（AI画像の履歴は残ります）')) return;
    setSlides([autoSlide()]);
    setActive(0);
    setPostText('');
    setAiExtra('');
    setAiDone(false);
    setResult(null);
    showToast('新しく始めました');
  };

  /* ───── AI画像 ───── */
  const aiReady = aiExtra.trim() || postText.trim() || Object.values(aiChoices).some(Boolean);

  const saveHistory = (list) => {
    idbSet(
      'history',
      list.map(({ source, thumb, ...h }) => h)
    ).catch(() => {});
  };

  const generateAi = async () => {
    if (!aiReady) return;
    setAiBusy(true);
    setAiError('');
    try {
      const data = await postJSON('/api/image', {
        password: pwRef.current,
        choices: aiChoices,
        extra: aiExtra.trim(),
        postText: postText.trim(),
        docs,
      });
      const blob = await (await fetch(data.image)).blob();
      const src = await blobToSource(blob);
      addSlides([makeSlide(src, { prompt: data.summary, dim: autoDimFor(src) })]);
      const entry = { id: newId(), blob, summary: data.summary, createdAt: Date.now(), source: src, thumb: makeThumb(src) };
      const nextHist = [entry, ...historyRef.current].slice(0, HISTORY_MAX);
      setHistory(nextHist);
      saveHistory(nextHist);
      setAiDone(true);
      showToast('AI画像を追加しました');
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const useHistory = (h) => {
    addSlides([makeSlide(h.source, { prompt: h.summary, dim: autoDimFor(h.source) })]);
    showToast('履歴の画像を追加しました');
  };

  const toggleHistSelect = (id) => {
    setHistSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const deleteHistSelected = () => {
    if (!histSelected.length) return;
    if (!window.confirm(`選択した${histSelected.length}枚を履歴から削除しますか？`)) return;
    const next = historyRef.current.filter((h) => !histSelected.includes(h.id));
    setHistory(next);
    saveHistory(next);
    setHistSelected([]);
    setHistSelecting(false);
    showToast('履歴から削除しました');
  };

  /* ───── 書き出し ───── */
  const opts = { format, tag, showUrl };

  // PCはそのままダウンロード、スマホは「写真に保存・共有」パネルを出す
  const deliver = (blob, name) => {
    const file = new File([blob], name, { type: blob.type });
    if (isTouchDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
      setResult({ blob, name, file, isVideo: blob.type.startsWith('video') });
    } else {
      download(blob, name);
      showToast(blob.type.startsWith('video') ? 'MP4動画を保存しました' : 'PNGを保存しました');
    }
  };

  const shareResult = async () => {
    if (!result) return;
    try {
      await navigator.share({ files: [result.file] });
      setResult(null);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      download(result.blob, result.name);
      setResult(null);
    }
  };

  const savePng = async (index) => {
    const s = slidesRef.current[index];
    if (!s) return;
    setExportError('');
    await ensureFonts([tag, s.catch, s.sub]);
    const c = renderToCanvas(s, opts);
    c.toBlob((b) => {
      if (b) deliver(b, `ksvox_${format === 'vertical' ? '9x16' : '1x1'}_${stamp()}.png`);
    }, 'image/png');
  };

  const saveMp4 = async () => {
    setExporting(true);
    setExportError('');
    setProgress(0);
    try {
      const list = slidesRef.current;
      await ensureFonts([tag, ...list.map((s) => `${s.catch}${s.sub}`)]);
      const frames = list.map((s) => renderToCanvas(s, opts));
      const { exportMp4 } = await import('../lib/video');
      const blob = await exportMp4(frames, duration, (p) => setProgress(p));
      deliver(blob, `ksvox_${format === 'vertical' ? '9x16' : '1x1'}_${stamp()}.mp4`);
    } catch (e) {
      setExportError(e.message || '動画を書き出せませんでした。');
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const copy = async (text, label) => {
    if (!text.trim()) return;
    if (await copyText(text)) showToast(`${label}をコピーしました`);
  };

  /* ───── 設定 ───── */
  const openSettings = () => {
    setDocsDraft(docs);
    setSettingsOpen(true);
  };
  const saveDocs = () => {
    setDocs(docsDraft);
    localStorage.setItem(LS.docs, docsDraft);
    setSettingsOpen(false);
    showToast("K's VOX資料を保存しました");
  };
  const logout = () => {
    localStorage.removeItem(LS.pw);
    pwRef.current = '';
    setSettingsOpen(false);
    setReady(false);
    setAuth('locked');
  };

  /* ───── 画面 ───── */
  if (auth === 'checking' || (auth === 'ok' && !ready)) return <div className="login" />;
  if (auth === 'locked') {
    return (
      <Login
        initialError={authError}
        onSuccess={(pw) => {
          localStorage.setItem(LS.pw, pw);
          pwRef.current = pw;
          setAuthError('');
          setAuth('ok');
        }}
      />
    );
  }

  const current = slides[active];
  const multi = slides.length > 1;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-name">K&apos;s VOX</span>
          <span className="brand-sub">投稿スタジオ</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={startOver}>
            新しく始める
          </button>
          <button className="btn btn-ghost" onClick={openSettings} aria-label="設定">
            設定
          </button>
        </div>
      </header>

      <main className="layout">
        {/* ── 左：操作 ── */}
        <div className="controls">
          <section className="block">
            <h2 className="block-title">フォーマット</h2>
            <div className="seg">
              {[
                ['square', '正方形 1:1', 'GBP・Instagram・X'],
                ['vertical', '縦長 9:16', 'TikTok・リール'],
              ].map(([v, name, sub]) => (
                <button key={v} className={`seg-item ${format === v ? 'is-on' : ''}`} onClick={() => setFormat(v)} aria-pressed={format === v}>
                  <span className="seg-name">{name}</span>
                  <span className="seg-sub">{sub}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <h2 className="block-title">シリーズタグ</h2>
            <input className="input input-mincho" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="例：英語で歌えば上手くなる" />
            <label className="check">
              <input type="checkbox" checked={showUrl} onChange={(e) => setShowUrl(e.target.checked)} />
              <span>下部に www.ksvox.net を入れる</span>
            </label>
          </section>

          <section className="block">
            <div className="block-head">
              <h2 className="block-title">SNS投稿文</h2>
              <button className="link" onClick={() => copy(postText, '投稿文')} disabled={!postText.trim()}>
                コピー
              </button>
            </div>
            <textarea
              className="input"
              rows={4}
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="SNSに載せる文章を書いておくと、AI画像生成のときに内容を反映します（空欄でもOK）"
            />
          </section>

          <section className="block">
            <div className="block-head">
              <h2 className="block-title">画像</h2>
              <span className="count">{slides.length}枚</span>
            </div>
            <div className="add-row">
              <button className="btn" onClick={() => fileRef.current && fileRef.current.click()}>
                写真を追加
              </button>
              <button className={`btn ${aiOpen ? 'is-on' : ''}`} onClick={() => setAiOpen((v) => !v)}>
                AIで生成
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
            </div>

            {aiOpen && (
              <div className="ai-box">
                <div className="ai-grid">
                  {PROMPT_FIELDS.map((f) => (
                    <label key={f.key} className="ai-field">
                      <span className="sub-label">{f.label}</span>
                      <select
                        className="select select-full"
                        value={aiChoices[f.key] || ''}
                        onChange={(e) => setAiChoices((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      >
                        <option value="">おまかせ</option>
                        {f.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="ai-field">
                  <span className="sub-label">追加の指示（日本語で自由に）</span>
                  <textarea className="input" rows={2} value={aiExtra} onChange={(e) => setAiExtra(e.target.value)} placeholder="例：場所は誰もいない静かな海辺" />
                </label>
                <p className="hint">
                  {postText.trim() ? '✓ SNS投稿文の内容も反映します。' : 'SNS投稿文が空欄なので、項目と追加の指示だけで作ります。'}
                  優先順位は「追加の指示 → 項目 → 投稿文」です。
                </p>
                {aiError && <p className="error">{aiError}</p>}
                <div className="ai-actions">
                  <button
                    className="link"
                    onClick={() => {
                      setAiChoices({});
                      setAiExtra('');
                      setAiDone(false);
                    }}
                  >
                    選択をリセット
                  </button>
                  <button className="btn btn-primary" onClick={generateAi} disabled={aiBusy || !aiReady}>
                    {aiBusy ? '生成しています…（10〜30秒）' : aiDone ? '同じ内容でもう1枚生成' : '画像を生成する'}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-row">
              <span className="bg-label">背景を作る</span>
              {BACKGROUND_TYPES.map((b) => (
                <button key={b.id} className="chip" onClick={() => addBackground(b.id)}>
                  {b.label}
                </button>
              ))}
            </div>

            <div className="thumbs">
              {slides.map((s, i) => (
                <div key={s.id} className={`thumb ${i === active ? 'is-on' : ''}`}>
                  <button className="thumb-img" onClick={() => setActive(i)} aria-label={`${i + 1}枚目を表示`}>
                    <img src={s.thumb} alt="" />
                    <span className="thumb-no">{i + 1}</span>
                  </button>
                  <div className="thumb-tools">
                    <button onClick={() => moveSlide(i, -1)} disabled={i === 0} aria-label="前へ移動">‹</button>
                    <button onClick={() => removeSlide(i)} aria-label="削除">×</button>
                    <button onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1} aria-label="後ろへ移動">›</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hist">
              <button className="hist-toggle" onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen}>
                <span>AI画像の履歴</span>
                <span className="count">
                  {history.length} / {HISTORY_MAX} {histOpen ? '▲' : '▼'}
                </span>
              </button>
              {histOpen && (
                <div className="hist-body">
                  {history.length === 0 ? (
                    <p className="hint">AIで生成した画像が、ここに最新{HISTORY_MAX}枚まで残ります。</p>
                  ) : (
                    <>
                      <p className="hint">{histSelecting ? '削除する画像をタップして選んでください。' : 'タップすると作業中の画像に追加します。'}</p>
                      <div className="hist-grid">
                        {history.map((h) => {
                          const sel = histSelected.includes(h.id);
                          return (
                            <button
                              key={h.id}
                              className={`hist-item ${sel ? 'is-sel' : ''}`}
                              onClick={() => (histSelecting ? toggleHistSelect(h.id) : useHistory(h))}
                              title={h.summary}
                            >
                              <img src={h.thumb} alt="" />
                              {histSelecting && <span className="hist-check">{sel ? '✓' : ''}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="ai-actions">
                        {histSelecting ? (
                          <>
                            <button
                              className="link"
                              onClick={() => {
                                setHistSelecting(false);
                                setHistSelected([]);
                              }}
                            >
                              やめる
                            </button>
                            <button className="btn btn-danger" onClick={deleteHistSelected} disabled={!histSelected.length}>
                              選択した{histSelected.length}枚を削除
                            </button>
                          </>
                        ) : (
                          <>
                            <span />
                            <button className="btn" onClick={() => setHistSelecting(true)}>
                              選択して削除
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {current && (
            <section className="block">
              <div className="block-head">
                <h2 className="block-title">文字と写真（{active + 1}枚目）</h2>
                {current.bgType && (
                  <button className="link" onClick={redrawBackground}>
                    背景を描き直す
                  </button>
                )}
              </div>

              <div className="sub-head">キャッチ</div>
              <textarea
                className="input input-catch"
                rows={2}
                value={current.catch}
                onChange={(e) => updateActive({ catch: e.target.value.split('\n').slice(0, 2).join('\n') })}
                placeholder={'人生経験を積んだ今だから、\n歌える歌がある'}
              />
              <StyleControls
                color={current.color}
                size={current.size}
                min={40}
                max={130}
                defaultSize={DEFAULT_CATCH_SIZE}
                onColor={(v) => updateActive({ color: v })}
                onSize={(v) => updateActive({ size: v })}
              />

              <div className="sub-head">サブテキスト（キャッチの下）</div>
              <textarea
                className="input"
                rows={2}
                value={current.sub}
                onChange={(e) => updateActive({ sub: e.target.value.split('\n').slice(0, 2).join('\n') })}
                placeholder="空欄ならキャッチだけが中央に入ります"
              />
              <StyleControls
                color={current.subColor}
                size={current.subSize}
                min={24}
                max={80}
                defaultSize={DEFAULT_SUB_SIZE}
                onColor={(v) => updateActive({ subColor: v })}
                onSize={(v) => updateActive({ subSize: v })}
              />
              <p className="hint">どちらも改行した位置で2行に分かれます（各最大2行）。キャッチとサブテキストは、まとめて上下中央に配置されます。</p>
              {shrunk && <p className="warn">文字が長いため、画像からはみ出さないよう自動で小さくしています。</p>}

              <div className="sub-head">写真の暗さ</div>
              <div className="range-row">
                <span className="sub-label">
                  暗さ <span className="value">{current.dim}%</span>
                </span>
                <input type="range" min={0} max={70} value={current.dim} onChange={(e) => updateActive({ dim: Number(e.target.value) })} />
                <button className="link" onClick={() => updateActive({ dim: autoDimFor(current.source) })}>
                  おまかせ
                </button>
              </div>
              <div className="seg seg-small">
                {[
                  ['center', '文字の周りだけ'],
                  ['all', '写真全体'],
                ].map(([v, name]) => (
                  <button key={v} className={`seg-item ${current.dimMode === v ? 'is-on' : ''}`} onClick={() => updateActive({ dimMode: v })} aria-pressed={current.dimMode === v}>
                    <span className="seg-name">{name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── 右：プレビューと書き出し ── */}
        <div className="stage">
          <div className={`frame frame-${format}`}>
            <canvas ref={canvasRef} width={1080} height={1080} />
          </div>

          {multi && (
            <div className="pager">
              <button className="btn" onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0}>
                前へ
              </button>
              <span>
                {active + 1} / {slides.length}
              </span>
              <button className="btn" onClick={() => setActive((a) => Math.min(slides.length - 1, a + 1))} disabled={active === slides.length - 1}>
                次へ
              </button>
            </div>
          )}

          <section className="block export">
            {!multi ? (
              <button className="btn btn-primary btn-block btn-lg" onClick={() => savePng(0)}>
                PNGで保存する
              </button>
            ) : (
              <>
                <div className="export-row">
                  <label className="sub-label" htmlFor="dur">
                    1枚の表示時間
                  </label>
                  <select id="dur" className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}秒
                      </option>
                    ))}
                  </select>
                  <span className="hint">全体 {duration * slides.length}秒・フェード付き</span>
                </div>
                <button className="btn btn-primary btn-block btn-lg" onClick={saveMp4} disabled={exporting}>
                  {exporting ? `動画を書き出しています… ${Math.round((progress || 0) * 100)}%` : 'MP4動画で保存する'}
                </button>
                {exporting && (
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${Math.round((progress || 0) * 100)}%` }} />
                  </div>
                )}
                <button className="link link-center" onClick={() => savePng(active)} disabled={exporting}>
                  表示中の1枚だけPNGで保存
                </button>
              </>
            )}
            {exportError && <p className="error">{exportError}</p>}
            <p className="hint">作業内容はこの端末に自動で保存されます。タブを閉じても、次に開くと続きから再開できます。</p>
          </section>
        </div>
      </main>

      {result && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setResult(null)}>
          <div className="modal-card sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{result.isVideo ? '動画' : '画像'}の準備ができました</h2>
            <p className="hint">「写真に保存・共有」から「画像を保存」「ビデオを保存」を選ぶと、写真アプリに保存できます。</p>
            <button className="btn btn-primary btn-block btn-lg" onClick={shareResult}>
              写真に保存・共有
            </button>
            <div className="modal-actions">
              <button
                className="link"
                onClick={() => {
                  download(result.blob, result.name);
                  setResult(null);
                }}
              >
                ファイルとしてダウンロード
              </button>
              <span className="spacer" />
              <button className="btn" onClick={() => setResult(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">K&apos;s VOX資料</h2>
            <p className="hint">AI画像生成で、SNS投稿文や追加の指示を読み取るときに、K&apos;s VOXの雰囲気に合う場面を選ぶための参考資料です（画像に文字は入りません）。このブラウザに保存されます。</p>
            <textarea className="input docs" value={docsDraft} onChange={(e) => setDocsDraft(e.target.value)} />
            <div className="modal-actions">
              <button className="link" onClick={() => setDocsDraft(DEFAULT_DOCS)}>
                初期内容に戻す
              </button>
              <span className="spacer" />
              <button className="btn" onClick={() => setSettingsOpen(false)}>
                閉じる
              </button>
              <button className="btn btn-primary" onClick={saveDocs}>
                保存する
              </button>
            </div>
            <div className="modal-foot">
              <button className="link" onClick={logout}>
                ログアウト
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
