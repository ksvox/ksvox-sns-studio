// AI画像生成の項目と、画像AIに伝わりやすい英語表現の対応表
// label：画面に出る日本語 / en：画像AIに渡す英語（選ばなかった項目は何も指定しない）
export const PROMPT_FIELDS = [
  {
    key: 'subject',
    label: '被写体',
    options: [
      { id: 'woman', label: '歌う女性' },
      { id: 'man', label: '歌う男性' },
      { id: 'lesson', label: '講師と生徒のレッスン風景' },
      { id: 'piano', label: 'ピアノ伴奏と歌い手' },
      { id: 'none', label: '人物なし（空間・楽器のみ）' },
    ],
  },
  {
    key: 'people',
    label: '人物',
    options: [
      { id: 'jp', label: '日本人', en: 'Japanese' },
      { id: 'west', label: '外国人（欧米系）', en: 'Western' },
    ],
  },
  {
    key: 'age',
    label: '年代',
    options: [
      { id: '20s', label: '20代', en: 'in their 20s' },
      { id: '30s', label: '30代', en: 'in their 30s' },
      { id: '40s', label: '40代', en: 'in their 40s' },
      { id: '50s', label: '50代以上', en: 'in their 50s or 60s' },
    ],
  },
  {
    key: 'place',
    label: '場所',
    options: [
      { id: 'lesson', label: 'レッスンスタジオ', en: 'in a cozy private vocal lesson studio with an upright piano and a music stand' },
      { id: 'recording', label: 'レコーディングスタジオ', en: 'in a professional recording studio with a large condenser microphone and pop filter' },
      { id: 'stage', label: 'ライブのステージ', en: 'on a live music stage with atmospheric haze' },
      { id: 'pianoroom', label: 'ピアノのある部屋', en: 'in an elegant room with a grand piano and tall windows' },
      { id: 'home', label: '窓辺・自宅', en: 'by a window in a calm home interior' },
    ],
  },
  {
    key: 'shot',
    label: '構図（画角）',
    options: [
      { id: 'closeup', label: '顔のアップ', en: 'close-up portrait shot, 85mm lens' },
      { id: 'upper', label: '上半身', en: 'medium shot from the waist up, 50mm lens' },
      { id: 'full', label: '全身', en: 'full body shot, 35mm lens' },
      { id: 'wide', label: '引きの全景', en: 'wide establishing shot showing the whole space, 24mm lens' },
      { id: 'profile', label: '横顔', en: 'side profile view' },
      { id: 'back', label: '後ろ姿', en: 'shot from behind, subject facing away from the camera' },
    ],
  },
  {
    key: 'angle',
    label: 'アングル',
    options: [
      { id: 'eye', label: '目線の高さ', en: 'eye-level camera angle' },
      { id: 'low', label: '下から見上げる', en: 'low-angle shot looking up' },
      { id: 'high', label: '上から見下ろす', en: 'high-angle shot looking down' },
    ],
  },
  {
    key: 'light',
    label: '光',
    options: [
      { id: 'window', label: '窓からの自然光', en: 'soft natural window light' },
      { id: 'golden', label: '夕暮れの黄金色の光', en: 'warm golden hour sunset light' },
      { id: 'spot', label: 'スポットライト', en: 'dramatic spotlight from above against a dark background' },
      { id: 'warm', label: '暖かい室内照明', en: 'warm tungsten indoor lighting with practical lamps' },
      { id: 'backlight', label: '逆光のシルエット', en: 'strong backlight creating a silhouette with a glowing rim light' },
    ],
  },
  {
    key: 'mood',
    label: '表情・雰囲気',
    options: [
      { id: 'passion', label: '情熱的に歌う', en: 'singing passionately with deep emotion' },
      { id: 'closed', label: '目を閉じて浸る', en: 'eyes closed, immersed in the music' },
      { id: 'smile', label: '笑顔', en: 'smiling warmly' },
      { id: 'serious', label: '真剣な表情', en: 'serious, focused expression' },
      { id: 'troubled', label: '悩んでいる', en: 'looking troubled and uncertain, deep in thought' },
    ],
  },
];

function find(key, id) {
  const f = PROMPT_FIELDS.find((x) => x.key === key);
  return f && f.options.find((o) => o.id === id);
}

// 選んだ項目 → 英語の指示文
export function buildEnglishFromChoices(choices = {}) {
  const people = find('people', choices.people);
  const age = find('age', choices.age);
  const nat = people ? `${people.en} ` : '';
  const ageEn = age ? ` ${age.en}` : '';
  const parts = [];

  switch (choices.subject) {
    case 'woman':
      parts.push(`a ${nat}female vocalist${ageEn} singing`);
      break;
    case 'man':
      parts.push(`a ${nat}male vocalist${ageEn} singing`);
      break;
    case 'lesson':
      parts.push(
        `a ${nat}vocal coach teaching a student${ageEn} in a private one-on-one voice lesson, the coach gesturing while explaining`
      );
      break;
    case 'piano':
      parts.push(`a ${nat}singer${ageEn} performing while a pianist plays a grand piano beside them`);
      break;
    case 'none':
      parts.push('an atmospheric scene with no people');
      break;
    default:
      if (nat || ageEn) parts.push(`a ${nat}person${ageEn}`);
  }

  const withPerson = choices.subject !== 'none';
  for (const key of ['mood', 'place', 'shot', 'angle', 'light']) {
    if (key === 'mood' && !withPerson) continue;
    const o = find(key, choices[key]);
    if (o) parts.push(o.en);
  }
  return parts.join(', ');
}

// 選んだ項目 → 日本語の要約（説明文づくりの参考用）
export function summarizeChoicesJa(choices = {}, extra = '') {
  const parts = PROMPT_FIELDS.map((f) => {
    const o = f.options.find((x) => x.id === choices[f.key]);
    return o ? `${f.label}：${o.label}` : null;
  }).filter(Boolean);
  if (extra && extra.trim()) parts.push(`追加：${extra.trim()}`);
  return parts.join(' / ');
}
