// スイング帳：画面の制御
import { $, $$, clamp, sleep, uid, esc, todayISO, fmtDate, fmtMB, DB, Settings, toast, Busy, openSheet, holdRepeat, bindSeg, md, seekTo, waitMeta, isNum, DPR } from './util.js';
import { MARKS, PoseTrack, metricsFor, fmtMetric, frameMetrics, analyzePose, autoMarkers, Pose, HUD_KEYS } from './pose.js';
import { SwingView, Timeline, distSeg, distLine } from './view.js';
import * as Coach from './coach.js';

const APP_VER = '1.1.0';
const CLUBS = ['1W', '3W', '5W', 'UT', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'AW', 'SW', 'LW', 'PT', 'その他'];
const VIEWS = { dtl: '後方', face: '正面' };
const COLORS = ['#F4C542', '#FF5A47', '#6EC8F0', '#FFFFFF'];
const SPEEDS = [1, 0.5, 0.25, 0.125];
const SPEED_LBL = { 1: '1×', 0.5: '½×', 0.25: '¼×', 0.125: '⅛×' };
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>';

const S = { swings: [], notes: [], filterClub: null, compareSel: null, thumbs: new Map(), view: 'vSwings', pickBest: false, afterHome: null };

const swingTitle = s => s.title || `${s.club}のスイング`;
const swingLabel = s => `${s.club} ${fmtDate(s.date)}${s.title ? ' ' + s.title : ''}`;
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function normalizeSwing(sw) {
  sw.markers = Object.assign({ address: null, top: null, impact: null, finish: null }, sw.markers || {});
  sw.drawings = sw.drawings || [];
  sw.result = sw.result || {};
  sw.handed = sw.handed || 'R';
  sw.view = sw.view || 'dtl';
  return sw;
}
function clubCat(c) {
  if (/W$/.test(c)) return 'W';
  if (c === 'UT') return 'UT';
  if (/\dI$/.test(c)) return 'I';
  if (['PW', 'AW', 'SW', 'LW'].includes(c)) return 'WE';
  return c;
}
function bestCandidates(sw) { return S.swings.filter(s => s.isBest && s.id !== sw.id && s.view === sw.view); }
function findBest(sw) {
  const c = bestCandidates(sw);
  if (sw.bestId) { const b = c.find(s => s.id === sw.bestId); if (b) return b; }
  const same = s => s.club === sw.club, cat = s => clubCat(s.club) === clubCat(sw.club);
  return c.find(s => same(s) && s.hasPose) || c.find(same) || c.find(s => cat(s) && s.hasPose) || c.find(cat) || c.find(s => s.hasPose) || c[0] || null;
}
function snapPt(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (Math.hypot(dx, dy) < 24) return [bx, by];
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  const near = t => Math.abs(((a - t + 540) % 360) - 180) < 3;
  if (near(0) || near(180)) return [bx, ay];
  if (near(90) || near(-90)) return [ax, by];
  return [bx, by];
}

// ===== 番手ボタン・入力フォーム =====
function clubGrid(el, value, onPick) {
  el.className = 'clubs';
  el.innerHTML = CLUBS.map(c => `<button type="button" data-v="${esc(c)}" class="${c.length > 3 ? 'jp' : ''}">${esc(c)}</button>`).join('');
  return bindSeg(el, value, onPick);
}
function swingForm(el, d, onChange) {
  el.innerHTML = `
    <div class="field"><span>番手を選んでください</span><div data-f="club"></div></div>
    <div class="two">
      <div class="field"><span>撮影方向</span><div class="seg" data-f="view"><button type="button" data-v="dtl">後方</button><button type="button" data-v="face">正面</button></div></div>
      <div class="field"><span>打ち方</span><div class="seg" data-f="handed"><button type="button" data-v="R">右打ち</button><button type="button" data-v="L">左打ち</button></div></div>
    </div>
    <label class="field"><span>タイトル（任意）</span><input type="text" data-f="title" maxlength="40" placeholder="例：9時3時を意識" value="${esc(d.title || '')}"></label>
    <label class="field"><span>撮影日</span><input type="date" data-f="date" value="${esc(d.date || todayISO())}"></label>
    <label class="field"><span>メモ（任意）</span><textarea data-f="memo" rows="3" placeholder="意識したこと、気づいたこと">${esc(d.memo || '')}</textarea></label>
    <button type="button" class="toggle" data-f="isBest" role="switch" aria-checked="${!!d.isBest}"><span>ベスト（お手本）にする<small>調子が良かったときのスイング。新しいスイングはこれと比べます。</small></span><i class="knob"></i></button>`;
  clubGrid($('[data-f=club]', el), d.club, v => onChange('club', v));
  bindSeg($('[data-f=view]', el), d.view, v => onChange('view', v));
  bindSeg($('[data-f=handed]', el), d.handed, v => onChange('handed', v));
  $('[data-f=title]', el).addEventListener('input', e => onChange('title', e.target.value.trim()));
  $('[data-f=date]', el).addEventListener('change', e => onChange('date', e.target.value || todayISO()));
  $('[data-f=memo]', el).addEventListener('input', e => onChange('memo', e.target.value));
  const tg = $('[data-f=isBest]', el);
  tg.onclick = () => { const v = tg.getAttribute('aria-checked') !== 'true'; tg.setAttribute('aria-checked', v); onChange('isBest', v); };
}

// ===== 動画の取り込み =====
async function probeFps(v) {
  if (typeof v.requestVideoFrameCallback !== 'function') return null;
  const times = [];
  let stop = false;
  const cb = (now, m) => { times.push(m.mediaTime); if (!stop && times.length < 30) v.requestVideoFrameCallback(cb); };
  v.requestVideoFrameCallback(cb);
  v.playbackRate = 0.25;
  try { await v.play(); } catch { return null; }
  const t0 = performance.now();
  while (times.length < 30 && performance.now() - t0 < 1300) await sleep(50);
  stop = true;
  v.pause();
  v.playbackRate = 1;
  let minD = Infinity;
  for (let i = 1; i < times.length; i++) { const d = times[i] - times[i - 1]; if (d > 0.0015 && d < minD) minD = d; }
  if (!isFinite(minD) || times.length < 3) return null;
  const f = 1 / minD;
  let best = null, bd = 1e9;
  for (const c of [24, 25, 30, 48, 50, 60, 90, 120, 240]) { const d = Math.abs(f - c) / c; if (d < bd) { bd = d; best = c; } }
  return bd < 0.08 ? best : Math.round(f);
}
async function probeVideo(blob) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0.01;pointer-events:none';
  document.body.appendChild(v);
  const url = URL.createObjectURL(blob);
  try {
    v.src = url;
    await waitMeta(v, 20000);
    const duration = v.duration, width = v.videoWidth, height = v.videoHeight;
    if (!isFinite(duration) || !width) throw new Error('meta');
    let fps = null;
    try { fps = await probeFps(v); } catch { /* ignore */ }
    await seekTo(v, Math.min(duration * 0.35, Math.max(0, duration - 0.1)));
    const s = Math.min(1, 360 / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const thumb = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.78));
    return { duration, width, height, fps, thumb };
  } catch (e) { console.warn(e); return null; }
  finally { v.pause(); v.removeAttribute('src'); try { v.load(); } catch { /* ignore */ } v.remove(); URL.revokeObjectURL(url); }
}
function pickVideo(asBest) { S.pickBest = !!asBest; $('#fileInput').click(); }
async function onFilePicked(file, asBest) {
  Busy.show('動画を読み込み中…', { see: false });
  const info = await probeVideo(file);
  Busy.hide();
  if (!info) { toast('この動画は読み込めませんでした'); return; }
  openAddSheet(file, info, asBest);
}
function openAddSheet(file, info, asBest) {
  const d = { club: null, view: Settings.get('view'), handed: Settings.get('handed'), title: '', date: todayISO(), memo: '', isBest: !!asBest };
  const turl = info.thumb ? URL.createObjectURL(info.thumb) : '';
  const body = document.createElement('div');
  body.innerHTML = `<div class="newprev">${turl ? `<img src="${turl}" alt="">` : ''}<p><span class="num">${info.duration.toFixed(1)}</span>秒　<span class="num">${info.width}×${info.height}</span>${info.fps ? `　<span class="num">${info.fps}</span>fps` : ''}<br>${asBest ? '調子が良かったときのスイングとして登録します。' : 'この動画の番手を選んで保存してください。'}</p></div>
    <div class="form"></div>
    <div class="sheet-actions"><button class="btn" data-a="cancel">キャンセル</button><button class="btn primary" data-a="save" disabled>番手を選んでください</button></div>`;
  const save = $('[data-a=save]', body);
  swingForm($('.form', body), d, (k, v) => {
    d[k] = v;
    if (k === 'club') { save.disabled = false; save.textContent = Settings.get('autoAnalyze') ? `${v}で保存して解析` : `${v}で保存`; }
  });
  const sh = openSheet(asBest ? 'ベストを登録' : 'スイングを追加', body, { modal: true, onClose: () => turl && URL.revokeObjectURL(turl) });
  $('[data-a=cancel]', body).onclick = () => sh.close();
  save.onclick = async () => { if (!d.club) return; sh.close(); await saveNewSwing(file, info, d); };
}
async function saveNewSwing(file, info, d) {
  const id = uid();
  const sw = {
    id, createdAt: Date.now(), title: d.title, club: d.club, view: d.view, handed: d.handed, date: d.date, memo: d.memo, isBest: !!d.isBest,
    duration: info.duration, width: info.width, height: info.height, fps: info.fps || null, fpsOverride: 0,
    markers: { address: null, top: null, impact: null, finish: null }, drawings: [], hasPose: false,
    thumb: info.thumb || null, size: file.size, type: file.type || '', ball: null, result: {}, checks: null, aiReview: null, bestId: null,
  };
  Busy.show('保存中…');
  try {
    await DB.put('videos', file, id);
    await DB.put('swings', sw);
  } catch (e) {
    console.error(e);
    try { await DB.del('videos', id); } catch { /* ignore */ }
    Busy.hide();
    alert('保存できませんでした。iPhoneの空き容量を確認してください。');
    return;
  }
  Busy.hide();
  Settings.set('lastClub', d.club); Settings.set('view', d.view); Settings.set('handed', d.handed);
  navigator.storage?.persist?.().catch(() => {});
  await refreshLib();
  const auto = Settings.get('autoAnalyze');
  if (P.isOpen) { await P.close(); await P.open(id, { autoAnalyze: auto, replace: true }); }
  else await P.open(id, { autoAnalyze: auto });
}

