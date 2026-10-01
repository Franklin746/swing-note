// 骨格推定（MediaPipe Pose Landmarker）と角度計算
import { clamp, deg, sleep, seekTo, frameToCanvas, Settings } from './util.js';

export const NL = 33, ST = 6, FR = NL * ST; // 1点あたり [x, y, visibility, wx, wy, wz]
export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 19], [16, 20], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
export const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// AIの部品とモデルはすべてアプリと同じ場所に置いてある（外部のサーバーには接続しない）
export const MP_VER = '1.0.1';
const HERE = new URL('.', import.meta.url).href.replace(/\/$/, '');
export const MP_BASE = HERE;
export const MODEL_URL = `${HERE}/pose_landmarker_full.task`;

export const MARKS = [
  { k: 'address', jp: 'アドレス', s: 'A', c: '#A9BDB1' },
  { k: 'top', jp: 'トップ', s: 'T', c: '#6EC8F0' },
  { k: 'impact', jp: 'インパクト', s: 'I', c: '#FF5A47' },
  { k: 'finish', jp: 'フィニッシュ', s: 'F', c: '#F4C542' },
];

export const leadJP = sw => (sw?.handed === 'L' ? '右' : '左');
export const trailJP = sw => (sw?.handed === 'L' ? '左' : '右');
// [リード側, トレール側] のランドマーク番号
export function sides(sw) {
  const L = { sh: 11, el: 13, wr: 15, idx: 19, hip: 23, kn: 25, an: 27, ear: 7 };
  const R = { sh: 12, el: 14, wr: 16, idx: 20, hip: 24, kn: 26, an: 28, ear: 8 };
  return sw?.handed === 'L' ? { lead: R, trail: L } : { lead: L, trail: R };
}

const wrapDeg = d => ((d + 540) % 360) - 180;
function ang3(a, b, c) {
  const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const nu = Math.hypot(u[0], u[1], u[2]), nv = Math.hypot(v[0], v[1], v[2]);
  if (!nu || !nv) return null;
  return deg(Math.acos(clamp((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv), -1, 1)));
}

