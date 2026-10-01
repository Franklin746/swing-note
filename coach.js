// レッスン内容にもとづくチェック項目・練習ドリル・比較・球筋・AI連携
import { clamp, deg, esc, seekTo, Settings, isNum, fmtDate, todayISO } from './util.js';
import { FR, MARKS, makeCtx, frameMetrics, metricsFor, fmtMetric, leadJP, trailJP } from './pose.js';

// ===== レッスンの重点項目とドリル =====
export const ITEMS = [
  { id: 'takeaway', title: '始動でクラブを地面に押し付けない',
    point: '押し付けると始動で左肩と頭が下がり、スイングのバランスが崩れる。脊椎を軸に素直に回し、とにかくゆっくり上げる。',
    kw: ['押し付け', '左肩と頭', '頭が低', '脊椎軸', '始動'],
    drills: [
      { name: '始動だけの反復', how: '左小指と右人差し指をてこに、右斜め上（10°くらい）へコックを入れる「釣り」の動きだけを繰り返す。地面に押し付けない。', reps: '10回×2' },
      { name: '頭の高さを動画で確認', how: '後方か正面から撮り、このアプリの「頭の位置」表示で始動〜トップに頭と左肩が下がっていないかを見る。', reps: '練習の最初と最後' },
    ] },
  { id: 'backswing', title: 'ゆっくり上げてコンパクトなトップ',
    point: 'コックを入れたらそのまま肩を回してトップへ。両脇は閉じ、手は常に胸の正面。手で上げる・早く上げるとオーバースイングやクロスになる。',
    kw: ['ゆっくり', '早くあげ', '早く上げ', 'オーバースイング', '手であげ', '手で上げ', 'クロス', '両脇', '胸の正面', 'トップ', 'コック'],
    drills: [
      { name: '2段階テイクバック', how: '①始動でコックを入れる ②そのまま肩を回してトップ、の2段階で区切って上げる。慣れるまでぎこちなくてよい。', reps: '10回' },
      { name: '腕クロスの肩回し', how: '両手を胸の前でクロスして肩を触り、肩を回す。上から見て左肩が右足の右側に入るくらいまで。', reps: '10回×2' },
      { name: '3秒テイクバック', how: '3秒かけて上げて一瞬止める。腕が地面と平行の位置でクラブが地面と垂直になっているかを確認。', reps: '10回' },
    ] },
  { id: 'transition', title: '切り返しの前に左母指球へ体重',
    point: 'トップで左の母指球に体重を移してから切り返す。インパクトまでに力を出し切り、あとは惰性でフィニッシュ。8時までは脱力してヘッドの重さで下ろす。',
    kw: ['母指球', '体重を移', '体重を乗', '体重乗', '切り返', '左足に乗', '100パー', '力を出し切', '力使い切', '惰性', '脱力', 'ヘッドの重さ'],
    drills: [
      { name: 'ペットボトル落とし', how: 'ペットボトルなど軽い物を持ち、11時・10時の位置から9時まで「フッ」と落とす。腕の力ではなく重さで下ろす感覚。', reps: '10回' },
      { name: 'トップで一拍おく素振り', how: 'トップで一瞬止め、左母指球に乗ったのを感じてから下ろす。', reps: '10回' },
      { name: 'パンチショット', how: 'インパクトまで100%、インパクト後は0%で惰性。フォローは小さくてよい。', reps: '10球' },
    ] },
  { id: 'impact_straight', title: 'インパクト前後15〜20cmはまっすぐ',
    point: 'インパクトの前後15〜20cmはフェースの向きを変えずにまっすぐ。その後は左小指で引っ張ってインへ。手首は捻らない。体と左手の距離は変えない。',
    kw: ['15センチ', '20センチ', '15cm', '20cm', 'フェースの向き', 'フェースを回', '捻', 'ストレート', '真っ直ぐ', 'まっすぐ', '左小指', '小指で引', '小指、引', 'インに引', 'イン側に引', '体と左手の距離'],
    drills: [
      { name: '9時3時のハーフショット', how: '手首の角度を変えずに9時→3時で打ち、低くまっすぐ打ち出す。9時3時ができればフルショットも同じ。', reps: '10球×3' },
      { name: '右足を引いてハーフ／パンチ', how: '右足を靴1足分うしろに引いて9時3時のハーフショット・パンチショット。球をつかまえる感覚づくり。右に出たらやり直し。', reps: '10球×2' },
      { name: '左小指で引っ張る素振り', how: 'インパクト後に左小指でグリップをイン側へ引っ張り続ける意識で、9時3時の連続素振り。', reps: '20回' },
    ] },
  { id: 'wrist', title: '手首の角度を変えない',
    point: '9時3時でもアプローチでも、手首の角度は常に変えない。緩むと高い球が出る（低い球が正解）。腰が左に流れると手首の角度が解ける。',
    kw: ['手首の角度', '手首を動か', '手首が緩', '手首を緩', '手首で何か', '解ける', '手首'],
    drills: [
      { name: '低い球のハーフショット', how: '手首を緩ませずに低い球で打ち出す。高く上がったら手首が緩んでいるサイン。', reps: '10球×2' },
      { name: '足を閉じたアプローチ', how: '足は靴1個分くらいだけ開けて構え、手首の角度を変えずに低い球。くっつけると不安定すぎる。', reps: '10球' },
    ] },
  { id: 'hips', title: '腰を回しすぎない・胸を開かない',
    point: 'インパクトでは胸がボールを向き、腰は45°くらい（骨盤のラインは目標より右を向いて閉じているイメージ）。右腰がターゲット側に回る・胸が開くと手元が浮いてフェースが開き、シャンクや右への球、高い球の原因に。腰はインパクトの後に惰性で回す。',
    kw: ['腰', '骨盤', '胸が', '胸がボール', '開い', 'シャンク', '右腰', '手元が浮', '右側が強'],
    drills: [
      { name: '右腰を止めるハーフショット', how: '右腰をターゲット側に入れず、腰の回転が止まる反動でヘッドを走らせる。', reps: '10球×2' },
      { name: '壁を押すイメージ', how: '腕を伸ばして壁を押すタイプ。インパクトで前に押す感覚を素振りで確かめる。', reps: '10回' },
      { name: '右のバッグを上から叩く', how: '体の右にあるバッグを上から叩くイメージで、トップから真下にチョップ的に下ろす。', reps: '10回' },
    ] },
  { id: 'eyes', title: '目線はボールの後ろ',
    point: '顔・目線はボールの20cm後ろを見ながらインパクト（ドライバーは50〜60cm後ろ）。',
    kw: ['目線', '顔', '後ろ', '後側'],
    drills: [
      { name: '目印を見たままハーフショット', how: 'ボールの20cm後ろ（ドライバーは50〜60cm後ろ）にコインなどを置き、インパクトまでそれを見続ける。', reps: '10球' },
    ] },
  { id: 'knees', title: '膝の使い方',
    point: '10時→9時で膝が沈み、左膝を先に伸ばしながら両膝が伸びてインパクト（インパクトで右膝は伸び切る）。アドレスでは膝は少し緩める程度。',
    kw: ['膝', 'ひざ', 'ハムストリング'],
    drills: [
      { name: '膝のスロー素振り', how: '10時→9時で膝を沈め、左膝から伸ばして両膝が伸びた状態でインパクトの位置へ。ゆっくり。', reps: '10回' },
    ] },
  { id: 'address', title: 'アドレス',
    point: '膝は伸ばした状態から少し緩める程度、ハムストリングを伸ばし母指球に体重、右ひじ・腕は脱力、右股関節を少し下げる。ボールは真ん中よりボール1個くらい左。1Wは前よりボールの近くに立ち、腕をピンと張らない。',
    kw: ['アドレス', '構え', 'ハムストリング', '右肘', '右ひじ', '股関節', 'ボールの位置', '球の置く', '真ん中', '近くに立', 'ピンと張', 'グリップ', 'ロフト'],
    drills: [
      { name: '刀持ちから構える', how: 'クラブを刀のように体の前で垂直に持って肩の力を抜く。ひじも緩むので、パターのようにそのまま前傾して構える。', reps: '毎ショット前' },
      { name: 'ボール位置の目印', how: 'スタンスの真ん中にスティックを置き、ボールはそこから1個くらい左。', reps: '練習の最初' },
    ] },
  { id: 'finish', title: 'フィニッシュ',
    point: '左足8：右足2（全部左はやりすぎ）。左かかと・右母指球で立ち、両手は左耳と左肩の間に上に引く。',
    kw: ['フィニッシュ', '左耳', '左踵', '左かかと'],
    drills: [
      { name: 'フィニッシュで3秒静止', how: '左足8：右足2で3秒止まれるか。両手が左耳と左肩の間に収まっているかを動画で確認。', reps: '毎ショット' },
    ] },
  { id: 'downswing', title: 'インに入れず、真下に下ろす',
    point: '8時の位置まではまっすぐ引き、インには入れない。トップからは真下に投げ下ろすイメージ。インアウトは煽り打ちになる。',
    kw: ['真下', 'インには', 'インに入', 'インアウト', '煽り', '8時', 'チョップ', '叩く', '投げ下ろ'],
    drills: [
      { name: '8時までまっすぐ引く', how: 'テイクバックの最初はヘッドを8時の位置までまっすぐ引く。インに入れない。', reps: '10回' },
      { name: '真下への投げ下ろし素振り', how: 'トップから真下に物を投げ下ろすイメージで素振り。', reps: '10回' },
    ] },
  { id: 'approach', title: 'アプローチ・傾斜',
    point: '足閉じアプローチ（靴1個分）で手首の角度を変えず低い球。傾斜がきついときは左足側にボールを置いて左足軸、8割で打つ（足りなければ番手を上げる）。',
    kw: ['アプローチ', '足閉じ', '傾斜', '左足上がり', '左足下がり', '下り'],
    drills: [
      { name: '足閉じアプローチ', how: '足を靴1個分あけて構え、テイクバックで地面に押し付けず、手首の角度を変えずに低い球。', reps: '10球' },
    ] },
];
export const itemById = id => ITEMS.find(i => i.id === id);