// ===== ホーム（スイング一覧） =====
async function refreshLib() {
  S.swings = (await DB.all('swings')).map(normalizeSwing)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  renderLib();
}
function renderLib() {
  S.thumbs.forEach(u => URL.revokeObjectURL(u)); S.thumbs.clear();
  const clubs = CLUBS.filter(c => S.swings.some(s => s.club === c));
  const hasBest = S.swings.some(s => s.isBest);
  if (S.filterClub && S.filterClub !== '★' && !clubs.includes(S.filterClub)) S.filterClub = null;
  const chips = [];
  if (S.swings.length > 1 && (clubs.length > 1 || hasBest)) {
    chips.push(`<button class="chip ${!S.filterClub ? 'on' : ''}" data-club="">すべて</button>`);
    if (hasBest) chips.push(`<button class="chip ${S.filterClub === '★' ? 'on' : ''}" data-club="★">★ ベスト</button>`);
    if (clubs.length > 1) for (const c of clubs) chips.push(`<button class="chip num ${S.filterClub === c ? 'on' : ''}" data-club="${esc(c)}">${esc(c)}</button>`);
  }
  $('#clubFilter').innerHTML = chips.join('');
  const list = S.filterClub === '★' ? S.swings.filter(s => s.isBest) : S.filterClub ? S.swings.filter(s => s.club === S.filterClub) : S.swings;
  $('#grid').innerHTML = list.map(s => {
    let img = '';
    if (s.thumb) { const u = URL.createObjectURL(s.thumb); S.thumbs.set(s.id, u); img = `<img src="${u}" alt="" loading="lazy">`; }
    const order = S.compareSel ? S.compareSel.indexOf(s.id) : -1;
    const warns = (s.checks?.list || []).filter(c => c.status === 'warn').length;
    return `<button class="card ${order >= 0 ? 'sel' : ''}" data-id="${s.id}">
      <span class="thumb">${img}<span class="club">${esc(s.club)}</span>
        <span class="badges">${s.isBest ? '<span class="badge best">★ ベスト</span>' : ''}${s.hasPose ? '<span class="badge">骨格</span>' : ''}${warns ? `<span class="badge warn">注意 ${warns}</span>` : ''}</span>
        ${order >= 0 ? `<span class="pick">${'AB'[order]}</span>` : ''}</span>
      <span class="meta"><span class="ttl">${esc(swingTitle(s))}</span><span class="sub"><span class="num">${fmtDate(s.date)}</span>　${VIEWS[s.view] || ''}</span></span></button>`;
  }).join('');
  $('#empty').hidden = S.swings.length > 0;
  $('#libTools').hidden = S.swings.length < 2 || !!S.compareSel;
  $('#cmpBar').hidden = !S.compareSel;
  if (S.compareSel) {
    $('#cmpText').textContent = S.compareSel.length < 2 ? `比較するスイングを選んでください（${S.compareSel.length}/2）` : '2つ選びました';
    $('#cmpGo').disabled = S.compareSel.length < 2;
  }
  footer();
}
async function footer() {
  let txt = S.swings.length ? `${S.swings.length}本のスイング` : '';
  try { const e = await navigator.storage?.estimate?.(); if (e?.usage) txt += `${txt ? '・' : ''}使用容量 ${fmtMB(e.usage)}`; } catch { /* ignore */ }
  $('#libFoot').textContent = txt;
}
function setView(v) {
  S.view = v;
  $$('#home .view').forEach(e => { e.hidden = e.id !== v; });
  $$('#mainnav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#homeTitle').textContent = { vSwings: 'スイング帳', vPractice: '練習', vChat: '質問' }[v];
  if (v === 'vPractice') renderPractice();
  if (v === 'vChat') { renderChat(true); }
}
function wireHome() {
  $('#mainnav').onclick = e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); };
  $('#btnAdd').onclick = () => pickVideo(false);
  $('#btnAddBest').onclick = () => pickVideo(true);
  $('#fileInput').addEventListener('change', e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFilePicked(f, S.pickBest);
  });
  $('#clubFilter').onclick = e => { const b = e.target.closest('[data-club]'); if (!b) return; S.filterClub = b.dataset.club || null; renderLib(); };
  $('#grid').onclick = e => {
    const c = e.target.closest('.card');
    if (!c) return;
    const id = c.dataset.id;
    if (S.compareSel) {
      const i = S.compareSel.indexOf(id);
      if (i >= 0) S.compareSel.splice(i, 1); else if (S.compareSel.length < 2) S.compareSel.push(id);
      renderLib();
      return;
    }
    P.open(id);
  };
  $('#btnCompareMode').onclick = () => { S.compareSel = []; renderLib(); };
  $('#cmpCancel').onclick = () => { S.compareSel = null; renderLib(); };
  $('#cmpGo').onclick = () => { const [a, b] = S.compareSel; S.compareSel = null; renderLib(); C.open(a, b); };
  $('#btnSettings').onclick = () => openSettings();
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !standalone && !localStorage.getItem('swingnote.tip')) $('#installTip').hidden = false;
  $('#installTipClose').onclick = () => { $('#installTip').hidden = true; localStorage.setItem('swingnote.tip', '1'); };
}