export class PoseTrack {
  constructor(rec) {
    this.times = rec.times;
    this.data = rec.data;
    this.n = this.times.length;
    this.step = this.n > 1 ? (this.times[this.n - 1] - this.times[0]) / (this.n - 1) : 1 / 30;
    this.tol = this.step * 1.6;
    this.buf = new Float32Array(FR);
  }
  valid(i) { return i >= 0 && i < this.n && !Number.isNaN(this.data[i * FR]); }
  frame(i) { return this.data.subarray(i * FR, i * FR + FR); }
  get t0() { return this.times[0]; }
  get t1() { return this.times[this.n - 1]; }
  idx(t) { // times[i] <= t となる最大の i（範囲外は -1）
    if (!this.n || t < this.times[0]) return -1;
    let lo = 0, hi = this.n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.times[m] <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  at(t, out = this.buf) {
    if (!this.n) return null;
    const i = this.idx(t);
    if (i < 0) return (this.times[0] - t <= this.tol && this.valid(0)) ? (out.set(this.frame(0)), out) : null;
    if (i >= this.n - 1) return (t - this.times[this.n - 1] <= this.tol && this.valid(this.n - 1)) ? (out.set(this.frame(this.n - 1)), out) : null;
    const a = i, b = i + 1, va = this.valid(a), vb = this.valid(b);
    const ta = this.times[a], tb = this.times[b];
    if (va && vb) {
      const f = (t - ta) / (tb - ta || 1), A = a * FR, B = b * FR, d = this.data;
      for (let k = 0; k < FR; k++) out[k] = d[A + k] + (d[B + k] - d[A + k]) * f;
      return out;
    }
    if (va && t - ta <= this.tol) { out.set(this.frame(a)); return out; }
    if (vb && tb - t <= this.tol) { out.set(this.frame(b)); return out; }
    return null;
  }
  firstValidTime() { for (let i = 0; i < this.n; i++) if (this.valid(i)) return this.times[i]; return null; }
}

// 1コマ分の角度・位置の計測。c は makeCtx() の結果
export function frameMetrics(lm, c) {
  const { vw, vh, s, ref } = c;
  const vis = i => lm[i * 6 + 2];
  const ok = (...ids) => ids.every(i => vis(i) >= 0.5);
  const P = (f, i) => [f[i * 6] * vw, f[i * 6 + 1] * vh];
  const W = (f, i) => [f[i * 6 + 3], f[i * 6 + 4], f[i * 6 + 5]];
  const o = {};
  if (ok(11, 12, 23, 24)) {
    const a = P(lm, 11), b = P(lm, 12), h1 = P(lm, 23), h2 = P(lm, 24);
    const sx = (a[0] + b[0]) / 2, sy = (a[1] + b[1]) / 2, hx = (h1[0] + h2[0]) / 2, hy = (h1[1] + h2[1]) / 2;
    o.spine = deg(Math.atan2(Math.abs(sx - hx), hy - sy));
    o.shoulderTilt = deg(Math.atan2(Math.abs(a[1] - b[1]), Math.abs(a[0] - b[0])));
  }
  const ld = s.lead, tr = s.trail;
  if (ok(ld.sh, ld.el, ld.wr)) o.leadElbow = ang3(W(lm, ld.sh), W(lm, ld.el), W(lm, ld.wr));
  if (ok(ld.el, ld.wr) && vis(ld.idx) >= 0.3) o.leadWrist = ang3(W(lm, ld.el), W(lm, ld.wr), W(lm, ld.idx));
  if (ok(tr.hip, tr.kn, tr.an)) o.trailKnee = ang3(W(lm, tr.hip), W(lm, tr.kn), W(lm, tr.an));
  if (ok(ld.hip, ld.kn, ld.an)) o.leadKnee = ang3(W(lm, ld.hip), W(lm, ld.kn), W(lm, ld.an));
  if (ok(ld.sh, tr.sh, ld.wr)) {
    const A = W(lm, ld.sh), B = W(lm, tr.sh), Wr = W(lm, ld.wr);
    const cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2, cz = (A[2] + B[2]) / 2;
    const swd = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    if (swd > 0.05) o.handDist = Math.hypot(Wr[0] - cx, Wr[1] - cy, Wr[2] - cz) / swd;
  }
  if (c.view === 'face' && ok(23, 24) && vis(ld.an) >= 0.4 && vis(tr.an) >= 0.4) {
    const la = P(lm, ld.an)[0], ta = P(lm, tr.an)[0], pm = (P(lm, 23)[0] + P(lm, 24)[0]) / 2;
    if (Math.abs(la - ta) > 4) o.weight = clamp((pm - ta) / (la - ta), -0.5, 1.5);
  }
  if (ref) {
    const rok = (...ids) => ids.every(i => ref[i * 6 + 2] >= 0.5);
    const yaw = (f, a, b) => { const A = W(f, a), B = W(f, b); return Math.atan2(B[2] - A[2], B[0] - A[0]); };
    if (ok(11, 12) && rok(11, 12)) o.chestTurnRaw = wrapDeg(deg(yaw(lm, 11, 12) - yaw(ref, 11, 12)));
    if (ok(23, 24) && rok(23, 24)) o.hipTurnRaw = wrapDeg(deg(yaw(lm, 23, 24) - yaw(ref, 23, 24)));
    if (c.turnSign) {
      if (o.chestTurnRaw != null) o.chestTurn = o.chestTurnRaw * c.turnSign;
      if (o.hipTurnRaw != null) o.hipTurn = o.hipTurnRaw * c.turnSign;
    }
    if (c.unit) {
      if (vis(0) >= 0.5) {
        const n = P(lm, 0), r0 = P(ref, 0);
        o.headDrop = (n[1] - r0[1]) / c.unit; // ＋＝下がる
        if (c.targetSign) o.headLat = (n[0] - r0[0]) * c.targetSign / c.unit; // ＋＝目標方向
      }
      if (ok(15, 16, 11, 12) && c.torso) {
        const a = P(lm, 11), b = P(lm, 12), w1 = P(lm, 15), w2 = P(lm, 16);
        o.handsHeight = (((a[1] + b[1]) / 2) - ((w1[1] + w2[1]) / 2)) / c.torso; // ＋＝肩より上
      }
    }
  }
  return o;
}

// 計測の基準（アドレス時の姿勢など）を作る
export function makeCtx(sw, track) {
  const vw = sw.width || 1, vh = sw.height || 1;
  const c = { sw, view: sw.view, vw, vh, s: sides(sw), ref: null, turnSign: null, targetSign: null, unit: null, torso: null };
  if (!track) return c;
  const m = sw.markers || {};
  const refT = m.address != null ? m.address : track.firstValidTime();
  const ref = refT != null ? track.at(refT, new Float32Array(FR)) : null;
  if (!ref) return c;
  c.ref = ref;
  const P = i => [ref[i * 6] * vw, ref[i * 6 + 1] * vh];
  const v = i => ref[i * 6 + 2];
  if (v(0) >= 0.5 && v(11) >= 0.5 && v(12) >= 0.5) {
    const n = P(0), a = P(11), b = P(12);
    c.unit = Math.max(8, Math.hypot(n[0] - (a[0] + b[0]) / 2, n[1] - (a[1] + b[1]) / 2));
  }
  if ([11, 12, 23, 24].every(i => v(i) >= 0.5)) {
    const a = P(11), b = P(12), h1 = P(23), h2 = P(24);
    c.torso = Math.max(8, Math.hypot((a[0] + b[0] - h1[0] - h2[0]) / 2, (a[1] + b[1] - h1[1] - h2[1]) / 2));
  }
  const ld = c.s.lead.an, tr = c.s.trail.an;
  if (sw.view === 'face' && v(ld) >= 0.4 && v(tr) >= 0.4) {
    const dx = P(ld)[0] - P(tr)[0];
    if (Math.abs(dx) > 4) c.targetSign = Math.sign(dx);
  }
  if (m.top != null) {
    const top = track.at(m.top, new Float32Array(FR));
    if (top) {
      const r = frameMetrics(top, c);
      const raw = r.chestTurnRaw != null ? r.chestTurnRaw : r.hipTurnRaw;
      if (raw != null && Math.abs(raw) > 8) c.turnSign = -Math.sign(raw);
    }
  }
  return c;
}

// 画面表示する角度の一覧
export const METRICS = [
  { k: 'spine', label: sw => (sw.view === 'face' ? '軸の傾き' : '前傾') },
  { k: 'leadElbow', label: sw => leadJP(sw) + 'ひじ' },
  { k: 'leadWrist', label: sw => leadJP(sw) + '手首' },
  { k: 'trailKnee', label: sw => trailJP(sw) + 'ひざ' },
  { k: 'leadKnee', label: sw => leadJP(sw) + 'ひざ' },
  { k: 'chestTurn', label: () => '胸の回転', signed: true },
  { k: 'hipTurn', label: () => '腰の回転', signed: true },
  { k: 'shoulderTilt', label: () => '肩の傾き', views: ['face'] },
  { k: 'weight', label: sw => leadJP(sw) + '足寄り', views: ['face'], pct: true },
];
export const metricsFor = sw => METRICS.filter(M => !M.views || M.views.includes(sw.view));
// 動画の上に常に出す角度（撮影方向ごと）
export const HUD_KEYS = {
  dtl: ['spine', 'leadElbow', 'leadWrist', 'trailKnee', 'chestTurn', 'hipTurn'],
  face: ['spine', 'leadElbow', 'leadKnee', 'chestTurn', 'hipTurn', 'weight'],
};
export function fmtMetric(M, v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (M.pct) return `${Math.round(clamp(v, 0, 1) * 100)}%`;
  const r = Math.round(v);
  return M.signed && r > 0 ? `+${r}°` : `${r}°`;
}

// ---- MediaPipe の読み込み ----
export const Pose = {
  mod: null, fileset: null, ts: 0,
  async load() {
    if (!this.mod) this.mod = await import('./mediapipe_vision.js');
    if (!this.fileset) this.fileset = await this.mod.FilesetResolver.forVisionTasks(MP_BASE);
  },
  make(delegate) {
    return this.mod.PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
  },
  async makeCPU() { const l = await this.make('CPU'); l.__cpu = true; return l; },
  async create() {
    await this.load();
    if (Settings.get('engine') !== 'cpu') {
      try { const l = await this.make('GPU'); l.__cpu = false; return l; } catch (e) { console.warn('GPU init failed', e); }
    }
    return this.makeCPU();
  },
  detect(l, src, stepSec) {
    this.ts += Math.max(1, Math.round(stepSec * 1000));
    return l.detectForVideo(src, this.ts);
  },
  close(l) { try { l?.close(); } catch { /* ignore */ } },
};

// 動画全体（またはアドレス〜フィニッシュ）をコマごとに解析
export async function analyzePose(video, sw, { onProgress, isCancelled, onFrame } = {}) {
  let lmk = await Pose.create();
  try {
    const dur = video.duration;
    const m = sw.markers || {};
    let t0 = 0, t1 = dur;
    if (m.address != null && m.finish != null && m.finish > m.address) {
      t0 = Math.max(0, m.address - 0.3); t1 = Math.min(dur, m.finish + 0.3);
    }
    const fps = sw.fpsOverride || sw.fps || 30;
    let step = 1 / fps;
    const MAXN = 600;
    if ((t1 - t0) / step > MAXN) step = (t1 - t0) / MAXN;
    const n = Math.max(2, Math.floor((t1 - t0) / step) + 1);
    const times = new Float32Array(n), data = new Float32Array(n * FR).fill(NaN);
    const work = document.createElement('canvas');
    let ok = 0;
    for (let i = 0; i < n; i++) {
      if (isCancelled?.()) return null;
      const t = Math.min(t0 + i * step, dur - 0.002);
      times[i] = t;
      await seekTo(video, t);
      frameToCanvas(video, 640, work);
      let res;
      try { res = Pose.detect(lmk, work, step); }
      catch (e) {
        if (lmk.__cpu) throw e;
        console.warn('GPU detect failed, switching to CPU', e);
        Pose.close(lmk);
        lmk = await Pose.makeCPU();
        res = Pose.detect(lmk, work, step);
      }
      const L = res?.landmarks?.[0], Wl = res?.worldLandmarks?.[0];
      if (L && Wl) {
        ok++;
        const o = i * FR;
        for (let k = 0; k < NL; k++) {
          const a = L[k], w = Wl[k];
          data[o + k * 6] = a.x; data[o + k * 6 + 1] = a.y; data[o + k * 6 + 2] = a.visibility ?? 1;
          data[o + k * 6 + 3] = w.x; data[o + k * 6 + 4] = w.y; data[o + k * 6 + 5] = w.z;
        }
      }
      onFrame?.(t, L && Wl ? data.subarray(i * FR, i * FR + FR) : null);
      onProgress?.(i + 1, n);
      if ((i & 3) === 3) await sleep(0);
    }
    return { v: 1, times, data, ok, n, model: 'full' };
  } finally {
    Pose.close(lmk);
  }
}

// 手の高さの変化から アドレス・トップ・インパクト・フィニッシュ を推定
export function autoMarkers(tr) {
  const n = tr.n;
  if (n < 8) return null;
  const ys = new Float64Array(n).fill(NaN);
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    if (!tr.valid(i)) continue;
    const f = tr.frame(i);
    if (f[15 * 6 + 2] >= 0.3 && f[16 * 6 + 2] >= 0.3) { ys[i] = (f[15 * 6 + 1] + f[16 * 6 + 1]) / 2; cnt++; }
  }
  if (cnt < Math.max(8, n * 0.5)) return null;
  // 欠損を線形補間
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(ys[i])) continue;
    if (last < 0) { for (let j = 0; j < i; j++) ys[j] = ys[i]; }
    else if (i - last > 1) { for (let j = last + 1; j < i; j++) ys[j] = ys[last] + (ys[i] - ys[last]) * (j - last) / (i - last); }
    last = i;
  }
  for (let j = last + 1; j < n; j++) ys[j] = ys[last];
  // 平滑化（5点メディアン → 3点平均）
  const med = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = [];
    for (let k = -2; k <= 2; k++) w.push(ys[clamp(i + k, 0, n - 1)]);
    w.sort((a, b) => a - b);
    med[i] = w[2];
  }
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i++) sm[i] = (med[clamp(i - 1, 0, n - 1)] + med[i] + med[clamp(i + 1, 0, n - 1)]) / 3;
  let lo = Infinity, hi = -Infinity;
  for (const v of sm) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const R = hi - lo;
  if (R < 0.08) return null;
  const head = [...sm.slice(0, Math.max(3, Math.round(n * 0.05)))].sort((a, b) => a - b);
  const s0 = head[head.length >> 1];
  const H = 0.3 * R;
  let state = 0, addr = 0, topI = -1, impI = -1, finI = -1, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = sm[i];
    if (state === 0) {
      if (y >= s0 - 0.04 * R) addr = i;
      if (y < s0 - H) { state = 1; minV = y; topI = i; }
    } else if (state === 1) {
      if (y < minV) { minV = y; topI = i; }
      if (y > minV + H) { state = 2; maxV = y; impI = i; }
    } else if (state === 2) {
      if (y > maxV) { maxV = y; impI = i; }
      if (y < maxV - H) { state = 3; minV = y; finI = i; }
    } else if (y < minV) { minV = y; finI = i; }
  }
  if (state < 2 || impI < 0 || topI <= addr) return null;
  if (finI < 0) finI = n - 1;
  const T = i => Math.round(tr.times[i] * 10000) / 10000;
  return { address: T(addr), top: T(topI), impact: T(impI), finish: T(finI) };
}