// 質問文の言い回しから関連項目を引く
const SYN = [
  [/スライス|右に(出|飛|曲)|プッシュ|こす/, ['hips', 'impact_straight']],
  [/シャンク/, ['hips', 'impact_straight']],
  [/フック|引っか|引っ掛|チーピン|左に(出|飛|曲)/, ['impact_straight', 'hips']],
  [/ダフ|トップ(した|する|が出)|薄い|厚い/, ['transition', 'knees']],
  [/高い球|上がりすぎ|吹け/, ['wrist', 'hips']],
  [/上がらない|低すぎ/, ['address', 'transition']],
  [/飛ばない|飛距離|飛ばし/, ['transition', 'address']],
  [/テンポ|リズム|打ち急/, ['backswing', 'transition']],
  [/ドライバー|1W|ウッド/, ['address', 'impact_straight']],
  [/アプローチ|ウェッジ|58|寄せ/, ['approach', 'wrist']],
  [/傾斜|つま先|左足上がり|左足下がり/, ['approach']],
  [/オーバースイング|トップが/, ['backswing']],
  [/頭|ヘッドアップ|目線/, ['eyes', 'takeaway']],
];

// ===== レッスンメモ =====
const DATE_RE = /^\s*(\d{4})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})\s*日?\s*(.*)$/;
export function splitNotes(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    const m = line.match(DATE_RE);
    if (m) {
      const p = n => String(n).padStart(2, '0');
      cur = { date: `${m[1]}-${p(m[2])}-${p(m[3])}`, title: m[4].trim() || 'レッスン', text: '' };
      out.push(cur);
      continue;
    }
    if (!cur) { if (!line.trim()) continue; cur = { date: todayISO(), title: 'レッスンメモ', text: '' }; out.push(cur); }
    cur.text += line + '\n';
  }
  for (const n of out) n.text = n.text.replace(/^\n+|\s+$/g, '');
  return out.filter(n => n.text);
}
const EMPH = /[★⭐🌟⚠‼❗]|重要|大事|絶対|論外|やりがち/;
export function noteHits(note, item) {
  const lines = note.text.split('\n').map(s => s.trim()).filter(Boolean);
  const hit = [];
  for (const l of lines) if (item.kw.some(k => l.includes(k))) hit.push({ line: l, emph: EMPH.test(l) });
  return hit;
}