// ===== 再生・解析画面 =====
const P = {
  view: null, swing: null, tl: null, tab: 'play', collapsed: false, speed: 1, loop: false, isOpen: false,
  tool: 'line', color: COLORS[0], drag: null, undo: [], chartMetric: 'spine', series: null, saveTm: 0,
  tapMode: null, best: null, bestTrack: null, diag: null, aiAbort: null,

  init() {
    this.view = new SwingView($('#pStage'), Settings.get('show'));
    this.view.onRender = (t, lm) => this.updateHud(t, lm);
    this.tl = new Timeline($('#pTimeline'), (t, ph) => this.scrub(t, ph));
    const v = this.view.video;
    v.addEventListener('play', () => this.onPlay());
    v.addEventListener('pause', () => this.onPause());
    v.addEventListener('seeked', () => this.syncUI());
    v.addEventListener('ended', () => this.onPause());
    $('#pBack').onclick = () => history.back();
    $('#pPlay').onclick = () => this.togglePlay();
    holdRepeat($('#pPrev'), () => this.step(-1));
    holdRepeat($('#pNext'), () => this.step(1));
    $('#pSpeed').onclick = () => this.setSpeed(SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]);
    $('#pTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) this.setTab(b.dataset.tab); };
    this.markSpeed = bindSeg($('#pSpeedSeg'), 1, val => this.setSpeed(+val));
    $('#pLoop').onclick = () => { this.loop = !this.loop; this.applyLoop(); };
    $('#pMirror').onclick = () => {
      this.view.mirror = !this.view.mirror; this.view.applyMirror();
      $('#pMirror').classList.toggle('on', this.view.mirror); this.view.render();
    };
    bindSeg($('#pTools'), this.tool, val => { this.tool = val; });
    $('#pColors').innerHTML = COLORS.map(c => `<button class="sw" data-c="${c}" style="background:${c}" aria-label="線の色"></button>`).join('');
    $('#pColors').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { this.color = b.dataset.c; this.markColor(); } };
    this.markColor();
    $('#pUndo').onclick = () => this.undoDraw();
    $('#pClear').onclick = () => {
      if (!this.swing.drawings.length || !confirm('描いた線をすべて消しますか？')) return;
      this.pushUndo(); this.swing.drawings = []; this.saveSoon(); this.view.render();
    };
    const cv = this.view.canvas;
    cv.addEventListener('pointerdown', e => this.onDown(e));
    cv.addEventListener('pointermove', e => this.onMove(e));
    cv.addEventListener('pointerup', () => this.onUp());
    cv.addEventListener('pointercancel', () => this.onUp());
    $('#pAnalyze').onclick = () => this.analyze();
    $('#pReanalyze').onclick = () => this.analyze();
    $('#pDelPose').onclick = () => this.delPose();
    $('#pAutoMark').onclick = () => this.autoMark(true);
    $('#pAutoMark2').onclick = () => this.autoMark(true);
    $('#poseToggles').onclick = e => {
      const b = e.target.closest('[data-show]');
      if (!b) return;
      const k = b.dataset.show;
      this.view.show[k] = !this.view.show[k];
      Settings.set('show', { ...Settings.get('show'), [k]: this.view.show[k] });
      b.classList.toggle('on', this.view.show[k]);
      this.view.render();
    };
    $('#metricChips').onclick = e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      this.chartMetric = b.dataset.m;
      $$('#metricChips .chip').forEach(x => x.classList.toggle('on', x === b));
      this.drawChart();
    };
    const ch = $('#pChart');
    let chDown = false;
    const chT = e => {
      const p = this.view.pose; if (!p) return null;
      const r = ch.getBoundingClientRect();
      const f = clamp((e.clientX - r.left - 34) / (r.width - 44), 0, 1);
      return p.t0 + f * (p.t1 - p.t0);
    };
    ch.addEventListener('pointerdown', e => { chDown = true; ch.setPointerCapture(e.pointerId); this.view.video.pause(); const t = chT(e); if (t != null) this.view.seek(t); });
    ch.addEventListener('pointermove', e => { if (!chDown) return; const t = chT(e); if (t != null) this.view.seek(t); });
    ch.addEventListener('pointerup', () => { chDown = false; });
    ch.addEventListener('pointercancel', () => { chDown = false; });
    $('#pMarks').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      const m = this.swing.markers;
      if (b.dataset.jump) { this.view.video.pause(); this.view.seek(m[b.dataset.jump]); }
      else if (b.dataset.set) this.setMarker(b.dataset.set);
      else if (b.dataset.clear) { m[b.dataset.clear] = null; this.markersChanged(); }
    };
    $('#pDelete').onclick = () => this.deleteSwing();
    $('#diagBody').addEventListener('click', e => this.onDiagClick(e));
    $('#diagBody').addEventListener('change', e => {
      if (e.target.id === 'diagBest') { this.swing.bestId = e.target.value || null; this.diag = null; this.best = null; this.saveSoon(); this.renderDiag(); }
    });
  },

  async open(id, opts = {}) {
    Busy.show('読み込み中…');
    let ok = false;
    try {
      const sw = await DB.get('swings', id), blob = await DB.get('videos', id);
      if (!sw || !blob) throw new Error('missing');
      normalizeSwing(sw);
      const pose = sw.hasPose ? await DB.get('poses', id) : null;
      this.swing = sw; this.undo = []; this.diag = null; this.best = null; this.bestTrack = null; this.tapMode = null; this.drag = null;
      this.view.show = { ...Settings.get('show') };
      show('player');
      this.isOpen = true;
      this.tab = 'play'; this.collapsed = false;
      await this.view.load(sw, blob, pose);
      this.computeSeries();
      this.renderAll();
      await this.view.seekWait(sw.markers.address ?? 0);
      this.syncUI();
      ok = true;
    } catch (e) {
      console.error(e);
      toast('動画を開けませんでした');
    } finally { Busy.hide(); }
    if (!ok) { this.isOpen = false; this.swing = null; show('home'); return; }
    if (opts.replace) history.replaceState({ screen: 'player' }, ''); else history.pushState({ screen: 'player' }, '');
    if (opts.autoAnalyze && !this.swing.hasPose) await this.analyze({ auto: true });
  },
  async close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.aiAbort?.abort();
    this.view.video.pause();
    await this.flush();
    this.view.unload();
    this.swing = null; this.diag = null; this.best = null; this.bestTrack = null;
  },
  fps() { return this.swing.fpsOverride || this.swing.fps || 30; },

  // ---- 再生 ----
  setSpeed(s) {
    this.speed = s;
    const v = this.view.video;
    v.defaultPlaybackRate = s; v.playbackRate = s;
    $('#pSpeed').textContent = SPEED_LBL[s];
    this.markSpeed(s);
  },
  applyLoop() {
    $('#pLoop').classList.toggle('on', this.loop);
    const m = this.swing?.markers || {};
    this.view.video.loop = this.loop && !(m.address != null && m.finish != null && m.finish > m.address);
  },
  togglePlay() {
    const v = this.view.video;
    if (!v.paused) { v.pause(); return; }
    const m = this.swing.markers;
    if (this.loop && m.address != null && m.finish != null && m.finish > m.address && (v.currentTime >= m.finish || v.currentTime < m.address)) v.currentTime = m.address;
    else if (v.ended || v.currentTime >= this.view.duration - 0.02) v.currentTime = 0;
    v.playbackRate = this.speed;
    v.play().catch(() => {});
  },
  step(dir) {
    const v = this.view.video;
    if (!v.paused) v.pause();
    const f = this.fps();
    const cur = this.view.pendingSeek ?? v.currentTime;
    const k = Math.floor(cur * f + 1e-3);
    const t = clamp((k + dir + 0.5) / f, 0, this.view.duration - 0.001);
    this.view.seek(t);
    this.tl.setValue(t); this.setTimeText(t);
  },
  scrub(t, phase) {
    const v = this.view.video;
    if (phase === 'start' && !v.paused) v.pause();
    this.view.seek(t);
    this.setTimeText(t);
  },
  onPlay() {
    $('#pPlay').innerHTML = ICON_PAUSE;
    const v = this.view.video;
    const tick = (now, meta) => {
      if (v.paused || !this.isOpen) return;
      this.onFrame(meta ? meta.mediaTime : v.currentTime);
      schedule();
    };
    const schedule = () => {
      if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(tick);
      else requestAnimationFrame(() => tick());
    };
    schedule();
  },
  onPause() { $('#pPlay').innerHTML = ICON_PLAY; if (this.isOpen) this.syncUI(); },
  onFrame(t) {
    const m = this.swing.markers;
    if (this.loop && m.address != null && m.finish != null && m.finish > m.address && t >= m.finish) { this.view.video.currentTime = m.address; return; }
    this.view.render(t);
    this.tl.setValue(t);
    this.setTimeText(t);
    if (this.tab === 'pose' && !this.collapsed) this.drawChart(t);
  },
  syncUI(t) {
    if (!this.isOpen) return;
    if (t == null) t = this.view.video.currentTime;
    this.view.render(t);
    this.tl.setValue(t);
    this.setTimeText(t);
    if (this.tab === 'pose' && !this.collapsed) this.drawChart(t);
  },
  setTimeText(t) { $('#pTime').innerHTML = `${(t || 0).toFixed(2)}<small>s</small>`; },

  // ---- タブ ----
  setTab(name) {
    if (this.tab === name && !this.collapsed) this.collapsed = true;
    else { this.tab = name; this.collapsed = false; }
    this.applyTab();
  },
  applyTab() {
    this.tapMode = null; this.updateTapUI();
    $('#pDock').classList.toggle('collapsed', this.collapsed);
    $$('#pTabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab && !this.collapsed));
    $$('#pDock .panel').forEach(p => p.classList.toggle('active', p.dataset.panel === this.tab));
    const drawing = this.tab === 'draw' && !this.collapsed;
    this.view.editing = drawing;
    $('#pStage').classList.toggle('drawing', drawing);
    if (!this.collapsed) {
      if (this.tab === 'pose') this.renderPosePanel();
      if (this.tab === 'diag') this.renderDiag();
    }
    this.view.render();
  },
  renderAll() {
    this.renderHeader();
    this.setSpeed(this.speed);
    this.view.mirror = false; this.view.applyMirror();
    $('#pMirror').classList.remove('on');
    this.renderPlayPanel();
    this.renderMarks();
    this.renderInfo();
    $('#diagBody').innerHTML = '';
    this.applyTab();
  },
  renderHeader() {
    const sw = this.swing;
    $('#pClub').textContent = sw.club;
    $('#pTitle').textContent = sw.title || `${fmtDate(sw.date)} ${VIEWS[sw.view]}`;
    $('#pStar').hidden = !sw.isBest;
  },
  renderPlayPanel() {
    const sw = this.swing;
    $('#pFpsSeg [data-v="0"]').textContent = sw.fps ? `自動(${sw.fps})` : '自動';
    bindSeg($('#pFpsSeg'), sw.fpsOverride || 0, val => { sw.fpsOverride = +val; this.saveSoon(); });
    const notes = [];
    if ((sw.fps || 0) >= 120) notes.push('スロー撮影の動画です。コマ送りでインパクト付近を細かく見られます。');
    notes.push('アドレスとフィニッシュのマーカーを置くと、ループはその区間だけを繰り返します。押し続けると連続でコマ送りします。');
    $('#pPlayNote').textContent = notes.join(' ');
  },

  // ---- マーカー ----
  renderMarks() {
    const m = this.swing.markers;
    $('#pMarks').innerHTML = MARKS.map(M => {
      const v = m[M.k];
      return `<div class="mk-row" style="--c:${M.c}"><button class="mk-jump" data-jump="${M.k}" ${v == null ? 'disabled' : ''}><span class="mk-dot">${M.s}</span><span class="mk-name">${M.jp}</span><span class="mk-time">${v == null ? '—' : v.toFixed(2) + 's'}</span></button>${v != null ? `<button class="mk-clear" data-clear="${M.k}" aria-label="${M.jp}を外す">×</button>` : ''}<button class="btn sm" data-set="${M.k}">ここ</button></div>`;
    }).join('');
    this.tl.setRange(0, this.view.duration || this.swing.duration || 1);
    this.tl.setMarks(MARKS.filter(M => m[M.k] != null).map(M => ({ v: m[M.k], s: M.s, c: M.c })));
    $('#pAutoMark').disabled = !this.view.pose;
    this.applyLoop();
  },
  setMarker(k) {
    const t = this.view.pendingSeek ?? this.view.video.currentTime;
    this.swing.markers[k] = Math.round(t * 10000) / 10000;
    this.markersChanged();
    toast(`${MARKS.find(M => M.k === k).jp}を設定しました`);
  },
  markersChanged() {
    this.saveSoon();
    this.view.refreshCtx();
    this.computeSeries();
    this.renderMarks();
    this.diag = null;
    if (this.tab === 'pose' && !this.collapsed) this.renderPosePanel();
    this.view.render();
  },
  autoMark(manual) {
    if (!this.view.pose) { if (manual) toast('先に骨格を解析してください'); return false; }
    const r = autoMarkers(this.view.pose);
    if (!r) { if (manual) toast('自動で見つけられませんでした。コマ送りで設定してください'); return false; }
    Object.assign(this.swing.markers, r);
    this.markersChanged();
    if (manual) { toast('マーカーを自動設定しました（コマ送りで調整できます）'); if (this.tab === 'diag') this.renderDiag(); }
    return true;
  },

  // ---- 骨格 ----
  async analyze(opts = {}) {
    const sw = this.swing, v = this.view.video;
    v.pause();
    const back = v.currentTime;
    let cancelled = false;
    Busy.show('AIモデルを準備中…（初回は少し時間がかかります）', { cancel: () => { cancelled = true; }, see: true });
    let rec = null;
    try {
      rec = await analyzePose(v, sw, {
        isCancelled: () => cancelled || !this.isOpen,
        onProgress: (i, n) => Busy.update(`骨格を解析中　${i} / ${n}`, i / n),
        onFrame: (t, lm) => { this.view.tempLm = lm; this.view.render(t); },
      });
    } catch (e) {
      console.error(e);
      this.view.tempLm = null;
      Busy.hide();
      alert('骨格を解析できませんでした。\n初回はAIモデルを読み込むため、インターネットに接続した状態でお試しください。続けて失敗する場合は、設定の「解析エンジン」を「CPU」にしてお試しください。');
      if (this.isOpen) { await this.view.seekWait(back); this.syncUI(); }
      return;
    }
    this.view.tempLm = null;
    Busy.hide();
    if (!this.isOpen) return;
    if (cancelled || !rec) { await this.view.seekWait(back); this.syncUI(); toast('解析を中止しました'); return; }
    if (!rec.ok) { await this.view.seekWait(back); this.syncUI(); alert('人物を見つけられませんでした。頭から足まで全身が映っている動画でお試しください。'); return; }
    try { await DB.put('poses', rec, sw.id); } catch (e) { console.error(e); toast('解析結果を保存できませんでした'); }
    sw.hasPose = true;
    this.view.setPose(rec);
    let auto = false;
    if (sw.markers.address == null || sw.markers.top == null || sw.markers.impact == null) auto = this.autoMark(false);
    this.computeSeries();
    this.renderMarks();
    this.diag = null;
    this.saveSoon();
    await this.view.seekWait(sw.markers.address ?? back);
    this.syncUI();
    toast(`解析しました（${rec.ok}/${rec.n}コマで検出）${auto ? '・マーカーを自動設定' : ''}`);
    if (opts.auto || this.tab === 'diag') { this.tab = 'diag'; this.collapsed = false; this.applyTab(); }
    else if (this.tab === 'pose') this.renderPosePanel();
  },
  async delPose() {
    if (!confirm('骨格の解析データを削除しますか？')) return;
    await DB.del('poses', this.swing.id);
    this.swing.hasPose = false; this.swing.checks = null;
    this.view.setPose(null);
    this.computeSeries(); this.saveSoon(); this.renderPosePanel(); this.renderMarks(); this.view.render();
  },
  computeSeries() {
    const p = this.view.pose;
    if (!p) { this.series = null; return; }
    const c = this.view.mc, Ms = metricsFor(this.swing), S2 = {};
    for (const M of Ms) S2[M.k] = new Float32Array(p.n).fill(NaN);
    for (let i = 0; i < p.n; i++) {
      if (!p.valid(i)) continue;
      const r = frameMetrics(p.frame(i), c);
      for (const M of Ms) if (isNum(r[M.k])) S2[M.k][i] = r[M.k];
    }
    this.series = S2;
    if (!S2[this.chartMetric]) this.chartMetric = 'spine';
  },
  seriesAt(k, t) {
    const p = this.view.pose, s = this.series?.[k];
    if (!p || !s || t == null) return null;
    if (t < p.t0 - p.tol || t > p.t1 + p.tol) return null;
    const i = clamp(p.idx(t), 0, p.n - 1);
    if (i >= p.n - 1) return Number.isNaN(s[i]) ? null : s[i];
    const a = s[i], b = s[i + 1];
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    if (Number.isNaN(a)) return b;
    if (Number.isNaN(b)) return a;
    const f = clamp((t - p.times[i]) / ((p.times[i + 1] - p.times[i]) || 1), 0, 1);
    return a + (b - a) * f;
  },
  updateHud(t, lm) {
    const el = $('#pHud');
    if (!this.swing || !lm || !this.view.show.angles || !this.view.mc) { el.innerHTML = ''; return; }
    const r = frameMetrics(lm, this.view.mc);
    const keys = HUD_KEYS[this.swing.view] || HUD_KEYS.dtl;
    el.innerHTML = metricsFor(this.swing).filter(M => keys.includes(M.k) && isNum(r[M.k]))
      .map(M => `<span>${M.label(this.swing)}</span><span class="v">${fmtMetric(M, r[M.k])}</span>`).join('');
  },
  renderPosePanel() {
    const has = !!this.view.pose;
    $('#poseEmpty').hidden = has;
    $('#poseReady').hidden = !has;
    if (!has) return;
    $$('#poseToggles [data-show]').forEach(b => b.classList.toggle('on', !!this.view.show[b.dataset.show]));
    $('#metricChips').innerHTML = metricsFor(this.swing).map(M => `<button class="chip ${M.k === this.chartMetric ? 'on' : ''}" data-m="${M.k}">${M.label(this.swing)}</button>`).join('');
    this.renderPoseTable();
    requestAnimationFrame(() => this.drawChart());
  },
  renderPoseTable() {
    const m = this.swing.markers, cols = MARKS.filter(M => m[M.k] != null);
    if (!cols.length || !this.series) {
      $('#poseTable').innerHTML = '<p class="note">マーカーを置くと、アドレス・トップ・インパクト・フィニッシュの角度を並べて見られます。</p>';
      return;
    }
    $('#poseTable').innerHTML = `<table class="mt"><thead><tr><th></th>${cols.map(M => `<th>${M.jp}</th>`).join('')}</tr></thead><tbody>${
      metricsFor(this.swing).map(M => `<tr><td>${M.label(this.swing)}</td>${cols.map(C2 => `<td>${fmtMetric(M, this.seriesAt(M.k, m[C2.k]))}</td>`).join('')}</tr>`).join('')
    }</tbody></table>`;
  },
  drawChart(tNow) {
    const c = $('#pChart'), p = this.view.pose;
    if (!this.series || !p || this.tab !== 'pose' || this.collapsed) return;
    const cw = c.clientWidth, chh = c.clientHeight;
    if (!cw) return;
    const d = DPR();
    if (c.width !== Math.round(cw * d)) c.width = Math.round(cw * d);
    if (c.height !== Math.round(chh * d)) c.height = Math.round(chh * d);
    const ctx = c.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, cw, chh);
    const M = metricsFor(this.swing).find(x => x.k === this.chartMetric);
    const S2 = this.series[this.chartMetric];
    if (!M || !S2) return;
    const x0 = p.t0, x1 = Math.max(p.t1, p.t0 + 0.001);
    const L = 34, R = 10, T = 10, B = 18, W = cw - L - R, H = chh - T - B;
    const X = t => L + (t - x0) / (x1 - x0) * W;
    const scale = M.pct ? 100 : 1;
    let lo = Infinity, hi = -Infinity;
    for (const v of S2) if (!Number.isNaN(v)) { lo = Math.min(lo, v * scale); hi = Math.max(hi, v * scale); }
    ctx.font = '500 12px "Barlow Condensed", sans-serif';
    if (!isFinite(lo)) {
      ctx.fillStyle = '#7A9587'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '12px -apple-system, "Hiragino Sans", sans-serif';
      ctx.fillText('この角度は検出できませんでした', L, T + H / 2);
      return;
    }
    const span = hi - lo;
    if (span < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; } else { lo -= span * 0.1; hi += span * 0.1; }
    const Y = v => T + (1 - (v - lo) / (hi - lo)) * H;
    ctx.strokeStyle = 'rgba(169,189,177,.14)'; ctx.lineWidth = 1; ctx.fillStyle = '#7A9587';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const v = lo + (hi - lo) * (i / 2), y = Y(v);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + W, y); ctx.stroke();
      ctx.fillText(Math.round(v) + (M.pct ? '%' : '°'), L - 5, y);
    }
    const mk = this.swing.markers;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const K of MARKS) {
      const mt = mk[K.k];
      if (mt == null || mt < x0 || mt > x1) continue;
      const x = X(mt);
      ctx.save(); ctx.strokeStyle = K.c; ctx.globalAlpha = 0.75; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + H); ctx.stroke(); ctx.restore();
      ctx.fillStyle = K.c; ctx.fillText(K.s, x, T + H + 3);
    }
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < p.n; i++) {
      const v = S2[i];
      if (Number.isNaN(v)) { pen = false; continue; }
      const x = X(p.times[i]), y = Y(v * scale);
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    }
    ctx.strokeStyle = '#6EC8F0'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    const t = tNow ?? this.view.video.currentTime;
    if (t >= x0 && t <= x1) {
      const x = X(t);
      ctx.strokeStyle = '#F4C542'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + H); ctx.stroke();
      const v = this.seriesAt(this.chartMetric, t);
      if (v != null) {
        ctx.beginPath(); ctx.arc(x, Y(v * scale), 4, 0, Math.PI * 2); ctx.fillStyle = '#F4C542'; ctx.fill();
        ctx.font = '600 15px "Barlow Condensed", sans-serif';
        ctx.textAlign = x > L + W - 50 ? 'right' : 'left'; ctx.textBaseline = 'top';
        ctx.fillText(fmtMetric(M, v), x + (ctx.textAlign === 'right' ? -6 : 6), T);
      }
    }
  },

  // ---- 描画 ----
  markColor() { $$('#pColors .sw').forEach(b => b.classList.toggle('on', b.dataset.c === this.color)); },
  local(e) { const r = this.view.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
  pushUndo() { this.undo.push(JSON.stringify(this.swing.drawings)); if (this.undo.length > 40) this.undo.shift(); },
  undoDraw() {
    if (!this.undo.length) { toast('戻せる操作はありません'); return; }
    this.swing.drawings = JSON.parse(this.undo.pop());
    this.saveSoon(); this.view.render();
  },
  hitShape(x, y) {
    const v = this.view, sh = this.swing.drawings;
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i], Pp = s.p.map(p => v.toPx(p[0], p[1]));
      let d = Infinity;
      if (s.t === 'line') d = distSeg(x, y, Pp[0][0], Pp[0][1], Pp[1][0], Pp[1][1]);
      else if (s.t === 'xline') d = distLine(x, y, Pp[0][0], Pp[0][1], Pp[1][0], Pp[1][1]);
      else if (s.t === 'circle') d = Math.abs(Math.hypot(x - Pp[0][0], y - Pp[0][1]) - Math.hypot(Pp[1][0] - Pp[0][0], Pp[1][1] - Pp[0][1]));
      else if (s.t === 'angle') d = Math.min(distSeg(x, y, Pp[0][0], Pp[0][1], Pp[1][0], Pp[1][1]), distSeg(x, y, Pp[0][0], Pp[0][1], Pp[2][0], Pp[2][1]));
      if (d < 16) return i;
    }
    return -1;
  },
  onDown(e) {
    if (this.tapMode === 'ball') {
      e.preventDefault();
      const [x, y] = this.local(e), n = this.view.toNorm(x, y);
      if (n[0] < 0 || n[0] > 1 || n[1] < 0 || n[1] > 1) return;
      this.swing.ball = { pos: n, auto: null };
      this.tapMode = null; this.updateTapUI();
      this.saveSoon(); this.diag = null; this.view.render(); this.renderDiag();
      toast('ボールの位置を設定しました');
      return;
    }
    if (!this.view.editing) return;
    e.preventDefault();
    this.view.canvas.setPointerCapture(e.pointerId);
    const [x, y] = this.local(e), v = this.view, shapes = this.swing.drawings;
    for (let i = shapes.length - 1; i >= 0; i--) {
      for (let j = 0; j < shapes[i].p.length; j++) {
        const [px, py] = v.toPx(shapes[i].p[j][0], shapes[i].p[j][1]);
        if (Math.hypot(px - x, py - y) < 24) {
          this.pushUndo();
          this.drag = { si: i, pj: j, isNew: false };
          v.loupe = { x: px, y: py, c: shapes[i].c };
          v.render();
          return;
        }
      }
    }
    if (this.tool === 'erase') {
      const i = this.hitShape(x, y);
      if (i >= 0) { this.pushUndo(); shapes.splice(i, 1); this.saveSoon(); v.render(); }
      return;
    }
    const n = v.toNorm(x, y);
    this.pushUndo();
    shapes.push({ t: this.tool, c: this.color, p: this.tool === 'angle' ? [n, n.slice(), n.slice()] : [n, n.slice()] });
    this.drag = { si: shapes.length - 1, pj: 1, isNew: true };
    v.loupe = { x, y, c: this.color };
    v.render();
  },
  onMove(e) {
    if (!this.drag) return;
    e.preventDefault();
    const v = this.view, sh = this.swing.drawings[this.drag.si];
    let [x, y] = this.local(e);
    if ((sh.t === 'line' || sh.t === 'xline')) { const o = v.toPx(sh.p[1 - this.drag.pj][0], sh.p[1 - this.drag.pj][1]); [x, y] = snapPt(o[0], o[1], x, y); }
    sh.p[this.drag.pj] = v.toNorm(x, y);
    if (this.drag.isNew && sh.t === 'angle') {
      const [vx, vy] = v.toPx(sh.p[0][0], sh.p[0][1]);
      sh.p[2] = v.toNorm(vx, vy - Math.hypot(x - vx, y - vy));
    }
    v.loupe = { x, y, c: sh.c };
    v.render();
  },
  onUp() {
    if (!this.drag) return;
    const v = this.view, sh = this.swing.drawings[this.drag.si];
    if (this.drag.isNew && sh) {
      const [ax, ay] = v.toPx(sh.p[0][0], sh.p[0][1]), [bx, by] = v.toPx(sh.p[1][0], sh.p[1][1]);
      if (Math.hypot(bx - ax, by - ay) < 10) { this.swing.drawings.pop(); this.undo.pop(); }
    }
    this.drag = null; v.loupe = null;
    this.saveSoon(); v.render();
  },
  updateTapUI() {
    $('#pTapBanner').hidden = this.tapMode !== 'ball';
    $('#pStage').classList.toggle('tapping', this.tapMode === 'ball');
  },

  // ---- チェック（レッスン項目・ベスト比較・球筋・AI） ----
  async computeDiag() {
    const sw = this.swing, best = findBest(sw);
    if (best?.hasPose) {
      if (this.best?.id !== best.id || !this.bestTrack) {
        const rec = await DB.get('poses', best.id);
        this.bestTrack = rec ? new PoseTrack(rec) : null;
      }
    } else this.bestTrack = null;
    this.best = best;
    const res = Coach.runChecks(sw, this.view.pose, best, this.bestTrack);
    this.diag = { ...res, best };
    sw.checks = { at: Date.now(), bestId: best?.id || null, list: res.checks.map(c => ({ id: c.id, item: c.item, label: c.label, status: c.status, text: c.text })) };
    this.saveSoon();
  },
  async renderDiag() {
    const el = $('#diagBody'), sw = this.swing;
    if (!sw) return;
    const m = sw.markers, hasPose = !!this.view.pose;
    let h = '';
    if (!hasPose) {
      h += '<p class="note">骨格を解析すると、レッスンで言われたポイント（始動で頭が下がらない、インパクトで胸を開かない、両膝を伸ばしてインパクト、8：2のフィニッシュなど）を自動でチェックし、ベストと比べます。</p><button class="btn primary wide" data-act="analyze">骨格を解析してチェック</button>';
    } else if (m.address == null || m.top == null || m.impact == null) {
      h += '<p class="note">チェックにはアドレス・トップ・インパクトのマーカーが必要です。</p><button class="btn primary wide" data-act="automark">マーカーを自動設定</button>';
    } else {
      if (!this.diag) await this.computeDiag();
      if (this.swing !== sw) return;
      const d = this.diag;
      const opts = bestCandidates(sw);
      h += '<div class="row" style="margin-top:6px"><span class="lbl">比べる相手</span>';
      if (sw.isBest && !opts.length) h += '<span style="font-size:13px;flex:1">これがベストです（レッスン基準だけでチェック）</span>';
      else if (!opts.length) h += `<span style="font-size:13px;flex:1;color:var(--chalk-2)">${VIEWS[sw.view]}から撮ったベストがありません</span><button class="btn sm" data-act="addbest">ベストを登録</button>`;
      else h += `<select id="diagBest" class="seg" style="flex:1;padding:8px;color:var(--chalk)">${opts.map(o => `<option value="${o.id}" ${o.id === d.best?.id ? 'selected' : ''}>★ ${esc(swingLabel(o))}</option>`).join('')}</select>`;
      h += '</div>';
      if (d.best && !d.best.hasPose) h += `<p class="note">ベストの骨格がまだ解析されていないため、ベストとの比較は表示されません。</p><button class="btn sm" data-act="openbest">ベストを開いて解析</button>`;
      const checks = [...d.checks].sort((a, b) => (a.status === 'warn' ? 0 : 1) - (b.status === 'warn' ? 0 : 1));
      const nw = checks.filter(c => c.status === 'warn').length;
      h += `<div class="h3">レッスンのチェック（注意 ${nw}／${checks.length}）</div>`;
      h += checks.length ? checks.map(c => `<div class="check ${c.status}"><span class="ic">${c.status === 'ok' ? '✓' : '!'}</span><div><b>${esc(c.label)}</b><p>${esc(c.text)}</p>${c.vsBest ? `<small>${esc(c.vsBest)}</small>` : ''}</div></div>`).join('')
        : '<p class="note">この動画ではチェックできる項目がありませんでした。全身が映っているか確認してください。</p>';
      if (sw.view === 'dtl') h += '<p class="note">体重配分・頭の左右・フィニッシュの手の位置・ボール位置は、正面から撮った動画でチェックできます。</p>';
      if (d.bs) {
        const rows = Coach.compareTable(sw, d.st, d.bs);
        const cols = MARKS.filter(K => sw.markers[K.k] != null && d.best.markers?.[K.k] != null);
        if (rows.length && cols.length) {
          h += '<div class="h3">ベストとの角度の差</div><table class="mt"><thead><tr><th></th>' + cols.map(K => `<th>${K.jp}</th>`).join('') + '</tr></thead><tbody>';
          for (const { M, cells } of rows) {
            h += `<tr><td>${M.label(sw)}</td>` + cols.map(K => {
              const c = cells[MARKS.indexOf(K)];
              const dd = isNum(c.d) ? (M.pct ? Math.round(c.d * 100) : Math.round(c.d)) : null;
              return `<td>${fmtMetric(M, c.cur)}<small>${isNum(c.best) ? 'ベスト' + fmtMetric(M, c.best) : '—'}${dd != null && Math.abs(dd) >= (M.pct ? 8 : 6) ? ` <span class="${dd > 0 ? 'up' : 'dn'}">${dd > 0 ? '+' : ''}${dd}</span>` : ''}</small></td>`;
            }).join('') + '</tr>';
          }
          h += '</tbody></table>';
        }
      }
      h += '<div class="row" style="margin-top:12px">';
      if (d.best) h += '<button class="btn sm" data-act="compare">ベストと並べて見る</button>';
      h += '<button class="btn sm primary" data-act="ai">AIに詳しく見てもらう</button><button class="btn sm" data-act="ask">このスイングについて質問</button></div>';
      h += `<div id="aiReview" class="aibox md" ${sw.aiReview ? '' : 'hidden'}>${sw.aiReview ? md(sw.aiReview.text) + `<p class="note">${new Date(sw.aiReview.at).toLocaleString('ja-JP')} のAIの回答</p>` : ''}</div>`;
    }
    // 球筋
    const r = sw.result || {};
    h += '<div class="h3">打球の結果</div>';
    for (const [k, def] of Object.entries(Coach.RESULT)) {
      h += `<div class="resrow"><span class="lbl">${def.jp}</span><div class="chips">${def.opts.map(([v, jp]) => `<button class="chip ${r[k] === v ? 'on' : ''}" data-res="${k}" data-v="${v}">${jp}</button>`).join('')}</div></div>`;
    }
    h += `<div class="row"><button class="btn sm" data-act="balltap">${sw.ball?.pos ? 'ボールの位置を指定し直す' : 'ボールの位置を指定'}</button><button class="btn sm" data-act="ballest" ${!sw.ball?.pos || m.impact == null ? 'disabled' : ''}>動画から打ち出しを推定</button></div>`;
    const a = sw.ball?.auto;
    let bt = 'アドレスの画面でボールをタップしてから「推定」を押すと、インパクト後のコマからボールを探します（三脚で固定したスロー動画向け。判別できたときだけ結果を出します）。';
    if (a?.ok) bt = (isNum(a.launch) ? `打ち出し角は約${Math.round(a.launch)}°（${Coach.resultJP('height', a.height)}）と推定しました。` : `打ち出し方向は${a.start === 'straight' ? 'ほぼまっすぐ' : `${a.start === 'right' ? '右' : '左'}に約${Math.abs(Math.round(a.side))}°`}と推定しました。`) + `${a.frames}コマで検出（赤い点）。カメラの向きによって誤差があります。`;
    else if (a && !a.ok) bt = a.reason;
    h += `<p class="note">${esc(bt)}</p>`;
    el.innerHTML = h;
  },
  async onDiagClick(e) {
    const b = e.target.closest('[data-act],[data-res]');
    if (!b) return;
    const sw = this.swing;
    if (b.dataset.res) {
      const k = b.dataset.res, v = b.dataset.v;
      sw.result[k] = sw.result[k] === v ? null : v;
      this.saveSoon();
      if (k === 'start') this.diag = null;
      this.renderDiag();
      return;
    }
    switch (b.dataset.act) {
      case 'analyze': this.analyze({ auto: true }); break;
      case 'automark': if (this.autoMark(true)) this.renderDiag(); break;
      case 'compare': if (this.diag?.best) C.open(sw.id, this.diag.best.id, 'tempo'); break;
      case 'ai': this.aiReview(); break;
      case 'ask': Chat.attach = { ...sw }; S.afterHome = () => setView('vChat'); history.back(); break;
      case 'addbest': pickVideo(true); break;
      case 'openbest': if (this.diag?.best) { const id = this.diag.best.id; await this.close(); await this.open(id, { replace: true }); } break;
      case 'balltap':
        this.tapMode = 'ball'; this.updateTapUI();
        this.view.video.pause();
        if (sw.markers.address != null) this.view.seek(sw.markers.address);
        toast('動画の上でボールをタップしてください');
        break;
      case 'ballest': this.estimateBall(); break;
    }
  },
  async estimateBall() {
    const sw = this.swing, v = this.view.video;
    v.pause();
    const back = v.currentTime;
    Busy.show('ボールを探しています…', { progress: 0, see: true });
    let r;
    try { r = await Coach.estimateBall(v, sw, p => Busy.update(null, p)); }
    catch (e) { console.error(e); r = { ok: false, reason: '推定中にエラーが起きました。' }; }
    Busy.hide();
    if (!this.isOpen) return;
    sw.ball = { ...(sw.ball || {}), auto: r };
    if (r.ok) {
      if (r.start && !sw.result.start) sw.result.start = r.start;
      if (r.height && !sw.result.height) sw.result.height = r.height;
    }
    this.saveSoon(); this.diag = null;
    await this.view.seekWait(back);
    this.syncUI(); this.renderDiag();
    toast(r.ok ? '打ち出しを推定しました' : '判別できませんでした');
  },
  async aiReview() {
    if (!Settings.get('apiKey')) { openApiNeeded(); return; }
    const sw = this.swing, d = this.diag;
    if (!d) return;
    Busy.show('動画のコマを準備中…');
    try {
      const blob = await DB.get('videos', sw.id);
      const frames = await Coach.keyFrames(blob, sw);
      let bframes = [];
      if (d.best) { const bb = await DB.get('videos', d.best.id); if (bb) bframes = await Coach.keyFrames(bb, d.best); }
      Busy.hide();
      if (this.swing !== sw) return;
      const box = $('#aiReview');
      box.hidden = false;
      box.innerHTML = '<p class="note">AIが見ています…</p>';
      box.scrollIntoView({ block: 'nearest' });
      const ctxText = Coach.buildContext({ notes: S.notes, swings: S.swings, focus: Coach.buildFocus(S.notes, S.swings), handed: sw.handed })
        + '\n' + Coach.swingDetailText(sw, d.st, d.bs, d.checks, d.best)
        + `\n\n上の画像（今回${bframes.length ? 'とベスト' : ''}のキーポジション）と資料をもとに、今回のスイングを見てください。\n1. ${bframes.length ? 'ベストと比べて' : 'レッスンの基準と比べて'}目立つ違いを、重要な順に3つまで（画像のどこを見ればわかるかも）\n2. それぞれ、レッスンで指摘された内容とどう関係するか\n3. 次の練習でやること（ドリルと回数）\n4. 次に撮影するときに確認するポイント`;
      const content = [...Coach.imageBlocks(frames, '今回のスイング'), ...Coach.imageBlocks(bframes, 'ベストのスイング'), { type: 'text', text: ctxText }];
      this.aiAbort = new AbortController();
      const text = await Coach.claude({
        system: Coach.systemPrompt(sw.handed), messages: [{ role: 'user', content }], maxTokens: 2000, signal: this.aiAbort.signal,
        onText: t => { const el = $('#aiReview'); if (el && this.swing === sw) el.innerHTML = md(t); },
      });
      sw.aiReview = { text, at: Date.now(), bestId: d.best?.id || null };
      this.saveSoon();
    } catch (e) {
      Busy.hide();
      console.error(e);
      const el = $('#aiReview');
      if (el) { el.hidden = false; el.innerHTML = `<p class="note">${esc(Coach.apiErrorText(e))}</p>`; }
      else toast(Coach.apiErrorText(e));
    }
  },

  // ---- 情報 ----
  renderInfo() { swingForm($('#pInfoForm'), this.swing, (k, v) => this.onInfo(k, v)); },
  onInfo(k, v) {
    const sw = this.swing;
    sw[k] = v;
    this.saveSoon();
    if (['club', 'title', 'isBest', 'date', 'view'].includes(k)) this.renderHeader();
    if (k === 'view' || k === 'handed') { this.view.refreshCtx(); this.computeSeries(); this.view.render(); }
    if (['isBest', 'view', 'club', 'handed'].includes(k)) { this.diag = null; this.best = null; this.bestTrack = null; }
  },
  async deleteSwing() {
    if (!confirm('このスイングを削除しますか？\n動画と解析データも消え、元に戻せません。')) return;
    const id = this.swing.id;
    clearTimeout(this.saveTm);
    this.isOpen = false;
    this.view.video.pause();
    this.view.unload();
    this.swing = null;
    await DB.del('swings', id); await DB.del('videos', id); await DB.del('poses', id);
    toast('削除しました');
    history.back();
  },
  saveSoon() { clearTimeout(this.saveTm); this.saveTm = setTimeout(() => this.flush(), 400); },
  async flush() {
    clearTimeout(this.saveTm);
    if (!this.swing) return;
    try { await DB.put('swings', this.swing); } catch (e) { console.error(e); toast('保存に失敗しました'); }
  },
};

