import { useEffect, useRef, useState } from 'react';
import { CANVAS, DEFAULT_CATCH_SIZE, renderSlide, renderToCanvas, ensureFonts, drawCover, autoDimFor } from '../lib/render';
import { PROMPT_FIELDS } from '../lib/promptOptions';
import { generateBackground, BACKGROUND_TYPES } from '../lib/backgrounds';
import { DEFAULT_DOCS } from '../lib/defaultDocs';

const COLORS = [
  { v: '#FFFFFF', n: 'ホワイト' },
  { v: '#FBF3E4', n: 'クリーム' },
  { v: '#F3E0A8', n: 'ライトゴールド' },
  { v: '#D4AF37', n: 'ゴールド' },
  { v: '#E9A23B', n: 'アンバー' },
];
const LS = { pw: 'ksvox_pw', docs: 'ksvox_docs', prefs: 'ksvox_prefs' };
const DURATIONS = [5, 6, 7, 8, 9, 10];

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
    auto: false,
    bgType: null,
    prompt: '',
    dim: 0,
    dimMode: 'center',
    ...extra,
  };
}

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

async function fileToSource(file) {
  const url = URL.createObjectURL(file);
  try {
    return await imageToSource(url);
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
        <input
          id="pw"
          type="password"
          className="input"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          autoFocus
        />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !pw}>
          {busy ? '確認しています…' : '開く'}
        </button>
      </form>
    </div>
  );
}