// ===== スイングの計測値 =====
export function swingStats(sw, track) {
  const m = sw.markers || {};
  const c = makeCtx(sw, track);
  const at = {};
  if (!track) return { c, at, early: null, tempo: null };
  for (const M of MARKS) {
    if (m[M.k] == null) continue;
    const lm = track.at(m[M.k], new Float32Array(FR));
    if (lm) at[M.k] = { lm, m: frameMetrics(lm, c) };
  }
  let early = null;
  if (m.address != null && m.top != null && m.top > m.address) {
    const lm = track.at(m.address + (m.top - m.address) * 0.35, new Float32Array(FR));
    if (lm) early = { lm, m: frameMetrics(lm, c) };
  }
  const tempo = (m.address != null && m.top != null && m.impact != null && m.top > m.address && m.impact > m.top)
    ? (m.top - m.address) / (m.impact - m.top) : null;
  let ballPos = null;
  if (sw.view === 'face' && sw.ball?.pos && at.address) {
    const lm = at.address.lm, ld = c.s.lead.an, tr = c.s.trail.an;
    if (lm[ld * 6 + 2] >= 0.4 && lm[tr * 6 + 2] >= 0.4) {
      const la = lm[ld * 6], ta = lm[tr * 6], w = la - ta;
      if (Math.abs(w) > 0.01) ballPos = (sw.ball.pos[0] - (la + ta) / 2) / w; // ＋＝目標側（スタンス幅比）
    }
  }
  let finishHands = null;
  if (sw.view === 'face' && at.finish) {
    const lm = at.finish.lm, e = c.s.lead.ear, s = c.s.lead.sh;
    if ([15, 16, e, s].every(i => lm[i * 6 + 2] >= 0.4)) {
      const hy = (lm[15 * 6 + 1] + lm[16 * 6 + 1]) / 2, ey = lm[e * 6 + 1], sy = lm[s * 6 + 1];
      if (sy - ey > 0.005) finishHands = (sy - hy) / (sy - ey); // 0＝肩の高さ、1＝耳の高さ
    }
  }
  return { c, at, early, tempo, ballPos, finishHands };
}
const g = (st, k, key) => st?.at?.[k]?.m?.[key];
const r0 = v => Math.round(v);