// ===== 比較画面 =====
const CMP_KEYS = ['spine', 'leadElbow', 'chestTurn'];
const C = {
  A: null, B: null, tl: null, tau: 0, playing: false, speed: 1, sync: 'start', layout: 'side', loop: false, opacity: 0.5,
  showAngles: true, raf: 0, lastWall: 0, map: { a0: 0, b0: 0, k: 1, min: 0, max: 1 }, isOpen: false, markSync: null,

  init() {
    const showDef = { pose: true, trail: false, head: false, drawings: false };
    this.A = new SwingView($('#cStageA'), showDef);
    this.B = new SwingView($('#cStageB'), showDef);
    const hud = (el, sv) => (t, lm) => {
      if (!this.showAngles || !lm || !sv.mc) { el.innerHTML = ''; return; }
      const r = frameMetrics(lm, sv.mc);
      el.innerHTML = metricsFor(sv.swing).filter(M => CMP_KEYS.includes(M.k) && isNum(r[M.k]))
        .map(M => `<span>${M.label(sv.swing)}</span><span class="v">${fmtMetric(M, r[M.k])}</span>`).join('');
    };
    this.A.onRender = hud($('#cHudA'), this.A);
    this.B.onRender = hud($('#cHudB'), this.B);
    this.tl = new Timeline($('#cTimeline'), (v, ph) => this.scrub(v, ph));
    $('#cBack').onclick = () => history.back();
    $('#cPlay').onclick = () => (this.playing ? this.pause() : this.play());
    holdRepeat($('#cPrev'), () => this.step(-1));
    holdRepeat($('#cNext'), () => this.step(1));
    $('#cSpeed').onclick = () => {
      this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
      $('#cSpeed').textContent = SPEED_LBL[this.speed];
      if (this.playing) this.applyRates();
    };
    this.markSync = bindSeg($('#cSync'), this.sync, v => this.setSync(v));
    $('#cLayout').onclick = () => { this.layout = this.layout === 'overlay' ? 'side' : 'overlay'; this.applyLayout(); };
    $('#cOpacity').oninput = e => { this.opacity = +e.target.value; this.applyLayout(); };
    $('#cToggles').onclick = e => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      const k = b.dataset.t;
      if (k === 'pose' || k === 'drawings') { const v = !this.A.show[k]; this.A.show[k] = v; this.B.show[k] = v; }
      else if (k === 'angles') this.showAngles = !this.showAngles;
      else if (k === 'mirA') { this.A.mirror = !this.A.mirror; this.A.applyMirror(); }
      else if (k === 'mirB') { this.B.mirror = !this.B.mirror; this.B.applyMirror(); }
      else if (k === 'loop') this.loop = !this.loop;
      this.renderToggles();
      this.A.render(); this.B.render();
    };
  },
  renderToggles() {
    const st = { pose: this.A.show.pose, drawings: this.A.show.drawings, angles: this.showAngles, mirA: this.A.mirror, mirB: this.B.mirror, loop: this.loop };
    $$('#cToggles [data-t]').forEach(b => b.classList.toggle('on', !!st[b.dataset.t]));
  },
  async open(a, b, pref) {
    Busy.show('読み込み中…');
    try {
      const [sa, sb] = await Promise.all([DB.get('swings', a), DB.get('swings', b)]);
      const [va, vb] = await Promise.all([DB.get('videos', a), DB.get('videos', b)]);
      if (!sa || !sb || !va || !vb) throw new Error('missing');
      normalizeSwing(sa); normalizeSwing(sb);
      const [pa, pb] = await Promise.all([sa.hasPose ? DB.get('poses', a) : null, sb.hasPose ? DB.get('poses', b) : null]);
      if (P.isOpen) P.view.video.pause();
      show('compare');
      this.isOpen = true;
      await Promise.all([this.A.load(sa, va, pa), this.B.load(sb, vb, pb)]);
      $('#cLabelA').innerHTML = `<b>A</b>${esc(swingLabel(sa))}${sa.isBest ? ' ★' : ''}`;
      $('#cLabelB').innerHTML = `<b>B</b>${esc(swingLabel(sb))}${sb.isBest ? ' ★' : ''}`;
      this.sync = this.pickSync(pref);
      this.markSync(this.sync);
      this.updateSyncButtons();
      this.applyLayout();
      this.computeMap();
      this.tau = clamp(this.sync === 'start' ? 0 : -0.6, this.map.min, this.map.max);
      this.renderToggles();
      this.seekAll();
      history.pushState({ screen: 'compare' }, '');
    } catch (e) {
      console.error(e);
      toast('動画を開けませんでした');
      this.isOpen = false;
      show(P.isOpen ? 'player' : 'home');
    } finally { Busy.hide(); }
  },
  close() {
    if (!this.isOpen) return;
    this.pause();
    this.isOpen = false;
    this.A.unload(); this.B.unload();
  },
  avail() {
    const a = this.A.swing.markers, b = this.B.swing.markers;
    return {
      start: true,
      top: a.top != null && b.top != null,
      impact: a.impact != null && b.impact != null,
      tempo: a.top != null && b.top != null && a.impact != null && b.impact != null && a.impact > a.top && b.impact > b.top,
    };
  },
  pickSync(pref) {
    const av = this.avail();
    if (pref && av[pref]) return pref;
    return ['tempo', 'impact', 'top', 'start'].find(k => av[k]);
  },
  updateSyncButtons() { const av = this.avail(); $$('#cSync [data-v]').forEach(b => { b.disabled = !av[b.dataset.v]; }); },
  setSync(s) {
    this.pause();
    this.sync = s;
    this.computeMap();
    this.tau = clamp(s === 'start' ? 0 : -0.6, this.map.min, this.map.max);
    this.seekAll();
  },
  computeMap() {
    const a = this.A.swing.markers, b = this.B.swing.markers;
    let a0 = 0, b0 = 0, k = 1;
    if (this.sync === 'top') { a0 = a.top; b0 = b.top; }
    else if (this.sync === 'impact') { a0 = a.impact; b0 = b.impact; }
    else if (this.sync === 'tempo') { a0 = a.top; b0 = b.top; k = (b.impact - b.top) / (a.impact - a.top); if (!(k > 0.05 && k < 20)) k = 1; }
    const dA = this.A.duration, dB = this.B.duration;
    this.map = { a0, b0, k, min: Math.min(-a0, -b0 / k), max: Math.max(dA - a0, (dB - b0) / k) };
    this.tl.setRange(this.map.min, this.map.max);
    this.tl.setMarks(MARKS.filter(M => a[M.k] != null).map(M => ({ v: a[M.k] - a0, s: M.s, c: M.c })));
  },
  tFor(side, tau) { return side === this.A ? this.map.a0 + tau : this.map.b0 + this.map.k * tau; },
  applyRates() {
    this.A.video.playbackRate = clamp(this.speed, 0.0625, 16);
    this.B.video.playbackRate = clamp(this.speed * this.map.k, 0.0625, 16);
  },
  applyLayout() {
    const el = $('#cStages');
    const portrait = s => s.vh >= s.vw;
    el.classList.toggle('overlay', this.layout === 'overlay');
    el.classList.toggle('col', this.layout !== 'overlay' && !(portrait(this.A) && portrait(this.B)));
    $('#cStageB').style.opacity = this.layout === 'overlay' ? this.opacity : '';
    $('#cOpacityRow').hidden = this.layout !== 'overlay';
    $('#cLayout').textContent = this.layout === 'overlay' ? '並べる' : '重ねる';
    requestAnimationFrame(() => { this.A.resize(); this.B.resize(); this.A.render(); this.B.render(); });
  },
  seekAll() {
    for (const s of [this.A, this.B]) {
      const t = this.tFor(s, this.tau), d = s.duration;
      s.stage.classList.toggle('out', t < 0 || t > d);
      s.seek(clamp(t, 0, d - 0.001));
    }
    this.tl.setValue(this.tau);
    this.timeText();
  },
  timeText() {
    const t = this.tau;
    $('#cTime').innerHTML = `${this.sync === 'start' ? '' : (t >= 0 ? '+' : '−')}${Math.abs(t).toFixed(2)}<small>s</small>`;
  },
  play() {
    if (this.tau >= this.map.max - 0.02) this.tau = this.map.min;
    this.playing = true;
    $('#cPlay').innerHTML = ICON_PAUSE;
    this.applyRates();
    this.lastWall = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  },
  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    $('#cPlay').innerHTML = ICON_PLAY;
    this.A.video.pause(); this.B.video.pause();
    if (this.isOpen) this.seekAll();
  },
  tick: () => {
    const c = C;
    if (!c.playing) return;
    const now = performance.now(), dt = (now - c.lastWall) / 1000;
    c.lastWall = now;
    let tau = null;
    for (const s of [c.A, c.B]) {
      const v = s.video;
      if (!v.paused && !v.seeking && v.readyState >= 3) {
        tau = s === c.A ? v.currentTime - c.map.a0 : (v.currentTime - c.map.b0) / c.map.k;
        break;
      }
    }
    if (tau == null || tau < c.tau - 0.25) tau = c.tau + dt * c.speed;
    c.tau = tau;
    if (tau >= c.map.max) {
      if (c.loop) { c.tau = c.map.min; c.A.video.pause(); c.B.video.pause(); c.seekAll(); c.raf = requestAnimationFrame(c.tick); return; }
      c.tau = c.map.max; c.pause(); return;
    }
    for (const s of [c.A, c.B]) {
      const v = s.video, t = c.tFor(s, tau), d = s.duration;
      const inRange = t >= 0 && t < d - 0.03;
      s.stage.classList.toggle('out', !inRange);
      if (inRange) {
        if (v.paused) { v.currentTime = t; v.playbackRate = clamp(c.speed * (s === c.B ? c.map.k : 1), 0.0625, 16); v.play().catch(() => {}); }
        else if (!v.seeking && Math.abs(v.currentTime - t) > 0.15) v.currentTime = t;
      } else if (!v.paused) v.pause();
      s.render(v.currentTime);
    }
    c.tl.setValue(tau);
    c.timeText();
    c.raf = requestAnimationFrame(c.tick);
  },
  step(dir) {
    this.pause();
    const fa = this.A.swing.fpsOverride || this.A.swing.fps || 30, fb = this.B.swing.fpsOverride || this.B.swing.fps || 30;
    const dt = Math.min(1 / fa, 1 / (fb * this.map.k));
    this.tau = clamp(this.tau + dir * dt, this.map.min, this.map.max);
    this.seekAll();
  },
  scrub(v, ph) {
    if (ph === 'start') this.pause();
    this.tau = v;
    this.seekAll();
  },
};

