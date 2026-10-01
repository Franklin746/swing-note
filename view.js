// 動画＋オーバーレイ（骨格・ガイド線）の表示部品と、タイムライン
import { $, clamp, DPR, waitMeta, seekTo } from './util.js';
import { BONES, JOINTS, FR, PoseTrack, makeCtx } from './pose.js';

const FLAG = '#F4C542', SKY = '#6EC8F0', RED = '#FF5A47';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
export function pill(ctx, text, x, y, color) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = '600 15px "Barlow Condensed", "Hiragino Sans", sans-serif';
  const w = ctx.measureText(text).width + 12, h = 21;
  rr(ctx, x - w / 2, y - h / 2, w, h, 6);
  ctx.fillStyle = 'rgba(6,14,10,.8)';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}
export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function distLine(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  return Math.abs((px - ax) * dy - (py - ay) * dx) / L;
}

export class SwingView {
  constructor(stage, show = {}) {
    this.stage = stage;
    this.video = stage.querySelector('video');
    this.canvas = stage.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.swing = null; this.pose = null; this.mc = null; this.url = null;
    this.mirror = false; this.editing = false; this.loupe = null; this.tempLm = null; this.pendingSeek = null;
    this.onRender = null; this.cw = 0; this.ch = 0;
    this.show = Object.assign({ pose: true, angles: true, trail: true, head: false, drawings: true }, show);
    this.lmBuf = new Float32Array(FR);
    new ResizeObserver(() => { this.resize(); this.render(); }).observe(stage);
    const v = this.video;
    v.addEventListener('loadeddata', () => this.render());
    v.addEventListener('seeked', () => {
      if (this.pendingSeek != null) { const t = this.pendingSeek; this.pendingSeek = null; v.currentTime = t; return; }
      this.render();
    });
  }
  get vw() { return this.video.videoWidth || this.swing?.width || 1; }
  get vh() { return this.video.videoHeight || this.swing?.height || 1; }
  get duration() { const d = this.video.duration; return isFinite(d) ? d : (this.swing?.duration || 0); }