// ===== レッスン項目に沿ったチェック =====
// 戻り値: { id, item, label, status: 'ok'|'warn', text, vsBest }
const CHECKS = [
  { id: 'head_takeaway', item: 'takeaway', label: '始動〜トップの頭の高さ', run(st, sw, bs) {
    const e = st.early?.m.headDrop, t = g(st, 'top', 'headDrop');
    if (!isNum(e) && !isNum(t)) return null;
    const v = Math.max(isNum(e) ? e : -9, isNum(t) ? t : -9);
    const bv = bs ? Math.max(bs.early?.m.headDrop ?? -9, g(bs, 'top', 'headDrop') ?? -9) : null;
    const warn = v > 0.15 || (isNum(bv) && bv > -9 && v - bv > 0.1);
    const pct = r0(Math.max(0, v) * 100);
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `始動〜トップで頭が下がっています（頭の大きさの約${pct}%）。クラブを地面に押し付けていないか確認。` : '始動〜トップで頭の高さをキープできています。',
      vsBest: isNum(bv) && bv > -9 ? `ベスト：約${r0(Math.max(0, bv) * 100)}%` : null };
  } },
  { id: 'tempo', item: 'backswing', label: 'テンポ（上げる：下ろす）', run(st, sw, bs) {
    const v = st.tempo; if (!isNum(v)) return null;
    const bv = bs?.tempo;
    const warn = v < 2.2 || (isNum(bv) && v < bv * 0.85);
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `上げるのが速めです（${v.toFixed(1)}：1）。「とにかくゆっくり上げる」を意識。` : `テンポは ${v.toFixed(1)}：1 で、ゆっくり上げられています。`,
      vsBest: isNum(bv) ? `ベスト：${bv.toFixed(1)}：1` : null };
  } },
  { id: 'elbow_top', item: 'backswing', label: 'トップのリード腕', run(st, sw, bs) {
    const v = g(st, 'top', 'leadElbow'); if (!isNum(v)) return null;
    const bv = g(bs, 'top', 'leadElbow');
    const warn = v < 150 || (isNum(bv) && v < bv - 12);
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `トップで${leadJP(sw)}ひじが曲がっています（${r0(v)}°）。手で上げるとオーバースイングに。` : `トップの${leadJP(sw)}ひじは伸びています（${r0(v)}°）。`,
      vsBest: isNum(bv) ? `ベスト：${r0(bv)}°` : null };
  } },
  { id: 'top_height', item: 'backswing', label: 'トップの大きさ', run(st, sw, bs) {
    const v = g(st, 'top', 'handsHeight'), bv = g(bs, 'top', 'handsHeight');
    if (!isNum(v) || !isNum(bv)) return null;
    const warn = v > bv + 0.25;
    return { status: warn ? 'warn' : 'ok',
      text: warn ? 'トップの手の位置がベストより高め（オーバースイング気味）。' : 'トップの大きさはベストと同じくらい。',
      vsBest: null };
  } },
  { id: 'weight_top', item: 'transition', label: 'トップでの体重（目安）', views: ['face'], run(st, sw) {
    const v = g(st, 'top', 'weight'); if (!isNum(v)) return null;
    const warn = v < 0.42;
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `トップで体重が${trailJP(sw)}に残っています（${leadJP(sw)}足寄り ${r0(clamp(v, 0, 1) * 100)}%）。左母指球に乗せてから切り返す。` : `トップで${leadJP(sw)}足側に乗れています（${r0(clamp(v, 0, 1) * 100)}%）。` };
  } },
  { id: 'wrist', item: 'wrist', label: '手首の角度の変化', run(st, sw, bs) {
    const a = g(st, 'address', 'leadWrist'), i = g(st, 'impact', 'leadWrist');
    if (!isNum(a) || !isNum(i)) return null;
    const d = i - a;
    const ba = g(bs, 'address', 'leadWrist'), bi = g(bs, 'impact', 'leadWrist');
    const bd = isNum(ba) && isNum(bi) ? bi - ba : null;
    const warn = Math.abs(d) > 18 || (isNum(bd) && Math.abs(d) - Math.abs(bd) > 10);
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `インパクトで${leadJP(sw)}手首の角度がアドレスから約${r0(Math.abs(d))}°変わっています。` : `${leadJP(sw)}手首の角度はアドレスとほぼ同じでインパクト（差${r0(Math.abs(d))}°）。`,
      vsBest: isNum(bd) ? `ベスト：差${r0(Math.abs(bd))}°` : null };
  } },
  { id: 'hand_dist', item: 'impact_straight', label: '体と手の距離', run(st, sw) {
    const a = g(st, 'address', 'handDist'), i = g(st, 'impact', 'handDist');
    if (!isNum(a) || !isNum(i) || a <= 0) return null;
    const r = i / a, warn = Math.abs(r - 1) > 0.18;
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `インパクトで体と${leadJP(sw)}手の距離がアドレスより約${r0(Math.abs(r - 1) * 100)}%${r > 1 ? '離れて' : '近づいて'}います。` : `体と${leadJP(sw)}手の距離はアドレスとほぼ同じ。` };
  } },
  { id: 'chest_open', item: 'hips', label: 'インパクトの胸の向き', run(st, sw, bs) {
    const v = g(st, 'impact', 'chestTurn'); if (!isNum(v)) return null;
    const bv = g(bs, 'impact', 'chestTurn');
    const warn = v > 25 || (isNum(bv) && v > bv + 12);
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `インパクトで胸が約${r0(v)}°開いています。胸はボールを向くのが正解（開くとシャンク・右への球の原因）。` : `インパクトで胸はボール方向を向けています（${r0(v)}°）。`,
      vsBest: isNum(bv) ? `ベスト：${r0(bv)}°` : null };
  } },
  { id: 'hip_turn', item: 'hips', label: 'インパクトの腰の回転', run(st, sw, bs) {
    const v = g(st, 'impact', 'hipTurn'); if (!isNum(v)) return null;
    const bv = g(bs, 'impact', 'hipTurn');
    const warn = v > 65 || (isNum(bv) && v > bv + 15);
    return { status: warn ? 'warn' : 'ok',
      text: warn ? `インパクトで腰が回りすぎています（約${r0(v)}°）。目安は45°くらい、回すのはインパクトの後。` : `インパクトの腰の回転は約${r0(v)}°。`,
      vsBest: isNum(bv) ? `ベスト：${r0(bv)}°` : null };
  } },
  { id: 'head_lat', item: 'eyes', label: 'インパクトの頭の位置', views: ['face'], run(st, sw, bs) {
    const v = g(st, 'impact', 'headLat'); if (!isNum(v)) return null;
    const bv = g(bs, 'impact', 'headLat');
    const warn = v > 0.25 || (isNum(bv) && v - bv > 0.2);
    return { status: warn ? 'warn' : 'ok',
      text: warn ? 'インパクトで頭が目標側に出ています。ボールの後ろを見たままインパクト。' : '頭はアドレスの位置からボールの後ろに残せています。' };
  } },
  { id: 'knees_impact', item: 'knees', label: 'インパクトの膝', run(st, sw) {
    const la = g(st, 'address', 'leadKnee'), li = g(st, 'impact', 'leadKnee');
    const ta = g(st, 'address', 'trailKnee'), ti = g(st, 'impact', 'trailKnee');
    if (!isNum(la) || !isNum(li)) return null;
    const dl = li - la, dt = isNum(ta) && isNum(ti) ? ti - ta : null;
    const bad = [];
    if (dl < -3) bad.push(`${leadJP(sw)}ひざ`);
    if (isNum(dt) && dt < -3) bad.push(`${trailJP(sw)}ひざ`);
    return { status: bad.length ? 'warn' : 'ok',
      text: bad.length ? `インパクトで${bad.join('と')}がアドレスより曲がっています。左膝から伸ばして両膝が伸びてインパクト。` : '両ひざがアドレスより伸びた状態でインパクトできています。' };
  } },
  { id: 'address_knee', item: 'address', label: 'アドレスの膝', run(st) {
    const a = g(st, 'address', 'leadKnee'), b = g(st, 'address', 'trailKnee');
    if (!isNum(a) || !isNum(b)) return null;
    const mn = Math.min(a, b), mx = Math.max(a, b);
    if (mn < 145) return { status: 'warn', text: `アドレスで膝を曲げすぎています（${r0(mn)}°）。伸ばした状態から少し緩める程度。` };
    if (mx > 176) return { status: 'warn', text: `アドレスで膝が伸びきっています（${r0(mx)}°）。少しだけ緩める。` };
    return { status: 'ok', text: `アドレスの膝は少し緩めた程度（${r0(mn)}〜${r0(mx)}°）。` };
  } },
  { id: 'address_arms', item: 'address', label: 'アドレスの腕の脱力', clubs: ['1W', '3W', '5W', 'UT'], run(st, sw) {
    const v = g(st, 'address', 'leadElbow'); if (!isNum(v)) return null;
    const warn = v > 176;
    return { status: warn ? 'warn' : 'ok', text: warn ? '腕がピンと張っています。刀持ちで肩とひじの力を抜いてから構える。' : '腕は張りすぎずに構えられています。' };
  } },
  { id: 'ball_pos', item: 'address', label: 'ボール位置', views: ['face'], run(st) {
    const v = st.ballPos; if (!isNum(v)) return null;
    const warn = v < 0;
    return { status: warn ? 'warn' : 'ok',
      text: warn ? 'ボールが真ん中より右（目標と反対側）にあります。真ん中よりボール1個くらい左が目安。' : `ボールは真ん中より左（スタンス幅の約${r0(v * 100)}%）。` };
  } },
  { id: 'finish_weight', item: 'finish', label: 'フィニッシュの体重（目安）', views: ['face'], run(st, sw) {
    const v = g(st, 'finish', 'weight'); if (!isNum(v)) return null;
    if (v > 1.02) return { status: 'warn', text: `${leadJP(sw)}足に乗りすぎています。全部左はやりすぎ、8：2が目安。` };
    if (v < 0.6) return { status: 'warn', text: `${leadJP(sw)}足に乗り切れていません（約${r0(clamp(v, 0, 1) * 100)}%）。8：2が目安。` };
    return { status: 'ok', text: `8：2に近いフィニッシュ（${leadJP(sw)}足寄り 約${r0(Math.min(v, 1) * 100)}%）。` };
  } },
  { id: 'finish_hands', item: 'finish', label: 'フィニッシュの手の位置', views: ['face'], run(st) {
    const v = st.finishHands; if (!isNum(v)) return null;
    if (v > 1.7) return { status: 'warn', text: '両手が左耳より高く上がりすぎています。左耳と左肩の間へ。' };
    if (v < -0.1) return { status: 'warn', text: '両手が左肩より低い位置です。左耳と左肩の間に上に引く。' };
    return { status: 'ok', text: '両手は左耳と左肩のあたりに収まっています。' };
  } },
  { id: 'ball_start', item: 'hips', label: '打ち出し', run(st, sw) {
    const s = sw.result?.start || sw.ball?.auto?.start;
    if (!s) return null;
    if (s === 'right') return { status: 'warn', text: '球が右に出ています。レッスンでは「胸が開き手元が遅れてフェースが開く」のが原因とされています。' };
    if (s === 'left') return { status: 'warn', text: '球が左に出ています。インパクト前後でフェースを回していないか（手首を捻らない）確認。' };
    return { status: 'ok', text: 'まっすぐ打ち出せています。' };
  } },
];