// ===== 練習（課題・ドリル・レッスンメモ・球筋） =====
function focusCard(f, i, open) {
  const it = f.it, why = [];
  for (const s of f.swings.slice(0, 2)) why.push(`<div class="why"><b>動画 ${fmtDate(s.date)} ${esc(s.club)}</b> ${esc(s.text)}</div>`);
  for (const b of f.ball.slice(0, 2)) why.push(`<div class="why"><b>球筋</b> ${esc(b)}</div>`);
  for (const n of f.notes.slice(0, 2)) why.push(`<div class="why"><b>レッスン ${fmtDate(n.date)}</b> ${n.lines.map(esc).join('　／　')}</div>`);
  const drills = it.drills.map(d => `<div class="drill"><b>${esc(d.name)}<span class="reps">${esc(d.reps)}</span></b><p>${esc(d.how)}</p></div>`).join('');
  return `<article class="focus"><h3><span class="rank">${i + 1}</span>${esc(it.title)}</h3><p class="point">${esc(it.point)}</p>${why.join('')}${open ? drills : `<details class="more"><summary>練習メニューを見る</summary>${drills}</details>`}</article>`;
}
async function renderPractice() {
  const focus = Coach.buildFocus(S.notes, S.swings);
  const fromVideo = focus.filter(f => f.swings.length || f.ball.length)
    .sort((a, b) => (b.swings.length * 2 + b.ball.length) - (a.swings.length * 2 + a.ball.length) || b.score - a.score);
  const fromNotes = focus.filter(f => !fromVideo.includes(f));
  let h = '';
  if (!focus.length) h = '<p class="note">レッスンメモを入れるか、スイングを解析すると、ここに今の課題と練習メニューが出ます。</p>';
  if (fromVideo.length) {
    h += '<p class="note" style="margin-top:0">最近の動画と打球の記録で見つかった課題です。</p>';
    h += fromVideo.slice(0, 3).map((f, i) => focusCard(f, i, true)).join('');
    if (fromVideo.length > 3) h += `<details class="more"><summary>ほかの課題（${fromVideo.length - 3}）</summary>${fromVideo.slice(3).map((f, i) => focusCard(f, i + 3, false)).join('')}</details>`;
  }
  if (fromNotes.length) {
    h += `<div class="h3">レッスンで言われていること</div><p class="note" style="margin-top:0">レッスンメモで何度も・強調して書かれている順です。</p>`;
    const k = fromVideo.length ? 2 : 4;
    h += fromNotes.slice(0, k).map((f, i) => focusCard(f, i, !fromVideo.length && i < 2)).join('');
    if (fromNotes.length > k) h += `<details class="more"><summary>ほかの項目（${fromNotes.length - k}）</summary>${fromNotes.slice(k).map((f, i) => focusCard(f, i + k, false)).join('')}</details>`;
  }
  $('#focusList').innerHTML = h;
  const td = Coach.tendency(S.swings);
  $('#tendList').innerHTML = td.length
    ? td.map(t => `<div class="tend"><span class="club-s">${esc(t.club)}</span><span><span class="num">${t.n}</span>球　${esc(Coach.tendencyText(t))}</span></div>`).join('')
    : '<p class="note">スイングの「チェック」タブで打球の結果（打ち出し・曲がり・高さ・当たり）を記録すると、番手ごとの傾向がここに出ます。</p>';
  renderNotes();
  const plan = await DB.get('kv', 'plan').catch(() => null);
  $('#planOut').innerHTML = plan?.text ? md(plan.text) + `<p class="note">${new Date(plan.at).toLocaleString('ja-JP')} に作成</p>`
    : '<p class="note">レッスンメモ・最近のスイングのチェック結果・球筋をもとに、次の練習メニューをAIが作ります（APIキーが必要）。</p>';
}
function renderNotes() {
  const list = [...S.notes].sort((a, b) => b.date.localeCompare(a.date));
  $('#notesList').innerHTML = list.length ? list.map(n => {
    const tags = Coach.ITEMS.map(it => ({ it, n: Coach.noteHits(n, it).reduce((a, h) => a + (h.emph ? 2 : 1), 0) }))
      .filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 5).map(x => `<span class="tag">${esc(x.it.title)}</span>`).join('');
    return `<div class="noteitem" data-id="${n.id}"><header><b>${fmtDate(n.date)} ${esc(n.title)}</b><button class="chip" data-a="toggle">全文</button><button class="chip" data-a="edit">編集</button></header><pre class="selectable">${esc(n.text)}</pre><div class="tags">${tags}</div></div>`;
  }).join('') : '<p class="note">レッスンで言われたことを貼り付けておくと、チェック・練習メニュー・AIの回答に使われます。「2026/3/28 レッスン」のような日付の行ごとに自動で分けます。</p>';
}
function openNotesPaste() {
  const body = document.createElement('div');
  body.innerHTML = `<p class="note">メモアプリなどからそのまま貼り付けてください。「2026/3/28 レッスン」のように日付で始まる行ごとに1件ずつ分けて保存します。</p>
    <label class="field"><span>レッスンメモ</span><textarea id="npText" rows="10" placeholder="2026/3/28 レッスン&#10;インパクト前後15センチはストレート…"></textarea></label>
    <p class="note" id="npInfo"></p>
    <div class="sheet-actions"><button class="btn" id="npFile">ファイルから</button><button class="btn primary" id="npSave" disabled>追加</button></div>`;
  const sh = openSheet('レッスンメモを貼り付け', body, { modal: true });
  const ta = $('#npText', body), info = $('#npInfo', body), save = $('#npSave', body);
  const upd = () => {
    const parts = Coach.splitNotes(ta.value);
    info.textContent = parts.length ? `${parts.length}件に分けて保存します：${parts.map(p => fmtDate(p.date)).join('、')}` : '';
    save.disabled = !parts.length;
  };
  ta.addEventListener('input', upd);
  $('#npFile', body).onclick = () => $('#noteFile').click();
  $('#noteFile').onchange = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) { ta.value = await f.text(); upd(); }
  };
  save.onclick = async () => {
    const parts = Coach.splitNotes(ta.value);
    let added = 0;
    for (const p of parts) {
      if (S.notes.some(n => n.date === p.date && n.text === p.text)) continue;
      const n = { id: uid(), createdAt: Date.now(), ...p };
      await DB.put('notes', n); S.notes.push(n); added++;
    }
    sh.close();
    toast(added ? `${added}件のレッスンメモを追加しました` : '同じメモがすでにあります');
    renderPractice();
  };
}
function openNoteEdit(n) {
  const isNew = !n;
  const d = n ? { ...n } : { id: uid(), createdAt: Date.now(), date: todayISO(), title: 'レッスン', text: '' };
  const body = document.createElement('div');
  body.innerHTML = `<div class="two"><label class="field"><span>日付</span><input type="date" id="neDate" value="${esc(d.date)}"></label><label class="field"><span>タイトル</span><input type="text" id="neTitle" value="${esc(d.title)}"></label></div>
    <label class="field"><span>内容</span><textarea id="neText" rows="12">${esc(d.text)}</textarea></label>
    <div class="sheet-actions">${isNew ? '' : '<button class="btn danger" id="neDel">削除</button>'}<button class="btn primary" id="neSave">保存</button></div>`;
  const sh = openSheet(isNew ? 'レッスンメモを追加' : 'レッスンメモを編集', body, { modal: true });
  $('#neSave', body).onclick = async () => {
    d.date = $('#neDate', body).value || todayISO();
    d.title = $('#neTitle', body).value.trim() || 'レッスン';
    d.text = $('#neText', body).value.trim();
    if (!d.text) { toast('内容を入力してください'); return; }
    await DB.put('notes', d);
    S.notes = S.notes.filter(x => x.id !== d.id).concat(d);
    sh.close(); renderPractice();
  };
  if (!isNew) $('#neDel', body).onclick = async () => {
    if (!confirm('このレッスンメモを削除しますか？')) return;
    await DB.del('notes', d.id);
    S.notes = S.notes.filter(x => x.id !== d.id);
    sh.close(); renderPractice();
  };
}
async function makePlan() {
  if (!Settings.get('apiKey')) { openApiNeeded(); return; }
  const out = $('#planOut');
  out.innerHTML = '<p class="note">考えています…</p>';
  $('#btnPlan').disabled = true;
  try {
    const focus = Coach.buildFocus(S.notes, S.swings);
    const text = await Coach.claude({
      system: Coach.systemPrompt(Settings.get('handed')),
      messages: [{ role: 'user', content: Coach.buildContext({ notes: S.notes, swings: S.swings, focus, handed: Settings.get('handed') })
        + '\n\n資料をもとに、次の練習（練習場で60〜90分、100球くらい）のメニューを作ってください。\n- 最初に今日のテーマを1行で\n- 時間配分つきの流れ（素振り・ドリル・番手別・仕上げ）\n- 各ドリルの回数・球数と意識するポイント（レッスンメモの言葉を使って）\n- 動画を撮るタイミングと、アプリでチェックする項目' }],
      maxTokens: 1800, onText: t => { out.innerHTML = md(t); },
    });
    await DB.put('kv', { text, at: Date.now() }, 'plan');
    out.innerHTML = md(text) + `<p class="note">${new Date().toLocaleString('ja-JP')} に作成</p>`;
  } catch (e) {
    out.innerHTML = `<p class="note">${esc(Coach.apiErrorText(e))}</p>`;
  } finally { $('#btnPlan').disabled = false; }
}
function wirePractice() {
  $('#btnNotesPaste').onclick = () => openNotesPaste();
  $('#btnNoteAdd').onclick = () => openNoteEdit(null);
  $('#notesList').onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const item = b.closest('.noteitem'), n = S.notes.find(x => x.id === item.dataset.id);
    if (b.dataset.a === 'toggle') item.classList.toggle('open');
    if (b.dataset.a === 'edit' && n) openNoteEdit(n);
  };
  $('#btnPlan').onclick = () => makePlan();
}