  async load(swing, blob, poseRec) {
    this.swing = swing;
    this.mirror = false; this.tempLm = null; this.loupe = null; this.pendingSeek = null;
    this.applyMirror();
    this.setPose(poseRec);
    await this.setSource(blob);
    this.resize();
    this.render();
  }
  setPose(rec) { this.pose = rec ? new PoseTrack(rec) : null; this.refreshCtx(); }
  refreshCtx() { this.mc = this.swing ? makeCtx(this.swing, this.pose) : null; }
  async setSource(blob) {
    const v = this.video;
    const attempt = async b => {
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(b);
      v.src = this.url;
      v.load();
      await waitMeta(v);
    };
    try { await attempt(blob); }
    catch (e) {
      console.warn('video load failed, retry with in-memory copy', e);
      const copy = new Blob([await blob.arrayBuffer()], { type: blob.type || 'video/mp4' });
      await attempt(copy);
    }
    if (v.readyState < 2) { try { await v.play(); v.pause(); } catch { /* iOS: ignore */ } }
  }
  unload() {
    const v = this.video;
    v.pause();
    v.removeAttribute('src');
    try { v.load(); } catch { /* ignore */ }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null; this.swing = null; this.pose = null; this.mc = null;
    this.render();
  }
  rect() {
    const W = this.cw, H = this.ch, vw = this.vw, vh = this.vh;
    const s = Math.min(W / vw, H / vh) || 1;
    const w = vw * s, h = vh * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h, s };
  }
  resize() {
    const r = this.stage.getBoundingClientRect();
    this.cw = r.width; this.ch = r.height;
    const d = DPR();
    const W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
  }
  applyMirror() { this.video.style.transform = this.mirror ? 'scaleX(-1)' : ''; }
  toPx(nx, ny) { const r = this.rect(); return [r.x + (this.mirror ? 1 - nx : nx) * r.w, r.y + ny * r.h]; }
  toNorm(x, y) { const r = this.rect(); let nx = (x - r.x) / r.w; if (this.mirror) nx = 1 - nx; return [nx, (y - r.y) / r.h]; }
  seek(t) {
    const v = this.video;
    t = clamp(t, 0, Math.max(0, this.duration - 0.001));
    if (v.seeking) { this.pendingSeek = t; return; }
    v.currentTime = t;
  }
  seekWait(t) { return seekTo(this.video, t); }

  render(t) {
    const v = this.video;
    if (t == null) t = v.currentTime;
    const ctx = this.ctx, d = DPR();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.swing || !v.videoWidth) { this.onRender?.(t, null); return; }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const r = this.rect();
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const lm = this.tempLm || (this.pose ? this.pose.at(t, this.lmBuf) : null);
    if (this.pose && this.show.trail) this.drawTrail(t);
    if (this.pose && this.show.head) this.drawHead(lm);
    if (lm && this.show.pose) this.drawSkeleton(lm);
    if (this.show.drawings) { this.drawBall(); this.drawShapes(); }
    ctx.restore();
    if (this.loupe) this.drawLoupe();
    this.onRender?.(t, lm);
  }

  line(x1, y1, x2, y2, color, w) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = w + 2.5; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }

  drawSkeleton(lm) {
    const ctx = this.ctx, r = this.rect();
    const lw = clamp(r.h / 240, 2, 4.5);
    const vis = i => lm[i * 6 + 2];
    const P = i => this.toPx(lm[i * 6], lm[i * 6 + 1]);
    const lead = this.swing.handed === 'L' ? [12, 14, 16, 20] : [11, 13, 15, 19];
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      if (vis(a) < 0.35 || vis(b) < 0.35) continue;
      const [x1, y1] = P(a), [x2, y2] = P(b);
      this.line(x1, y1, x2, y2, lead.includes(a) && lead.includes(b) ? FLAG : SKY, lw);
    }
    if ([11, 12, 23, 24].every(i => vis(i) >= 0.35)) {
      const a = P(11), b = P(12), c = P(23), e = P(24);
      ctx.save(); ctx.setLineDash([5, 5]);
      this.line((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (c[0] + e[0]) / 2, (c[1] + e[1]) / 2, 'rgba(255,255,255,.85)', lw * 0.7);
      ctx.restore();
    }
    for (const i of JOINTS) {
      if (vis(i) < 0.35) continue;
      const [x, y] = P(i);
      ctx.beginPath(); ctx.arc(x, y, lw * 0.9 + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
    }
  }

  drawTrail(t) {
    const p = this.pose, d = p.data, ctx = this.ctx, m = this.swing.markers || {};
    const start = m.address != null ? m.address - 0.02 : -Infinity;
    const end = m.finish != null ? m.finish + 0.02 : Infinity;
    const path = upto => {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < p.n; i++) {
        const ti = p.times[i];
        if (ti < start) continue;
        if (ti > upto || ti > end) break;
        const o = i * FR;
        if (Number.isNaN(d[o]) || d[o + 92] < 0.3 || d[o + 98] < 0.3) { pen = false; continue; }
        const [x, y] = this.toPx((d[o + 90] + d[o + 96]) / 2, (d[o + 91] + d[o + 97]) / 2);
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path(Infinity); ctx.strokeStyle = 'rgba(244,197,66,.3)'; ctx.lineWidth = 2; ctx.stroke();
    path(t); ctx.strokeStyle = FLAG; ctx.lineWidth = 3; ctx.stroke();
  }

  drawHead(lm) {
    const c = this.mc;
    if (!c?.ref || !c.unit || c.ref[2] < 0.35) return;
    const ctx = this.ctx, r = this.rect();
    const [hx, hy] = this.toPx(c.ref[0], c.ref[1]);
    const rad = clamp(c.unit * r.s * 0.45, 8, 220);
    ctx.save();
    ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(hx, hy, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(hx - 6, hy); ctx.lineTo(hx + 6, hy); ctx.moveTo(hx, hy - 6); ctx.lineTo(hx, hy + 6); ctx.stroke();
    if (lm && lm[2] >= 0.35) {
      const [x, y] = this.toPx(lm[0], lm[1]);
      ctx.strokeStyle = RED; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
    }
    ctx.restore();
  }

  drawBall() {
    const b = this.swing.ball;
    if (!b?.pos) return;
    const ctx = this.ctx;
    const [x, y] = this.toPx(b.pos[0], b.pos[1]);
    ctx.save();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    if (b.auto?.ok && b.auto.pts?.length) {
      ctx.fillStyle = RED;
      for (const [nx, ny] of b.auto.pts) { const [px, py] = this.toPx(nx, ny); ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill(); }
      const [ex, ey] = this.toPx(b.auto.end[0], b.auto.end[1]);
      ctx.setLineDash([7, 6]); ctx.strokeStyle = RED; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
  }

  drawShapes() {
    const shapes = this.swing.drawings || [];
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    for (const sh of shapes) {
      const pts = sh.p.map(([nx, ny]) => this.toPx(nx, ny));
      const [a, b] = pts;
      if (sh.t === 'line') {
        this.line(a[0], a[1], b[0], b[1], sh.c, 2.5);
        const ang = Math.round(Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])) * 180 / Math.PI);
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 40) pill(ctx, `${ang}°`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 16, sh.c);
      } else if (sh.t === 'xline') {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, K = 5000;
        this.line(a[0] - ux * K, a[1] - uy * K, a[0] + ux * K, a[1] + uy * K, sh.c, 2.5);
        const ang = Math.round(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
        if (L > 40) pill(ctx, `${ang}°`, b[0] + 22, b[1] - 18, sh.c);
      } else if (sh.t === 'circle') {
        const rad = Math.hypot(b[0] - a[0], b[1] - a[1]);
        ctx.beginPath(); ctx.arc(a[0], a[1], rad, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = sh.c; ctx.lineWidth = 2.5; ctx.stroke();
      } else if (sh.t === 'angle') {
        const c = pts[2];
        this.line(a[0], a[1], b[0], b[1], sh.c, 2.5);
        this.line(a[0], a[1], c[0], c[1], sh.c, 2.5);
        const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - a[1], c[0] - a[0]);
        let diff = a2 - a1;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ctx.beginPath(); ctx.arc(a[0], a[1], 22, a1, a1 + diff, diff < 0);
        ctx.strokeStyle = sh.c; ctx.lineWidth = 2; ctx.stroke();
        const mid = a1 + diff / 2;
        pill(ctx, `${Math.round(Math.abs(diff) * 180 / Math.PI)}°`, a[0] + Math.cos(mid) * 44, a[1] + Math.sin(mid) * 44, sh.c);
      }
    }
    if (this.editing) {
      for (const sh of shapes) {
        for (const [nx, ny] of sh.p) {
          const [x, y] = this.toPx(nx, ny);
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
          ctx.lineWidth = 2.5; ctx.strokeStyle = sh.c; ctx.stroke();
        }
      }
    }
  }

  // 指でなぞっている位置の拡大鏡
  drawLoupe() {
    const { x, y } = this.loupe, ctx = this.ctx, v = this.video, r = this.rect();
    const R = 54, Z = 2.2;
    let cx = clamp(x, R + 4, this.cw - R - 4), cy = y - 100;
    if (cy - R < 4) cy = y + 100;
    const [nx, ny] = this.toNorm(x, y);
    const vw = v.videoWidth, vh = v.videoHeight;
    const half = R / (r.s * Z);
    let sx = nx * vw - half, sy = ny * vh - half, sw = half * 2, sh = half * 2;
    let dx = cx - R, dy = cy - R, dw = 2 * R, dh = 2 * R;
    const k = dw / sw;
    if (sx < 0) { dx += -sx * k; dw -= -sx * k; sw += sx; sx = 0; }
    if (sy < 0) { dy += -sy * k; dh -= -sy * k; sh += sy; sy = 0; }
    if (sx + sw > vw) { const c = sx + sw - vw; dw -= c * k; sw -= c; }
    if (sy + sh > vh) { const c = sy + sh - vh; dh -= c * k; sh -= c; }
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill(); ctx.clip();
    if (this.mirror) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    if (sw > 1 && sh > 1) { try { ctx.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh); } catch { /* ignore */ } }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = this.loupe.c || FLAG;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// シークバー（マーカー旗つき）
export class Timeline {
  constructor(el, onScrub) {
    this.el = el; this.min = 0; this.max = 1; this.val = 0; this.last = 0;
    el.classList.add('tl');
    el.innerHTML = '<div class="tl-marks"></div><div class="tl-track"><div class="tl-fill"></div></div><div class="tl-thumb"></div>';
    this.fill = $('.tl-fill', el); this.thumb = $('.tl-thumb', el); this.marksEl = $('.tl-marks', el);
    let active = false;
    const valAt = e => {
      const r = el.getBoundingClientRect();
      const f = clamp((e.clientX - r.left - 10) / (r.width - 20), 0, 1);
      return this.min + f * (this.max - this.min);
    };
    el.addEventListener('pointerdown', e => {
      active = true; el.setPointerCapture(e.pointerId);
      this.last = valAt(e); this.setValue(this.last); onScrub(this.last, 'start');
    });
    el.addEventListener('pointermove', e => {
      if (!active) return;
      this.last = valAt(e); this.setValue(this.last); onScrub(this.last, 'move');
    });
    const end = () => { if (!active) return; active = false; onScrub(this.last, 'end'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  frac(v) { return this.max > this.min ? clamp((v - this.min) / (this.max - this.min), 0, 1) : 0; }
  setRange(min, max) { this.min = min; this.max = Math.max(max, min + 0.001); this.setValue(this.val); }
  setValue(v) {
    this.val = v;
    const f = this.frac(v);
    this.fill.style.width = (f * 100).toFixed(2) + '%';
    this.thumb.style.left = `calc(10px + (100% - 20px) * ${f.toFixed(4)})`;
  }
  setMarks(list) {
    this.marksEl.innerHTML = list.map(m =>
      `<span class="tl-mark" style="left:calc(10px + (100% - 20px) * ${this.frac(m.v).toFixed(4)});--c:${m.c}">${m.s}</span>`).join('');
  }
}
