// オフラインでも開けるようにするためのキャッシュ（外部のサーバーには接続しない）
const VERSION = 'swingnote-v1.1.0';
const ASSETS = 'swingnote-assets-v1';
// アプリ本体（小さいファイル）：最初に保存しておく
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './app.js', './util.js', './pose.js', './view.js', './coach.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './barlow-condensed-latin-500-normal.woff2', './barlow-condensed-latin-600-normal.woff2', './barlow-condensed-latin-700-normal.woff2',
];
// AIの部品とモデル（大きいファイル）：初めて使ったときに保存し、以後はiPhoneの中のものを使う
const BIG = /\/(mediapipe_vision\.js|vision_wasm_[a-z_]+\.(js|wasm)|pose_landmarker_full\.task)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('swingnote-') && k !== VERSION && k !== ASSETS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BIG.test(url.pathname)) {
    e.respondWith(
      caches.open(ASSETS).then(async c => {
        const hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  // アプリ本体：ネット優先（更新がすぐ届く）、オフライン時は保存分
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))),
  );
});
