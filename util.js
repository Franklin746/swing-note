// 共通ユーティリティ
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const DPR = () => Math.min(window.devicePixelRatio || 1, 3);
export const deg = r => r * 180 / Math.PI;
export const isNum = v => typeof v === 'number' && Number.isFinite(v);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function todayISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const fmtDate = iso => (iso ? iso.replaceAll('-', '/') : '');
export function fmtMB(b) {
  if (!b) return '0 MB';
  const mb = b / 1048576;
  if (mb < 1) return '1 MB未満';
  return mb < 1024 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`;
}

// ---- video helpers ----
export function once(el, ev, ms) {
  return new Promise((res, rej) => {
    let tm = 0;
    const ok = e => { cleanup(); res(e); };
    const bad = () => { cleanup(); rej(el.error || new Error(ev + ' failed')); };
    const cleanup = () => { clearTimeout(tm); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
    el.addEventListener(ev, ok);
    el.addEventListener('error', bad);
    if (ms) tm = setTimeout(() => { cleanup(); rej(new Error('timeout:' + ev)); }, ms);
  });
}
export function waitMeta(v, ms = 20000) {
  if (v.readyState >= 1 && isFinite(v.duration)) return Promise.resolve();
  return once(v, 'loadedmetadata', ms);
}
// 指定時刻へシークし、そのコマが描画可能になるまで待つ
export function seekTo(v, t) {
  return new Promise(res => {
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', onS); res(); };
    const onS = () => {
      if (typeof v.requestVideoFrameCallback === 'function') {
        v.requestVideoFrameCallback(() => fin());
        setTimeout(fin, 160);
      } else setTimeout(fin, 40);
    };
    v.addEventListener('seeked', onS);
    const d = isFinite(v.duration) ? v.duration : t;
    v.currentTime = clamp(t, 0, Math.max(0, d - 0.001));
    setTimeout(fin, 4000);
  });
}
export function frameToCanvas(v, maxSide, canvas) {
  const s = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
  const c = canvas || document.createElement('canvas');
  const w = Math.max(1, Math.round(v.videoWidth * s)), h = Math.max(1, Math.round(v.videoHeight * s));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  c.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0, w, h);
  return c;
}

// ---- IndexedDB ----
export const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('swingnote', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('swings', { keyPath: 'id' });
        d.createObjectStore('videos');
        d.createObjectStore('poses');
        d.createObjectStore('notes', { keyPath: 'id' });
        d.createObjectStore('chat', { keyPath: 'id' });
        d.createObjectStore('kv');
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('blocked'));
    });
  },
  _req(store, fn, mode = 'readonly') {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      let out;
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('abort'));
    });
  },
  get(store, key) { return this._req(store, s => s.get(key)); },
  all(store) { return this._req(store, s => s.getAll()); },
  put(store, val, key) { return this._req(store, s => (key === undefined ? s.put(val) : s.put(val, key)), 'readwrite'); },
  del(store, key) { return this._req(store, s => s.delete(key), 'readwrite'); },
  clear(store) { return this._req(store, s => s.clear(), 'readwrite'); },
};

// ---- settings (localStorage) ----
const SKEY = 'swingnote.settings';
export const Settings = {
  data: (() => {
    const def = {
      handed: 'R', view: 'dtl', engine: 'auto', autoAnalyze: true,
      show: { pose: true, angles: true, trail: true, head: false, drawings: true },
      apiKey: '', model: 'claude-sonnet-5-5', lastClub: '7I',
    };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch { return def; }
  })(),
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; try { localStorage.setItem(SKEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
};

// ---- toast / busy / sheet ----
let toastTm = 0;
export function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTm);
  toastTm = setTimeout(() => t.classList.remove('show'), ms);
}

export const Busy = {
  cancelFn: null,
  show(text, opts = {}) {
    $('#busyText').textContent = text;
    $('#busyBarWrap').hidden = opts.progress == null;
    this.set(opts.progress || 0);
    this.cancelFn = opts.cancel || null;
    $('#busyCancel').hidden = !this.cancelFn;
    $('#busy').classList.toggle('dim', !opts.see);
    $('#busy').hidden = false;
  },
  update(text, p) {
    if (text != null) $('#busyText').textContent = text;
    if (p != null) { $('#busyBarWrap').hidden = false; this.set(p); }
  },
  set(p) { $('#busyBar').style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%'; },
  hide() { $('#busy').hidden = true; this.cancelFn = null; },
};

let sheetClose = null;
export function openSheet(title, body, opts = {}) {
  if (sheetClose) sheetClose(true);
  const back = $('#sheetBack');
  $('#sheetTitle').textContent = title;
  const holder = $('#sheetBody');
  holder.innerHTML = '';
  if (typeof body === 'string') holder.innerHTML = body; else holder.appendChild(body);
  back.hidden = false;
  requestAnimationFrame(() => back.classList.add('open'));
  const close = (silent) => {
    if (sheetClose !== close) return;
    sheetClose = null;
    back.classList.remove('open');
    back.hidden = true;
    holder.innerHTML = '';
    if (!silent) opts.onClose?.();
  };
  sheetClose = close;
  $('#sheetClose').onclick = () => close();
  back.onclick = e => { if (e.target === back && !opts.modal) close(); };
  return { close, el: holder };
}

// 押し続けると連続実行するボタン（コマ送り用）
export function holdRepeat(btn, fn) {
  let t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  btn.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    fn();
    t1 = setTimeout(() => { t2 = setInterval(fn, 70); }, 380);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('click', e => { if (e.detail === 0) fn(); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
}

// セグメントボタン（data-v）の選択状態を設定し、押されたら onPick(v)
export function bindSeg(seg, value, onPick) {
  const mark = v => $$('button[data-v]', seg).forEach(b => {
    const on = b.dataset.v === String(v);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  mark(value);
  seg.onclick = e => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.disabled) return;
    mark(b.dataset.v);
    onPick(b.dataset.v);
  };
  return mark;
}

// 簡易Markdown（AIの回答表示用）
export function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [];
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const flushP = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const flushL = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flushP(); flushL(); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); html += `<h4>${inline(m[2])}</h4>`; continue; }
    if ((m = l.match(/^\s*[-*・]\s+(.*)$/))) { flushP(); if (list !== 'ul') { flushL(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)．]\s*(.*)$/))) { flushP(); if (list !== 'ol') { flushL(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
    flushL();
    para.push(l);
  }
  flushP(); flushL();
  return html;
}
