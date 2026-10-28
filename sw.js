"use strict";
// Change RELEASE with every HTML/CSS/JS/image release. Never activate over an open game.
const RELEASE = "pwa7";
const PREFIX = "mrs-jigsaw-shell-";
const CACHE = PREFIX + RELEASE;
const FIRST_INSTALL = new URL("__first_install__", self.registration.scope).href;
const SCRIPTS = ["ui", "best-times", "timer", "settings", "image-manager", "puzzle", "script", "pwa"];
const FILES = ["assets/icons/icon-180.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "./", "index.html", "manifest.webmanifest", "style.css?v=pwa7",
  ...SCRIPTS.map(name => name + ".js?v=pwa7"),
  ...[1,2,3,4,5].map(n => "assets/images/sample" + n + ".svg")];
const urls = FILES.map(path => new URL(path, self.registration.scope).href);
const indexURL = new URL("index.html", self.registration.scope).href;

const HASHES = {"": "aedeef990ac97f7f7dc448703908ad4f4e3e1829c1efd4178a73ab9db1560786", "index.html": "aedeef990ac97f7f7dc448703908ad4f4e3e1829c1efd4178a73ab9db1560786", "manifest.webmanifest": "337c2ec4389a68969564c8fccf50409c2d10a79aa1fcf49e1d8f8b68b9cb5f66", "style.css?v=pwa7": "575e49f9751fcb0891877d1ea6782244a6ec8e1adad99dd258758014c7951511", "ui.js?v=pwa7": "3f245abbf6a0c1ca53269a410f2941e22ab03d750999f2d8aed529770367f56d", "best-times.js?v=pwa7": "00b5f7101c5f313acc39e8d3d841c0b5d04a62a6f3a4e65a803d880b531a9780", "timer.js?v=pwa7": "3216a4370f9f65f33a983c848a42786d7965578c98f56439b3193d201c52a926", "settings.js?v=pwa7": "112cbc371f2d9c247ff38d1cb13337c5783061e88f69f836445e297f55f2fa28", "image-manager.js?v=pwa7": "ff996f07cc7f16ab8ca2d20139f53d6cec98ceb29d4e0cfa3b210e5e1e6cd534", "puzzle.js?v=pwa7": "3bb770cb75798ecf93001949d58d5cc8a2c670d593783e2582531d43f0e71be5", "script.js?v=pwa7": "d7c0d922e2d63a20ca34283bb92de1de7e6df09e17b312f50906c2797f2983c5", "pwa.js?v=pwa7": "60a67ac452b32f3d2c335bfe87b69c0c8eb3bd9559b164e78e58199c04e7e9cc", "assets/images/sample1.svg": "1bc86a5cbef8e85c13865f43294474ea10e9588f4f283f105fceead55fb00aaf", "assets/images/sample2.svg": "960f8e1ffcb12aa25d14b6d5910267e3932b81c75879ff5b6628e558a7a9c837", "assets/images/sample3.svg": "8427f624d20cb92174a0ea76d01eb0c9f06aa1b0d0e932f4e9bf105bc05efffa", "assets/images/sample4.svg": "6e606525d3da3395de5a5cbe87eb88a703a0eb4f4de7154e5a674e8e30437263", "assets/images/sample5.svg": "39ad45355fc69f561a1a478c48ab1058d37b01d5b241d12c7964ed085894e635", "assets/icons/icon-180.png": "d259b717597dba30ad1e8145d5c6cf4238a7d1fe4ba977d7183b92cff49a78ed", "assets/icons/icon-192.png": "522385bf4ea79c09a5929eb8479617b676866b1db8e8df1a1d7c317ef97fed0c", "assets/icons/icon-512.png": "5e1928987fe64e6f345112296554e2957299da48f1fc82973c4b648c0567a0d8"};
async function boundedFetch(url) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(url, { cache: "reload", signal: abort.signal });
    if (!response.ok || response.type === "opaque") throw new Error("Asset unavailable");
    // Read the full body while the timeout is still active.
    const bytes = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
    if (hash !== HASHES[new URL(url).pathname.slice(new URL(self.registration.scope).pathname.length) + new URL(url).search]) throw new Error("Release mismatch");
    return new Response(bytes, { status: response.status, headers: response.headers });
  } finally { clearTimeout(timer); }
}
self.addEventListener("install", event => {
  const firstInstall = !self.registration.active;
  event.waitUntil((async () => {
    const results = await Promise.all(urls.map(url => boundedFetch(url)));
    const cache = await caches.open(CACHE);
    // Fetch all assets before storing any; failed new releases never replace the active release.
    await Promise.all(urls.map((url, i) => cache.put(url, results[i])));
    const complete = await Promise.all(urls.map(url => cache.match(url)));
    if (complete.some(r => !r)) throw new Error("Incomplete offline preparation");
    // Persist the initial-install flag across worker suspension before activation.
    await cache.put(FIRST_INSTALL, new Response(firstInstall ? "yes" : "no"));
  })());
});
self.addEventListener("activate", event => {
  // No skipWaiting: updates still wait for existing games to close.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const firstInstall = await cache.match(FIRST_INSTALL);
    if (firstInstall && await firstInstall.text() === "yes") {
      await self.clients.claim();
    }
    await cache.delete(FIRST_INSTALL);
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
  })());
});
self.addEventListener("message", event => {
  if (!["CHECK_READY","REPAIR"].includes(event.data?.type) || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      if(event.data.type === "REPAIR") {
        const missing = [];
        for(const url of urls) if(!(await cache.match(url))) missing.push(url);
        const fetched = await Promise.all(missing.map(url=>boundedFetch(url)));
        await Promise.all(missing.map((url,i)=>cache.put(url,fetched[i])));
      }
      const complete = (await Promise.all(urls.map(url => cache.match(url)))).every(Boolean);
      event.ports[0].postMessage({ready:complete, release:RELEASE});
    } catch {
      event.ports[0].postMessage({ready:false,release:RELEASE});
    }
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const base = new URL(self.registration.scope);
  const isEntry = request.mode === "navigate" &&
    (url.pathname === base.pathname || url.pathname === new URL(indexURL).pathname);
  const isAsset = urls.includes(url.href);
  if (!isEntry && !isAsset) return; // Never cache ads, analytics or user images.
  event.respondWith((async () => {
    const response = await caches.match(isEntry ? indexURL : url.href, {cacheName:CACHE});
    if (response) return response;
    // Avoid mixing release files when a cache entry is missing.
    return new Response("オフラインデータが不足しています。オンラインで画面を閉じて開き直し、準備を再試行してください。", {
      status:503, headers:{"Content-Type":"text/plain; charset=utf-8"}
    });
  })());
});
