/**
 * service-worker.js - LuckyPick 离线缓存
 *
 * 缓存策略：cache-first（不联网也能打开）
 * - 预缓存：HTML/CSS/图标/脚本
 * - 运行时：所有 GET 请求加入
 */

const CACHE_NAME = 'lucky-pick-v1';
const PRECACHE_URLS = [
  './',
  'index.html',
  'css/styles.css',
  'js/engine.js',
  'js/app.js',
  'manifest.json',
  'icons/icon.svg',
  '../data/dlt.js',
  '../data/qxc.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // 缓存成功的 GET 响应
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // 离线 + 无缓存 → 返回主页（让 PWA 仍可用）
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