// ===== 質問チャット =====
const Chat = { msgs: [], attach: null, busy: false, handoff: new Map() };
async function loadChat() { Chat.msgs = (await DB.all('chat')).sort((a, b) => a.at - b.at); }
const SUGGEST = ['シャンクが出るときに見直すことは？', 'ドライバーが右に出る', '始動で地面に押し付ける癖の直し方', '次の練習で意識することは？'];
function renderChat(scroll) {
  const el = $('#chatList');
  const key = !!Settings.get('apiKey');
  if (!Chat.msgs.length) {
    el.innerHTML = `<div class="chat-empty"><p>スイングやレッスンのことで気になることを書いてください。${key ? 'レッスンメモと最近のスイングの記録をふまえてClaudeが答えます。' : 'いまはアプリ内のドリル集とレッスンメモから答えます（設定でAPIキーを入れると、Claudeが答えます）。'}</p><div class="chips">${SUGGEST.map(s => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  } else {
    el.innerHTML = Chat.msgs.map(m => {
      if (m.role === 'user') return `<div class="msg user">${m.swingLabel ? `<span class="att">添付：${esc(m.swingLabel)}</span>\n` : ''}${esc(m.text)}</div>`;
      const mname = ((Coach.MODELS.find(x => x[0] === m.model) || [, 'AI'])[1]).replace(/（.*）/, '');
      const src = m.source === 'local' ? 'アプリ内の回答（ドリル集とレッスンメモから）' : m.source === 'error' ? '' : `Claude ${esc(mname)} の回答`;
      const acts = m.source === 'local' ? `<div class="acts"><button class="btn sm" data-handoff="${m.id}">Claudeで詳しく聞く</button></div>` : '';
      if (m.source === 'local' && !Chat.handoff.has(m.id)) prepareHandoff(m);
      return `<div class="msg bot md" data-mid="${m.id}">${m.text ? md(m.text) : '<p class="note">考えています…</p>'}${src ? `<span class="src">${src}</span>` : ''}${acts}</div>`;
    }).join('');
  }
  renderAttach();
  if (scroll) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}
function renderAttach() {
  const b = $('#chatAttach');
  b.textContent = Chat.attach ? `添付：${Chat.attach.club} ${fmtDate(Chat.attach.date)}　×` : '＋ スイングを添付';
  b.classList.toggle('on', !!Chat.attach);
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; }
function mergeTurns(list) {
  const out = [];
  for (const m of list) {
    const content = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (!out.length && m.role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content.push(...content);
    else out.push({ role: m.role, content: [...content] });
  }
  return out;
}
async function swingPack(sw) {
  normalizeSwing(sw);
  const rec = sw.hasPose ? await DB.get('poses', sw.id) : null;
  const track = rec ? new PoseTrack(rec) : null;
  const best = findBest(sw);
  const brec = best?.hasPose ? await DB.get('poses', best.id) : null;
  const r = track ? Coach.runChecks(sw, track, best, brec ? new PoseTrack(brec) : null) : null;
  return { best, r };
}
async function sendChat(textArg) {
  const ta = $('#chatInput');
  const q = (textArg ?? ta.value).trim();
  if (!q || Chat.busy) return;
  ta.value = ''; autosize(ta);
  const att = Chat.attach;
  Chat.attach = null;
  const um = { id: uid(), role: 'user', text: q, at: Date.now(), swingId: att?.id || null, swingLabel: att ? `${att.club} ${fmtDate(att.date)}` : null };
  Chat.msgs.push(um);
  await DB.put('chat', um);
  renderChat(true);
  if (!Settings.get('apiKey')) {
    const ans = Coach.localAnswer(q, S.notes) || 'この質問に合う項目がドリル集に見つかりませんでした。下のボタンから、レッスンメモと最近のスイングの記録ごとClaudeに聞けます。';
    const bm = { id: uid(), role: 'assistant', text: ans, at: Date.now(), source: 'local', q, swingId: att?.id || null };
    Chat.msgs.push(bm);
    await DB.put('chat', bm);
    renderChat(true);
    return;
  }
  Chat.busy = true;
  $('#chatSend').disabled = true;
  const bm = { id: uid(), role: 'assistant', text: '', at: Date.now(), source: 'ai', model: Settings.get('model') };
  Chat.msgs.push(bm);
  renderChat(true);
  try {
    const focus = Coach.buildFocus(S.notes, S.swings);
    const system = Coach.systemPrompt(Settings.get('handed')) + '\n\n以下はユーザーの資料です。\n\n' + Coach.buildContext({ notes: S.notes, swings: S.swings, focus, handed: Settings.get('handed') });
    const hist = Chat.msgs.filter(m => m !== bm && m !== um && m.text && m.source !== 'error').slice(-16).map(m => ({ role: m.role, content: m.text }));
    const content = [];
    if (att) {
      const blob = await DB.get('videos', att.id);
      if (blob) content.push(...Coach.imageBlocks(await Coach.keyFrames(blob, att), '添付したスイング'));
      const { best, r } = await swingPack(att);
      content.push({ type: 'text', text: Coach.swingDetailText(att, r?.st || {}, r?.bs, r?.checks, best) });
    }
    content.push({ type: 'text', text: q });
    const messages = mergeTurns([...hist, { role: 'user', content }]);
    const text = await Coach.claude({
      system, messages, maxTokens: 1500,
      onText: t => { bm.text = t; const el = $(`[data-mid="${bm.id}"]`); if (el) { el.innerHTML = md(t); const l = $('#chatList'); l.scrollTop = l.scrollHeight; } },
    });
    bm.text = text;
    await DB.put('chat', bm);
  } catch (e) {
    console.error(e);
    bm.text = Coach.apiErrorText(e); bm.source = 'error';
  } finally {
    Chat.busy = false;
    $('#chatSend').disabled = false;
    renderChat(true);
  }
}
// Claudeアプリへの引き継ぎ用テキストは先に作っておく（iPhoneのコピーはタップ直後でないと失敗するため）
async function prepareHandoff(m) {
  Chat.handoff.set(m.id, null);
  try {
    let text = Coach.buildContext({ notes: S.notes, swings: S.swings, focus: Coach.buildFocus(S.notes, S.swings), handed: Settings.get('handed'), maxNotes: 8000 });
    if (m.swingId) {
      const sw = S.swings.find(s => s.id === m.swingId);
      if (sw) { const { best, r } = await swingPack({ ...sw }); text += '\n' + Coach.swingDetailText(sw, r?.st || {}, r?.bs, r?.checks, best); }
    }
    Chat.handoff.set(m.id, Coach.systemPrompt(Settings.get('handed')) + '\n\n' + text + `\n\n# 質問\n${m.q || ''}`);
  } catch (e) { console.error(e); Chat.handoff.delete(m.id); }
}
function copyText(text) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  };
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallback());
  }
  return Promise.resolve(fallback());
}
function handoff(m) {
  const text = Chat.handoff.get(m.id);
  if (!text) { toast('準備中です。もう一度押してください'); if (!Chat.handoff.has(m.id)) prepareHandoff(m); return; }
  copyText(text).then(ok => toast(ok ? '質問と資料をコピーしました。Claudeの入力欄に貼り付けてください' : 'コピーできませんでした'));
  window.open('https://claude.ai/new', '_blank');
}
function openSwingPicker(onPick) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="grid">${S.swings.map(s => {
    const u = s.thumb ? URL.createObjectURL(s.thumb) : '';
    return `<button class="card" data-id="${s.id}"><span class="thumb">${u ? `<img src="${u}" alt="">` : ''}<span class="club">${esc(s.club)}</span></span><span class="meta"><span class="ttl">${esc(swingTitle(s))}</span><span class="sub">${fmtDate(s.date)}　${VIEWS[s.view]}</span></span></button>`;
  }).join('')}</div>`;
  const urls = $$('img', body).map(i => i.src);
  const sh = openSheet('添付するスイング', body, { onClose: () => urls.forEach(u => URL.revokeObjectURL(u)) });
  body.onclick = e => { const c = e.target.closest('.card'); if (!c) return; onPick(S.swings.find(s => s.id === c.dataset.id)); sh.close(); };
}
function wireChat() {
  const ta = $('#chatInput');
  ta.addEventListener('input', () => autosize(ta));
  $('#chatSend').onclick = () => sendChat();
  $('#chatList').onclick = e => {
    const q = e.target.closest('[data-q]');
    if (q) { sendChat(q.dataset.q); return; }
    const h = e.target.closest('[data-handoff]');
    if (h) { const m = Chat.msgs.find(x => x.id === h.dataset.handoff); if (m) handoff(m); }
  };
  $('#chatAttach').onclick = () => {
    if (Chat.attach) { Chat.attach = null; renderAttach(); return; }
    if (!S.swings.length) { toast('まだスイングがありません'); return; }
    openSwingPicker(sw => { Chat.attach = sw; renderAttach(); });
  };
  $('#chatClear').onclick = async () => {
    if (!Chat.msgs.length || !confirm('質問の履歴をすべて消しますか？')) return;
    await DB.clear('chat'); Chat.msgs = []; renderChat();
  };
}

// ===== 設定 =====
function openApiNeeded() {
  const body = document.createElement('div');
  body.innerHTML = `<p style="margin-top:4px">この機能はAI（Claude）を使います。設定でAPIキーを入れると、アプリ内でClaudeが答えます。</p>
    <p class="note">APIキーはClaude Console（Anthropicの開発者向けサイト）で作成でき、使った分だけ料金がかかります（Claudeアプリの有料プランとは別）。キーを使わない場合は、質問タブの「Claudeで詳しく聞く」で、資料ごとClaudeアプリに引き継げます。</p>
    <div class="sheet-actions"><button class="btn" data-a="close">閉じる</button><button class="btn primary" data-a="settings">設定を開く</button></div>`;
  const sh = openSheet('AIの回答を使うには', body);
  $('[data-a=close]', body).onclick = () => sh.close();
  $('[data-a=settings]', body).onclick = () => { sh.close(); openSettings(); };
}
async function openSettings() {
  let est = null, persisted = false;
  try { est = await navigator.storage?.estimate?.(); } catch { /* ignore */ }
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* ignore */ }
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="h3">新しい動画の初期値</div>
    <div class="two">
      <div class="field"><span>打ち方</span><div class="seg" id="stHanded"><button data-v="R">右打ち</button><button data-v="L">左打ち</button></div></div>
      <div class="field"><span>撮影方向</span><div class="seg" id="stView"><button data-v="dtl">後方</button><button data-v="face">正面</button></div></div>
    </div>
    <button type="button" class="toggle" id="stAuto" role="switch" aria-checked="${!!Settings.get('autoAnalyze')}"><span>保存したら自動で骨格を解析<small>解析が終わると、レッスン項目のチェックとベストとの比較を表示します。</small></span><i class="knob"></i></button>
    <div class="field"><span>骨格解析のエンジン</span><div class="seg" id="stEngine"><button data-v="auto">自動</button><button data-v="cpu">CPU</button></div><p class="note">解析が失敗する・骨格が出ないときは「CPU」を試してください。</p></div>
    <div class="h3">AIの回答（Claude）</div>
    <p class="note">APIキーを入れると、質問・練習メニュー・スイングの詳しい指摘にClaudeがアプリ内で答えます。キーはClaude Console（Anthropicの開発者向けサイト）で作成でき、使った分だけ料金がかかります（Claudeアプリの有料プランとは別）。キーはこのiPhoneの中だけに保存され、AIに質問したときは、その質問・レッスンメモ・スイングの画像がAnthropicに送られます。</p>
    <label class="field"><span>APIキー</span><input type="password" id="stKey" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(Settings.get('apiKey') || '')}"></label>
    <div class="field"><span>モデル</span><div class="seg" id="stModel">${Coach.MODELS.map(([id, jp]) => `<button data-v="${id}">${esc(jp.replace(/（.*）/, ''))}</button>`).join('')}</div><p class="note">${Coach.MODELS.map(([, jp]) => esc(jp)).join('、')}</p></div>
    <div class="row"><button class="btn sm" id="stTest">接続テスト</button><span class="note" id="stTestOut" style="margin:0"></span></div>
    <div class="h3">保存データ</div>
    <p class="kv"><span class="num">${fmtMB(est?.usage)}</span> 使用中${est?.quota ? `（上限の目安 <span class="num">${fmtMB(est.quota)}</span>）` : ''}</p>
    <p class="note">${persisted ? '保存データは自動では消えない設定になっています。' : 'ホーム画面に追加して使うと、保存データが自動で消えにくくなります。'}動画・解析結果・レッスンメモはこのiPhoneの中だけに保存されます。骨格解析のAIもアプリと一緒に置いてあり、iPhoneの中で動きます。外部に接続するのは、APIキーを入れてAIの回答を使うときのAnthropicだけです。</p>
    <p class="note num">スイング帳 v${APP_VER}</p>`;
  bindSeg($('#stHanded', body), Settings.get('handed'), v => Settings.set('handed', v));
  bindSeg($('#stView', body), Settings.get('view'), v => Settings.set('view', v));
  bindSeg($('#stEngine', body), Settings.get('engine'), v => Settings.set('engine', v));
  bindSeg($('#stModel', body), Settings.get('model'), v => Settings.set('model', v));
  const auto = $('#stAuto', body);
  auto.onclick = () => { const v = auto.getAttribute('aria-checked') !== 'true'; auto.setAttribute('aria-checked', v); Settings.set('autoAnalyze', v); };
  const key = $('#stKey', body);
  key.addEventListener('change', () => { Settings.set('apiKey', key.value.trim()); });
  key.addEventListener('input', () => { Settings.set('apiKey', key.value.trim()); });
  $('#stTest', body).onclick = async () => {
    const out = $('#stTestOut', body);
    if (!Settings.get('apiKey')) { out.textContent = 'APIキーを入力してください'; return; }
    out.textContent = '確認中…';
    try { await Coach.claude({ system: '短く答えてください。', messages: [{ role: 'user', content: 'こんにちは' }], maxTokens: 20 }); out.textContent = 'つながりました'; }
    catch (e) { out.textContent = Coach.apiErrorText(e); }
  };
  openSheet('設定', body, { onClose: () => { if (S.view === 'vChat') renderChat(); } });
}