/* ───────── メイン ───────── */
export default function Home() {
  const [auth, setAuth] = useState('checking'); // checking | locked | ok
  const [authError, setAuthError] = useState('');
  const pwRef = useRef('');

  const [format, setFormat] = useState('square');
  const [tag, setTag] = useState('');
  const [showUrl, setShowUrl] = useState(true);
  const [duration, setDuration] = useState(6);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [slides, setSlides] = useState([]);
  const [active, setActive] = useState(0);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  const [aiOpen, setAiOpen] = useState(false);
  const [aiChoices, setAiChoices] = useState({});
  const [aiExtra, setAiExtra] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [exportError, setExportError] = useState('');

  const [docs, setDocs] = useState(DEFAULT_DOCS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [docsDraft, setDocsDraft] = useState('');

  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState(['', '', '']);
  const [capBusy, setCapBusy] = useState(false);
  const [capError, setCapError] = useState('');

  const [shrunk, setShrunk] = useState(false);
  const [toast, setToast] = useState('');
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

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

  /* ログイン後：設定の読み込みと最初の背景 */
  useEffect(() => {
    if (auth !== 'ok') return;
    try {
      const p = JSON.parse(localStorage.getItem(LS.prefs) || '{}');
      if (p.format) setFormat(p.format);
      if (typeof p.tag === 'string') setTag(p.tag);
      if (typeof p.showUrl === 'boolean') setShowUrl(p.showUrl);
      if (p.duration) setDuration(p.duration);
    } catch (e) {}
    const d = localStorage.getItem(LS.docs);
    if (d) setDocs(d);
    setPrefsLoaded(true);
    if (slidesRef.current.length === 0) {
      setSlides([makeSlide(generateBackground('random'), { auto: true, bgType: 'random' })]);
      setActive(0);
    }
  }, [auth]);

  /* 設定の自動保存 */
  useEffect(() => {
    if (!prefsLoaded) return;
    localStorage.setItem(LS.prefs, JSON.stringify({ format, tag, showUrl, duration }));
  }, [format, tag, showUrl, duration, prefsLoaded]);

  /* プレビュー描画 */
  useEffect(() => {
    const slide = slides[active];
    const c = canvasRef.current;
    if (!slide || !c) return;
    let cancelled = false;
    (async () => {
      await ensureFonts([tag, slide.catch]);
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
  }, [slides, active, format, tag, showUrl, auth]);

  /* ───── 画像の操作 ───── */
  const addSlides = (newOnes) => {
    if (!newOnes.length) return;
    const prev = slidesRef.current;
    const replacePlaceholder = prev.length === 1 && prev[0].auto && !prev[0].catch.trim();
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
      setSlides([makeSlide(generateBackground('random'), { auto: true, bgType: 'random' })]);
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
    const results = await Promise.all(files.map((f) => fileToSource(f).catch(() => null)));
    const ok = results.filter(Boolean);
    addSlides(ok.map((src) => makeSlide(src, { dim: autoDimFor(src) })));
    if (ok.length < files.length) showToast(`${files.length - ok.length}枚の画像を読み込めませんでした`);
    else showToast(`${ok.length}枚の画像を追加しました`);
  };

  const addBackground = (type) => {
    addSlides([makeSlide(generateBackground(type), { bgType: type })]);
  };

  const redrawBackground = () => {
    const s = slides[active];
    if (!s || !s.bgType) return;
    const src = generateBackground(s.bgType);
    updateActive({ source: src, thumb: makeThumb(src) });
  };

  const aiReady = aiExtra.trim() || Object.values(aiChoices).some(Boolean);

  const generateAi = async () => {
    if (!aiReady) return;
    setAiBusy(true);
    setAiError('');
    try {
      const data = await postJSON('/api/image', { password: pwRef.current, choices: aiChoices, extra: aiExtra.trim() });
      const src = await imageToSource(data.image);
      addSlides([makeSlide(src, { prompt: data.summary, dim: autoDimFor(src) })]);
      showToast('AI画像を追加しました');
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  /* ───── 書き出し ───── */
  const opts = { format, tag, showUrl };

  const savePng = async (index) => {
    const s = slidesRef.current[index];
    if (!s) return;
    await ensureFonts([tag, s.catch]);
    const c = renderToCanvas(s, opts);
    c.toBlob((b) => {
      if (b) {
        download(b, `ksvox_${format === 'vertical' ? '9x16' : '1x1'}_${stamp()}.png`);
        showToast('PNGを保存しました');
      }
    }, 'image/png');
  };

  const saveMp4 = async () => {
    setExporting(true);
    setExportError('');
    setProgress(0);
    try {
      const list = slidesRef.current;
      await ensureFonts([tag, ...list.map((s) => s.catch)]);
      const frames = list.map((s) => renderToCanvas(s, opts));
      const { exportMp4 } = await import('../lib/video');
      const blob = await exportMp4(frames, duration, (p) => setProgress(p));
      download(blob, `ksvox_${format === 'vertical' ? '9x16' : '1x1'}_${stamp()}.mp4`);
      showToast('MP4動画を保存しました');
    } catch (e) {
      setExportError(e.message || '動画を書き出せませんでした。');
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  /* ───── 説明文 ───── */
  const makeCaption = async () => {
    const hasText = tag.trim() || slides.some((s) => s.catch.trim());
    if (!hasText) {
      setCapError('シリーズタグかキャッチを入力してから作成してください。');
      return;
    }
    setCapBusy(true);
    setCapError('');
    try {
      const data = await postJSON('/api/caption', {
        password: pwRef.current,
        docs,
        seriesTag: tag,
        slides: slides.map((s) => ({ catch: s.catch, prompt: s.prompt })),
      });
      setCaption(data.caption || '');
      setHashtags(data.hashtags || ['', '', '']);
    } catch (e) {
      setCapError(e.message);
    } finally {
      setCapBusy(false);
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
    showToast('K\'s VOX資料を保存しました');
  };
  const logout = () => {
    localStorage.removeItem(LS.pw);
    pwRef.current = '';
    setSettingsOpen(false);
    setAuth('locked');
  };

  /* ───── 画面 ───── */
  if (auth === 'checking') return <div className="login" />;
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
  const tagsText = hashtags.filter(Boolean).join(' ');

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-name">K&apos;s VOX</span>
          <span className="brand-sub">投稿スタジオ</span>
        </div>
        <button className="btn btn-ghost" onClick={openSettings}>
          K&apos;s VOX資料・設定
        </button>
      </header>

      <main className="layout">
        {/* ── 左：操作 ── */}
        <div className="controls">
          <section className="block">
            <h2 className="block-title">フォーマット</h2>
            <div className="seg">
              {[
                ['square', '正方形 1:1', 'GBP・Instagram・X'],
                ['vertical', '縦長 9:16', 'TikTok・リール・ストーリーズ'],
              ].map(([v, name, sub]) => (
                <button
                  key={v}
                  className={`seg-item ${format === v ? 'is-on' : ''}`}
                  onClick={() => setFormat(v)}
                  aria-pressed={format === v}
                >
                  <span className="seg-name">{name}</span>
                  <span className="seg-sub">{sub}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <h2 className="block-title">シリーズタグ</h2>
            <input
              className="input input-mincho"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="例：英語で歌えば上手くなる"
            />
            <label className="check">
              <input type="checkbox" checked={showUrl} onChange={(e) => setShowUrl(e.target.checked)} />
              <span>下部に www.ksvox.net を入れる</span>
            </label>
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
                  <textarea
                    className="input"
                    rows={2}
                    value={aiExtra}
                    onChange={(e) => setAiExtra(e.target.value)}
                    placeholder="例：場所は誰もいない静かな海辺"
                  />
                </label>
                <p className="hint">選ばなかった項目はおまかせです。項目と追加の指示が食い違うときは、追加の指示が優先されます。K&apos;s VOXらしい質感（シネマティック・暖色系・文字なし）は自動で加わります。</p>
                {aiError && <p className="error">{aiError}</p>}
                <div className="ai-actions">
                  <button
                    className="link"
                    onClick={() => {
                      setAiChoices({});
                      setAiExtra('');
                    }}
                  >
                    選択をリセット
                  </button>
                  <button className="btn btn-primary" onClick={generateAi} disabled={aiBusy || !aiReady}>
                    {aiBusy ? '生成しています…（10〜30秒）' : '画像を生成する'}
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
          </section>

          {current && (
            <section className="block">
              <div className="block-head">
                <h2 className="block-title">キャッチと写真（{active + 1}枚目）</h2>
                {current.bgType && (
                  <button className="link" onClick={redrawBackground}>
                    背景を描き直す
                  </button>
                )}
              </div>
              <textarea
                className="input input-catch"
                rows={2}
                value={current.catch}
                onChange={(e) => updateActive({ catch: e.target.value.split('\n').slice(0, 2).join('\n') })}
                placeholder={'人生経験を積んだ今だから、\n歌える歌がある'}
              />
              <p className="hint">改行した位置で2行に分かれます（最大2行）。</p>
              {shrunk && <p className="warn">文字が長いため、画像からはみ出さないよう自動で小さくしています。</p>}

              <div className="sub-label">文字色</div>
              <div className="swatches">
                {COLORS.map((c) => (
                  <button
                    key={c.v}
                    className={`swatch ${current.color.toUpperCase() === c.v ? 'is-on' : ''}`}
                    style={{ background: c.v }}
                    onClick={() => updateActive({ color: c.v })}
                    aria-label={c.n}
                    title={c.n}
                  />
                ))}
                <label className="swatch-free" title="自由に選ぶ">
                  <input type="color" value={current.color} onChange={(e) => updateActive({ color: e.target.value.toUpperCase() })} />
                  <span>自由に選ぶ</span>
                </label>
              </div>

              <div className="sub-label">
                文字サイズ <span className="value">{current.size}</span>
              </div>
              <div className="range-row">
                <input
                  type="range"
                  min={40}
                  max={130}
                  value={current.size}
                  onChange={(e) => updateActive({ size: Number(e.target.value) })}
                />
                <button className="link" onClick={() => updateActive({ size: DEFAULT_CATCH_SIZE })}>
                  標準に戻す
                </button>
              </div>

              <div className="sub-label">
                写真の暗さ <span className="value">{current.dim}%</span>
              </div>
              <div className="range-row">
                <input
                  type="range"
                  min={0}
                  max={70}
                  value={current.dim}
                  onChange={(e) => updateActive({ dim: Number(e.target.value) })}
                />
                <button className="link" onClick={() => updateActive({ dim: autoDimFor(current.source) })}>
                  おまかせ
                </button>
              </div>
              <div className="seg seg-small">
                {[
                  ['center', '文字の周りだけ'],
                  ['all', '写真全体'],
                ].map(([v, name]) => (
                  <button
                    key={v}
                    className={`seg-item ${current.dimMode === v ? 'is-on' : ''}`}
                    onClick={() => updateActive({ dimMode: v })}
                    aria-pressed={current.dimMode === v}
                  >
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
                  <label className="sub-label" htmlFor="dur">1枚の表示時間</label>
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
          </section>

          <section className="block caption">
            <div className="block-head">
              <h2 className="block-title">説明文とハッシュタグ</h2>
              <button className="btn" onClick={makeCaption} disabled={capBusy}>
                {capBusy ? '作成しています…' : caption ? '作り直す' : '作成する'}
              </button>
            </div>
            <p className="hint">シリーズタグ・キャッチ・AI画像の内容とK&apos;s VOX資料をもとに作ります。画像には入りません。</p>
            {capError && <p className="error">{capError}</p>}

            <div className="copy-head">
              <span className="sub-label">説明文</span>
              <button className="link" onClick={() => copy(caption, '説明文')} disabled={!caption.trim()}>
                コピー
              </button>
            </div>
            <textarea className="input" rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} />

            <div className="copy-head">
              <span className="sub-label">ハッシュタグ</span>
              <button className="link" onClick={() => copy(tagsText, 'ハッシュタグ')} disabled={!tagsText}>
                コピー
              </button>
            </div>
            <div className="tags">
              {hashtags.map((h, i) => (
                <input
                  key={i}
                  className="input"
                  value={h}
                  onChange={(e) => setHashtags((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                />
              ))}
            </div>
            <button className="link" onClick={() => copy(`${caption}\n\n${tagsText}`, '説明文とハッシュタグ')} disabled={!caption.trim()}>
              説明文とハッシュタグをまとめてコピー
            </button>
          </section>
        </div>
      </main>

      {settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">K&apos;s VOX資料</h2>
            <p className="hint">説明文とハッシュタグを作るときの参考資料です。書き換えると次の作成から反映されます（このブラウザに保存されます）。</p>
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
