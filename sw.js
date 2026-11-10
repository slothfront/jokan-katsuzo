// コツコツ勝つ常漢：ネットが無くても開けるようにする仕組み（サービスワーカー）
// - ページ本体：ネットがあれば最新を取りに行き、無い・遅いときは前回の控えを出す
// - 字（Google Fonts）：一度読めたものは控えておき、ネットが無くても同じ字で出す
// 練習の記録（localStorage）には触らない。
const CACHE = 'jokan-v1';
const PAGE = './';
const WAIT_MS = 3000; // ネットがこれ以上遅いときは控えを出す

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.add(new Request(PAGE, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function pageFromNetwork(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), WAIT_MS);
    fetch(req, { cache: 'no-cache' }).then((res) => {
      clearTimeout(timer);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(PAGE, copy));
      }
      resolve(res);
    }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ページ本体（ホーム画面・QRから開いたとき。?付きでも同じページ）
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(
      pageFromNetwork(req).catch(() =>
        caches.match(PAGE).then((hit) => hit || caches.match(req, { ignoreSearch: true }))
          .then((hit) => hit || new Response(
            '<meta charset="utf-8"><p style="font:16px sans-serif;padding:24px">一度ネットにつないで開いてください。</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
      )
    );
    return;
  }

  // 字（Google Fonts）：控えがあればそれ、無ければ取りに行って控える
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        }))
      )
    );
  }
});

// 毎日19時のお知らせ（GAS→Firebase→ここ）。届いたら通知を出し、押されたらアプリを開く
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) {}
  const n = p.notification || p.data || {};
  e.waitUntil(self.registration.showNotification(n.title || 'コツコツ勝つ常漢', {
    body: n.body || '今日の稽古はまだ。1分だけでも、今日の1日になる。',
    icon: 'icon-192.png',
    tag: 'jokan-daily',
    data: { url: n.url || './' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
      for (const w of ws) { if (new URL(w.url).pathname.startsWith(new URL('./', self.registration.scope).pathname) && 'focus' in w) return w.focus(); }
      return self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
    })
  );
});