// ===== 画面遷移・起動 =====
window.addEventListener('popstate', async e => {
  const s = e.state?.screen || 'home';
  if (s !== 'compare' && C.isOpen) C.close();
  if (s === 'player' && P.isOpen) { show('player'); requestAnimationFrame(() => { P.view.resize(); P.syncUI(); }); return; }
  if (s !== 'player' && P.isOpen) await P.close();
  if (s === 'compare' && C.isOpen) { show('compare'); return; }
  show('home');
  await refreshLib();
  if (S.afterHome) { const f = S.afterHome; S.afterHome = null; f(); }
  else if (S.view === 'vPractice') renderPractice();
  else if (S.view === 'vChat') renderChat();
});
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  if ($('#player').classList.contains('active') && P.isOpen) {
    if (e.key === ' ') { e.preventDefault(); P.togglePlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); P.step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); P.step(1); }
  } else if ($('#compare').classList.contains('active') && C.isOpen) {
    if (e.key === ' ') { e.preventDefault(); C.playing ? C.pause() : C.play(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); C.step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); C.step(1); }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (P.isOpen) P.view.video.pause(); if (C.isOpen) C.pause(); P.flush(); }
});

async function main() {
  try { await DB.open(); }
  catch (e) {
    console.error(e);
    $('#empty').hidden = false;
    $('#empty').innerHTML = '<h2>データを保存できません</h2><p>プライベートブラウズでは使えません。通常のSafariで開くか、ホーム画面に追加して使ってください。</p>';
    return;
  }
  P.init(); C.init(); wireHome(); wirePractice(); wireChat();
  history.replaceState({ screen: 'home' }, '');
  S.notes = await DB.all('notes');
  await loadChat();
  await refreshLib();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW', err));
  }
}
main();
window.SwingNote = { P, C, S, DB, Pose, Coach, Settings, Chat };
