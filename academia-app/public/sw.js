// Service worker: o app abre mesmo sem internet. Rede primeiro, cache como reserva.
const CACHE = "academia-v1";
const ARQUIVOS = ["./", "index.html", "css/style.css", "js/app.js", "js/logic.js", "js/storage.js", "js/alarme.js",
  "js/util.js", "js/hoje.js", "js/esteira.js", "js/comida.js", "js/treino.js", "js/perfil.js", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