export function runChecks(sw, track, best, bestTrack) {
  const st = swingStats(sw, track);
  const bs = best && bestTrack && best.view === sw.view ? swingStats(best, bestTrack) : null;
  const out = [];
  for (const C of CHECKS) {
    if (C.views && !C.views.includes(sw.view)) continue;
    if (C.clubs && !C.clubs.includes(sw.club)) continue;
    let r = null;
    try { r = C.run(st, sw, bs); } catch (e) { console.warn(C.id, e); }
    if (r) out.push({ id: C.id, item: C.item, label: C.label, ...r });
  }
  return { checks: out, st, bs };
}

// ベストとの角度比較表
export function compareTable(sw, st, bs) {
  const rows = [];
  for (const M of metricsFor(sw)) {
    const cells = MARKS.map(K => {
      const a = g(st, K.k, M.k), b = g(bs, K.k, M.k);
      return { cur: a, best: b, d: isNum(a) && isNum(b) ? a - b : null };
    });
    if (cells.some(c => isNum(c.cur) || isNum(c.best))) rows.push({ M, cells });
  }
  return rows;
}
export { fmtMetric };

// ===== 打球の結果 =====
export const RESULT = {
  start: { jp: '打ち出し', opts: [['left', '左'], ['straight', 'まっすぐ'], ['right', '右']] },
  curve: { jp: '曲がり', opts: [['hook', 'フック'], ['draw', 'ドロー'], ['straight', 'ストレート'], ['fade', 'フェード'], ['slice', 'スライス']] },
  height: { jp: '高さ', opts: [['low', '低い'], ['mid', '普通'], ['high', '高い']] },
  contact: { jp: '当たり', opts: [['good', '芯'], ['fat', 'ダフリ'], ['thin', 'トップ'], ['shank', 'シャンク'], ['toe', '先']] },
};
export const resultJP = (k, v) => RESULT[k]?.opts.find(o => o[0] === v)?.[1] || '';

export function tendency(swings) {
  const by = new Map();
  for (const s of swings) {
    const r = s.result || {};
    const start = r.start || s.ball?.auto?.start;
    const height = r.height || s.ball?.auto?.height;
    if (!start && !r.curve && !height && !r.contact) continue;
    if (!by.has(s.club)) by.set(s.club, { club: s.club, n: 0, start: {}, curve: {}, height: {}, contact: {} });
    const t = by.get(s.club);
    t.n++;
    if (start) t.start[start] = (t.start[start] || 0) + 1;
    if (r.curve) t.curve[r.curve] = (t.curve[r.curve] || 0) + 1;
    if (height) t.height[height] = (t.height[height] || 0) + 1;
    if (r.contact) t.contact[r.contact] = (t.contact[r.contact] || 0) + 1;
  }
  return [...by.values()];
}
export function tendencyText(t) {
  const part = k => {
    const e = Object.entries(t[k]).sort((a, b) => b[1] - a[1]);
    return e.length ? `${RESULT[k].jp} ` + e.map(([v, n]) => `${resultJP(k, v)}${n}`).join('・') : '';
  };
  return ['start', 'curve', 'height', 'contact'].map(part).filter(Boolean).join(' ／ ');
}

