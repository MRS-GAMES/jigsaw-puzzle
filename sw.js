"use strict";
// Change RELEASE with every HTML/CSS/JS/image release. Never activate over an open game.
const RELEASE = "pwa1";
const PREFIX = "mrs-jigsaw-shell-";
const CACHE = PREFIX + RELEASE;
const SCRIPTS = ["ui", "best-times", "timer", "settings", "image-manager", "puzzle", "script", "pwa"];
const FILES = ["./", "index.html", "manifest.webmanifest", "style.css?v=pwa1",
  ...SCRIPTS.map(name => name + ".js?v=pwa1"),
  ...[1,2,3,4,5].map(n => "assets/images/sample" + n + ".svg")];
const urls = FILES.map(path => new URL(path, self.registration.scope).href);
const indexURL = new URL("index.html", self.registration.scope).href;

const HASHES = {"": "d792dd23ca4cf68d9c468d4f1cc4de89c783051859f2da435b87420c445f2e8d", "index.html": "d792dd23ca4cf68d9c468d4f1cc4de89c783051859f2da435b87420c445f2e8d", "manifest.webmanifest": "eb2205e12cc33f852cd5427166c3b96a27182957f515024c273965d8e0dafddb", "style.css?v=pwa1": "575e49f9751fcb0891877d1ea6782244a6ec8e1adad99dd258758014c7951511", "ui.js?v=pwa1": "3f245abbf6a0c1ca53269a410f2941e22ab03d750999f2d8aed529770367f56d", "best-times.js?v=pwa1": "00b5f7101c5f313acc39e8d3d841c0b5d04a62a6f3a4e65a803d880b531a9780", "timer.js?v=pwa1": "c0e387212c650fc0cce54dbd69c0f90a9e01a2afee4477847bc35e80aaf2ec61", "settings.js?v=pwa1": "112cbc371f2d9c247ff38d1cb13337c5783061e88f69f836445e297f55f2fa28", "image-manager.js?v=pwa1": "ff996f07cc7f16ab8ca2d20139f53d6cec98ceb29d4e0cfa3b210e5e1e6cd534", "puzzle.js?v=pwa1": "4d0a0c3415cfd4065bdc83209d7662796e4938d829100babc214b9b314982fcb", "script.js?v=pwa1": "f9412e5f601e249ed1c61930bdb9f1ab9081c7c02628365b3a0f40789cb410fc", "pwa.js?v=pwa1": "7554f0939ffd125d0f83ed47a4df4e813e0b87b4e7908de80627817da8fb89b7", "assets/images/sample1.svg": "1bc86a5cbef8e85c13865f43294474ea10e9588f4f283f105fceead55fb00aaf", "assets/images/sample2.svg": "960f8e1ffcb12aa25d14b6d5910267e3932b81c75879ff5b6628e558a7a9c837", "assets/images/sample3.svg": "8427f624d20cb92174a0ea76d01eb0c9f06aa1b0d0e932f4e9bf105bc05efffa", "assets/images/sample4.svg": "6e606525d3da3395de5a5cbe87eb88a703a0eb4f4de7154e5a674e8e30437263", "assets/images/sample5.svg": "39ad45355fc69f561a1a478c48ab1058d37b01d5b241d12c7964ed085894e635"};
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
  event.waitUntil((async () => {
    const results = await Promise.all(urls.map(url => boundedFetch(url)));
    const cache = await caches.open(CACHE);
    // Fetch all assets before storing any; failed new releases never replace the active release.
    await Promise.all(urls.map((url, i) => cache.put(url, results[i])));
    const complete = await Promise.all(urls.map(url => cache.match(url)));
    if (complete.some(r => !r)) throw new Error("Incomplete offline preparation");
  })());
});
self.addEventListener("activate", event => {
  // No skipWaiting/clients.claim: an existing game keeps its release until closed.
  event.waitUntil((async () => {
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
