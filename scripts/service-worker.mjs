import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const assets = await readdir("dist/assets");
const html = await readFile("dist/index.html", "utf8");
const version = createHash("sha256")
  .update(html)
  .digest("hex")
  .slice(0, 12);

const files = [
  "./",
  "./index.html",
  ...assets.map((file) => "./assets/" + file),
];

await writeFile(
  "dist/sw.js",
  `
const CACHE = "sgo-shell-${version}";
const FILES = ${JSON.stringify(files)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("sgo-shell-") && key !== CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  ) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    // App-shell files are static, same-origin assets. A server's Vary: Origin
    // must not make the precached response unusable for crossorigin module loads.
    caches.open(CACHE)
      .then((cache) => cache.match(event.request, { ignoreVary: true }))
      .then((cached) => cached || fetch(event.request))
  );
});
`
);