// ===== 動画からボールの打ち出しを推定（判別できたときのみ） =====
const LAUNCH = { W: [9, 17], UT: [11, 20], LI: [11, 19], MI: [14, 23], WE: [20, 34] };
function clubGroup(c) {
  if (/W$/.test(c)) return 'W';
  if (c === 'UT') return 'UT';
  if (['4I', '5I', '6I'].includes(c)) return 'LI';
  if (['7I', '8I', '9I'].includes(c)) return 'MI';
  return 'WE';
}
export async function estimateBall(video, sw, onProgress) {
  const m = sw.markers || {}, pos = sw.ball?.pos;
  if (m.impact == null) return { ok: false, reason: 'インパクトのマーカーを先に設定してください。' };
  if (!pos) return { ok: false, reason: 'ボールの位置を指定してください。' };
  const fps = sw.fpsOverride || sw.fps || 30, fd = 1 / fps, dur = video.duration;
  const W = 360, H = Math.max(1, Math.round(video.videoHeight * W / video.videoWidth));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const frames = [];
  const N = 16;
  for (let i = -1; i <= N; i++) {
    const t = m.impact + i * fd;
    if (t < 0 || t > dur - 0.002) continue;
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data, gr = new Uint8Array(W * H);
    for (let k = 0, j = 0; k < gr.length; k++, j += 4) gr[k] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    frames.push({ i, g: gr });
    onProgress?.((i + 2) / (N + 2));
  }
  if (frames.length < 5) return { ok: false, reason: 'インパクト後のコマが足りません。' };
  const bx = pos[0] * W, by = pos[1] * H;
  const maxA = Math.max(40, (H * 0.04) ** 2);
  const cands = [];
  const mask = new Uint8Array(W * H), stack = new Int32Array(W * H);
  for (let f = 1; f < frames.length; f++) {
    if (frames[f].i < 1) continue;
    const A = frames[f - 1].g, B = frames[f].g;
    for (let k = 0; k < mask.length; k++) mask[k] = Math.abs(B[k] - A[k]) > 30 ? 1 : 0;
    for (let k = 0; k < mask.length; k++) {
      if (!mask[k]) continue;
      let sp = 0, area = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      stack[sp++] = k; mask[k] = 0;
      while (sp) {
        const q = stack[--sp], x = q % W, y = (q / W) | 0;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (area > maxA * 3) continue;
        if (x > 0 && mask[q - 1]) { mask[q - 1] = 0; stack[sp++] = q - 1; }
        if (x < W - 1 && mask[q + 1]) { mask[q + 1] = 0; stack[sp++] = q + 1; }
        if (y > 0 && mask[q - W]) { mask[q - W] = 0; stack[sp++] = q - W; }
        if (y < H - 1 && mask[q + W]) { mask[q + W] = 0; stack[sp++] = q + W; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (area < 2 || area > maxA || Math.max(bw, bh) / Math.min(bw, bh) > 6) continue;
      const cx = sx / area, cy = sy / area;
      if (cy > by + H * 0.03 || Math.hypot(cx - bx, cy - by) < 5) continue;
      cands.push({ x: cx, y: cy, f: frames[f].i, d: Math.hypot(cx - bx, cy - by) });
    }
  }
  if (cands.length < 3) return { ok: false, reason: 'ボールの動きを見つけられませんでした。三脚で固定し、スロー撮影にすると判別しやすくなります。' };
  const tol = Math.max(3, H * 0.012);
  let best = null;
  for (const s of cands) {
    const ux = (s.x - bx) / s.d, uy = (s.y - by) / s.d;
    const inl = cands.filter(c => ((c.x - bx) * ux + (c.y - by) * uy) > 0 && Math.abs((c.x - bx) * uy - (c.y - by) * ux) < tol);
    const byF = new Map();
    for (const c of inl) if (!byF.has(c.f) || byF.get(c.f).d < c.d) byF.set(c.f, c);
    const seq = [...byF.values()].sort((a, b) => a.f - b.f);
    let inc = 0;
    for (let k = 1; k < seq.length; k++) if (seq[k].d > seq[k - 1].d) inc++;
    const mono = seq.length > 1 ? inc / (seq.length - 1) : 0;
    const score = seq.length * mono;
    if (seq.length >= 3 && mono >= 0.7 && (!best || score > best.score || (score === best.score && seq[seq.length - 1].d > best.far))) {
      best = { score, seq, far: seq[seq.length - 1].d };
    }
  }
  if (!best) return { ok: false, reason: 'ボールの軌道を判別できませんでした（体やクラブの動きと区別できず）。' };
  let sx = 0, sy = 0;
  for (const c of best.seq) { sx += (c.x - bx) / c.d; sy += (c.y - by) / c.d; }
  const L = Math.hypot(sx, sy) || 1, ux = sx / L, uy = sy / L;
  const far = Math.max(best.far * 1.6, H * 0.25);
  const res = { ok: true, frames: best.seq.length, view: sw.view,
    pts: best.seq.map(c => [c.x / W, c.y / H]), end: [(bx + ux * far) / W, (by + uy * far) / H] };
  if (sw.view === 'face') {
    const launch = deg(Math.atan2(-uy, Math.abs(ux)));
    if (launch < -3 || launch > 70) return { ok: false, reason: '検出した動きがボールの軌道としては不自然でした。' };
    res.launch = launch;
    const [lo, hi] = LAUNCH[clubGroup(sw.club)];
    res.height = launch < lo ? 'low' : launch > hi ? 'high' : 'mid';
  } else {
    const side = deg(Math.atan2(ux, -uy));
    if (Math.abs(side) > 45) return { ok: false, reason: '検出した動きがボールの軌道としては不自然でした。' };
    res.side = side;
    res.start = side > 3 ? 'right' : side < -3 ? 'left' : 'straight';
  }
  return res;
}

// ===== 今の課題（レッスンメモ・スイング・球筋から集計） =====
export function buildFocus(notes, swings) {
  const now = Date.now();
  const map = new Map(ITEMS.map(it => [it.id, { it, score: 0, notes: [], swings: [], ball: [] }]));
  for (const n of notes) {
    const age = Math.max(0, (now - new Date(n.date).getTime()) / 864e5);
    const w = 0.6 + 1.6 * Math.exp(-age / 180); // 新しいレッスンほど重く
    for (const it of ITEMS) {
      const hits = noteHits(n, it);
      if (!hits.length) continue;
      const f = map.get(it.id);
      f.score += w * Math.min(3.5, hits.reduce((s, h) => s + (h.emph ? 2.5 : 1), 0));
      f.notes.push({ date: n.date, title: n.title, lines: hits.slice(0, 3).map(h => h.line) });
    }
  }
  const recent = swings.filter(s => !s.isBest && s.checks?.list?.length).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt).slice(0, 6);
  for (const s of recent) {
    for (const c of s.checks.list) {
      if (c.status !== 'warn') continue;
      const f = map.get(c.item);
      if (!f) continue;
      f.score += 6;
      f.swings.push({ date: s.date, club: s.club, text: c.text });
    }
  }
  for (const t of tendency(swings)) {
    if (t.n < 3) continue;
    const add = (id, text, wt) => { const f = map.get(id); f.score += wt; f.ball.push(text); };
    if ((t.start.right || 0) / t.n >= 0.4) { add('hips', `${t.club}：右に出る球が多い（${t.start.right}/${t.n}）`, 3); add('impact_straight', `${t.club}：右に出る球が多い`, 2); }
    if ((t.start.left || 0) / t.n >= 0.4) add('impact_straight', `${t.club}：左に出る球が多い（${t.start.left}/${t.n}）`, 3);
    if (t.contact.shank) add('hips', `${t.club}：シャンクが${t.contact.shank}回`, 4);
    if ((t.height.high || 0) / t.n >= 0.5) { add('wrist', `${t.club}：高い球が多い（${t.height.high}/${t.n}）`, 2); add('hips', `${t.club}：高い球が多い`, 1); }
    if (((t.contact.fat || 0) + (t.contact.thin || 0)) / t.n >= 0.4) add('transition', `${t.club}：ダフリ・トップが多い`, 2);
  }
  return [...map.values()].filter(f => f.score > 0).sort((a, b) => b.score - a.score);
}

// ===== AIなしの回答（ドリル集とレッスンメモから） =====
export function localAnswer(q, notes) {
  const scores = new Map();
  for (const it of ITEMS) {
    let s = it.kw.filter(k => k.length > 1 && q.includes(k)).length * 2;
    if (q.includes(it.title)) s += 3;
    if (s) scores.set(it.id, s);
  }
  for (const [re, ids] of SYN) if (re.test(q)) ids.forEach((id, i) => scores.set(id, (scores.get(id) || 0) + 3 - i));
  const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => itemById(id));
  if (!top.length) return null;
  let out = '';
  for (const it of top) {
    out += `## ${it.title}\n${it.point}\n\n`;
    const lines = [];
    for (const n of [...notes].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const h of noteHits(n, it).slice(0, 2)) lines.push(`${fmtDate(n.date)}：${h.line}`);
      if (lines.length >= 3) break;
    }
    if (lines.length) out += `レッスンメモより\n${lines.slice(0, 3).map(l => `- ${l}`).join('\n')}\n\n`;
    out += `練習\n${it.drills.map(d => `- **${d.name}**（${d.reps}）：${d.how}`).join('\n')}\n\n`;
  }
  return out.trim();
}

