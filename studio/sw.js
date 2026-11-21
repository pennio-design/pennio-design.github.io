/* pennio.studio service worker: makes the studio installable and lets it open offline.
   Pages: network first, so a new version shows as soon as you are online.
   Fonts, icons and the MP3 encoder: cache first, they rarely change.
   Anything on another site (forms, Kit, cloud saving) is never touched. */
const CACHE = "pennio-studio-v5";
const SHELL = [
  "/studio/", "/studio/guide/", "/studio/manifest.webmanifest",
  "/favicon.svg", "/apple-touch-icon.png",
  "/studio/icons/icon-192.png", "/studio/icons/icon-512.png",
  "/studio/mp3-worker.js", "/studio/tick-worker.js", "/studio/render-monitor.js", "/studio/credits.js",
  "/fonts/inter-300.woff2", "/fonts/inter-400.woff2", "/fonts/inter-500.woff2",
  "/fonts/inter-600.woff2", "/fonts/inter-700.woff2", "/fonts/inter-800.woff2"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("pennio-studio-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isPage = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isPage) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(url.pathname.replace(/index\.html$/, ""), cp)); } return r; })
      .catch(() => caches.match(url.pathname.replace(/index\.html$/, "")).then(r => r || caches.match("/studio/"))));
    return;
  }
  if (/^\/(fonts|studio\/icons|studio\/vendor)\//.test(url.pathname) || url.pathname==="/favicon.svg" || url.pathname==="/apple-touch-icon.png") {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
  }
});
