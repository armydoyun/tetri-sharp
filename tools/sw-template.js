// Tetri# 서비스 워커 — tools/build.mjs가 VERSION을 채워 deploy-pages/sw.js로 만든다. 직접 고치지 않는다.
// 한 번 열면 인터넷 없이도 열리게 파일 네 개를 저장해 둔다.
// 페이지(내비게이션)는 네트워크를 먼저 보고(새 버전을 바로 받게), 안 되면 저장본을 쓴다.
const VERSION = "__VERSION__";
const CACHE = `tetrisharp-${VERSION}`;
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k.startsWith("tetrisharp-") && k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit ?? fetch(request)));
});