// ===== Claude API =====
export const MODELS = [
  ['claude-sonnet-5-5', 'Sonnet 5.5（標準）'],
  ['claude-haiku-4-5-20251001', 'Haiku 4.5（安い・速い）'],
  ['claude-opus-5-5', 'Opus 5.5（高精度）'],
];
export class ApiError extends Error {
  constructor(status, msg) { super(msg || `HTTP ${status}`); this.status = status; }
}
export function apiErrorText(e) {
  if (e?.name === 'AbortError') return '中止しました。';
  if (e?.message === 'NO_KEY') return 'APIキーが設定されていません（設定 → AIの回答）。';
  const s = e?.status;
  if (s === 401) return 'APIキーが正しくありません。設定で確認してください。';
  if (s === 403) return 'このAPIキーでは利用できません（権限・請求設定を確認）。';
  if (s === 429) return '利用の上限に達しました。少し待ってからもう一度お試しください。';
  if (s === 400) return `リクエストが受け付けられませんでした：${e.message}`;
  if (s >= 500) return 'AIのサーバーが混み合っています。少し待ってからもう一度お試しください。';
  return 'AIに接続できませんでした。インターネット接続を確認してください。';
}
export async function claude({ system, messages, maxTokens = 1600, onText, signal }) {
  const key = Settings.get('apiKey');
  if (!key) throw new Error('NO_KEY');
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: Settings.get('model') || MODELS[0][0], max_tokens: maxTokens, system, messages, stream: true }),
    });
  } catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError(0, e.message); }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { full += ev.delta.text; onText?.(full); }
        else if (ev.type === 'error') throw new ApiError(529, ev.error?.message);
      }
    }
  }
  return full;
}

export function systemPrompt(handed) {
  return `あなたはゴルフのスイングを一緒に振り返るコーチ役のアシスタントです。ユーザーは${handed === 'L' ? '左打ち' : '右打ち'}のアマチュアゴルファーで、iPhoneで撮ったスイング動画をアプリで管理しています。
資料として「レッスンで指摘された内容」「アプリが動画から計測した角度とチェック結果」「打球の記録」が渡されます。次を守って日本語で答えてください。
- レッスンの指摘を最優先の基準にする。それと異なる助言をするときは、その旨と理由をはっきり書く。
- 角度は1台のカメラ映像からのAI推定値で、撮影位置によって数度〜十数度ずれる。断定しすぎず、映像の印象と合わせて判断する。
- 練習方法は、練習場や自宅でできるドリルを、回数と意識するポイントつきで具体的に。レッスンメモにあるドリルを優先する。
- 痛みやけがに関わる相談には、無理をせず医師や専門家に相談するよう伝える。
- 表は使わず、短い見出しと箇条書きで簡潔に。`;
}

export function buildContext({ notes = [], swings = [], focus = [], handed = 'R', maxNotes = 14000 }) {
  let s = `# ユーザーの情報\n- 打ち方：${handed === 'L' ? '左打ち' : '右打ち'}\n`;
  const ns = [...notes].sort((a, b) => b.date.localeCompare(a.date));
  if (ns.length) {
    s += '\n# レッスンで指摘された内容（新しい順）\n';
    let used = 0;
    for (const n of ns) {
      const block = `\n## ${fmtDate(n.date)} ${n.title}\n${n.text}\n`;
      if (used + block.length > maxNotes) { s += '\n（古いメモは省略）\n'; break; }
      s += block; used += block.length;
    }
  }
  if (focus.length) {
    s += '\n# アプリが集計した今の課題（上ほど優先）\n';
    for (const f of focus.slice(0, 5)) {
      const why = [...f.swings.slice(0, 2).map(x => `動画(${fmtDate(x.date)} ${x.club})：${x.text}`), ...f.ball.slice(0, 2)];
      s += `- ${f.it.title}${why.length ? '：' + why.join('／') : ''}\n`;
    }
  }
  const tds = tendency(swings);
  if (tds.length) {
    s += '\n# 打球の記録（番手別）\n';
    for (const t of tds) s += `- ${t.club}（${t.n}球）：${tendencyText(t)}\n`;
  }
  const recent = [...swings].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt).slice(0, 8);
  if (recent.length) {
    s += '\n# 最近のスイング\n';
    for (const w of recent) {
      const warns = (w.checks?.list || []).filter(c => c.status === 'warn').map(c => c.text);
      const r = w.result || {};
      const ball = ['start', 'curve', 'height', 'contact'].map(k => r[k] && `${RESULT[k].jp}:${resultJP(k, r[k])}`).filter(Boolean).join(' ');
      s += `- ${fmtDate(w.date)} ${w.club} ${w.view === 'face' ? '正面' : '後方'}${w.isBest ? '（ベスト）' : ''}${w.title ? ' ' + w.title : ''}${ball ? ' 打球[' + ball + ']' : ''}${warns.length ? ' 指摘：' + warns.join(' / ') : ''}${w.memo ? ' メモ：' + w.memo : ''}\n`;
    }
  }
  return s;
}

export function swingDetailText(sw, st, bs, checks, best) {
  let s = `# 対象のスイング\n- ${fmtDate(sw.date)} ${sw.club}・${sw.view === 'face' ? '正面' : '後方'}から撮影${sw.title ? '・' + sw.title : ''}\n`;
  if (sw.memo) s += `- 本人のメモ：${sw.memo}\n`;
  if (best) s += `- 比較するベスト：${fmtDate(best.date)} ${best.club}${best.title ? '・' + best.title : ''}\n`;
  const rows = compareTable(sw, st, bs);
  if (rows.length) {
    s += '\n## 角度（アドレス／トップ／インパクト／フィニッシュ）\n';
    for (const { M, cells } of rows) {
      const cur = cells.map(c => fmtMetric(M, c.cur)).join('／');
      const bst = bs ? '　ベスト：' + cells.map(c => fmtMetric(M, c.best)).join('／') : '';
      s += `- ${M.label(sw)}：${cur}${bst}\n`;
    }
    s += '（胸・腰の回転は＋が目標方向に開く向き。体重の％は腰の位置から見た目安）\n';
  }
  if (isNum(st.tempo)) s += `- テンポ（上げる：下ろす）：${st.tempo.toFixed(1)}：1${isNum(bs?.tempo) ? `　ベスト：${bs.tempo.toFixed(1)}：1` : ''}\n`;
  if (checks?.length) {
    s += '\n## アプリのチェック結果\n';
    for (const c of checks) s += `- [${c.status === 'warn' ? '注意' : 'OK'}] ${c.label}：${c.text}${c.vsBest ? `（${c.vsBest}）` : ''}\n`;
  }
  const r = sw.result || {};
  const ball = ['start', 'curve', 'height', 'contact'].map(k => r[k] && `${RESULT[k].jp}：${resultJP(k, r[k])}`).filter(Boolean);
  if (ball.length) s += `\n## 打球（本人の記録）\n- ${ball.join('、')}\n`;
  const a = sw.ball?.auto;
  if (a?.ok) s += `- 動画からの推定：${isNum(a.launch) ? `打ち出し角 約${Math.round(a.launch)}°` : ''}${isNum(a.side) ? `打ち出し方向 ${a.side > 0 ? '右' : '左'}に約${Math.abs(Math.round(a.side))}°` : ''}\n`;
  return s;
}

// AIに渡すキーフレーム画像（アドレス・トップ・インパクト・フィニッシュ）
export async function keyFrames(blob, sw, maxSide = 640) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0.01;pointer-events:none';
  document.body.appendChild(v);
  const url = URL.createObjectURL(blob);
  const out = [];
  try {
    v.src = url;
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; setTimeout(() => rej(new Error('timeout')), 15000); });
    try { await v.play(); v.pause(); } catch { /* ignore */ }
    const m = sw.markers || {};
    let list = MARKS.filter(M => m[M.k] != null).map(M => [M.jp, m[M.k]]);
    if (!list.length) list = [0.15, 0.4, 0.6, 0.85].map((f, i) => [`${i + 1}枚目`, v.duration * f]);
    const c = document.createElement('canvas');
    for (const [label, t] of list) {
      await seekTo(v, t);
      const s = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      out.push({ label, data: c.toDataURL('image/jpeg', 0.8).split(',')[1] });
    }
  } finally {
    v.pause(); v.removeAttribute('src'); try { v.load(); } catch { /* ignore */ } v.remove(); URL.revokeObjectURL(url);
  }
  return out;
}
export function imageBlocks(frames, prefix) {
  const blocks = [];
  for (const f of frames) {
    blocks.push({ type: 'text', text: `${prefix}：${f.label}` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } });
  }
  return blocks;
}
export { esc };
