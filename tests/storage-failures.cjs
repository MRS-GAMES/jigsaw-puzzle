// Run with: node tests/storage-failures.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
function environment() {
  const alerts = [], nodes = new Map(), values = new Map(), records = new Map();
  const flags = { read: false, write: false, open: false, dbRead: false, dbWrite: false, abortRead: false };
  function element() {
    const classes = new Set(['hidden']), listeners = {}, selectors = {};
    return {
      children: [], textContent: '', disabled: false,
      set innerHTML(v) { this.children = []; this.html = v; }, get innerHTML() { return this.html || ''; },
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, force) { if (force === undefined) force = !classes.has(x); force ? classes.add(x) : classes.delete(x); } },
      appendChild(child) { this.children.push(child); },
      querySelector(s) { return selectors[s] ||= element(); },
      addEventListener(n, cb) { (listeners[n] ||= []).push(cb); },
      async click() { await Promise.all((listeners.click || []).map(cb => cb({ currentTarget: this, target: this, stopPropagation() {} }))); },
      getContext() { return new Proxy({}, { get: () => () => {} }); },
      toDataURL() { return 'data:image/jpeg;base64,TEST'; },
      getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
      style: { setProperty() {} }, remove() {},
    };
  }
  const node = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const localStorage = {
    getItem(k) { if (flags.read) throw Error('SecurityError'); return values.get(k) ?? null; },
    setItem(k, v) { if (flags.write) throw Error('QuotaExceededError'); values.set(k, v); },
    removeItem(k) { if (flags.write) throw Error('SecurityError'); values.delete(k); },
  };
  const indexedDB = { open() {
    const req = {};
    queueMicrotask(() => {
      if (flags.open) { req.error = Error('open failed'); req.onerror(); return; }
      req.result = { close() {}, transaction() {
        const tx = { error: null, abort() { tx.onabort?.(); }, objectStore() {
          function request(kind, value) {
            const r = {};
            queueMicrotask(() => {
              if (kind === 'getAll' ? flags.dbRead : flags.dbWrite) {
                r.error = tx.error = Error('transaction failed'); r.onerror(); tx.onabort(); return;
              }
              if (kind === 'getAll') r.result = [...records.values()].map(x => ({ ...x }));
              else if (kind === 'put') records.set(value.id, value);
              else records.delete(value);
              r.onsuccess();
              if (kind === 'getAll' && flags.abortRead) { tx.onabort(); return; }
              tx.oncomplete();
            });
            return r;
          }
          return { getAll: () => request('getAll'), put: v => request('put', v), delete: id => request('delete', id) };
        } };
        return tx;
      } };
      req.onsuccess();
    });
    return req;
  } };
  const context = vm.createContext({ console, Map, Math, Date, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    alert: x => alerts.push(x), localStorage, indexedDB,
    document: { hidden: false, getElementById: node, createElement: element, addEventListener() {} },
    Image: class { constructor() { this.width = this.height = 100; } set src(v) { queueMicrotask(() => this.onload?.()); } },
    FileReader: class { readAsDataURL() { queueMicrotask(() => this.onload({ target: { result: 'data:image/png;base64,test' } })); } },
    window: { indexedDB, addEventListener() {} },
  });
  function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
  ['best-times.js', 'timer.js', 'ui.js', 'settings.js', 'image-manager.js', 'puzzle.js'].forEach(load);
  let app;
  const puzzleFactory = context.window.JigsawModules.puzzle;
  context.window.JigsawModules.puzzle = a => { app = a; puzzleFactory(a); };
  return { flags, values, records, alerts, node, context, boot() { load('script.js'); return app; } };
}
(async () => {
  // Boot must complete even when both storage APIs are inaccessible.
  let e = environment(); e.flags.read = true; e.flags.open = true;
  let app = e.boot(); await flush();
  assert.equal(e.context.window.JigsawBooted, true);
  assert.equal(e.alerts.filter(x => x.includes('保存データを読み込めません')).length, 1);
  await e.node('btn-start').click();
  assert.equal(e.node('screen-level').classList.contains('hidden'), false);
  assert.equal(app.imageManager.getImagePool().length, 5);

  // A read failure must never overwrite an unread existing record.
  e.values.set('jigsaw_best_EASY', '15');
  assert.equal(app.bestTimes.trySaveBestTime('EASY', 10), null);
  assert.equal(e.values.get('jigsaw_best_EASY'), '15');
  e.flags.read = false; e.flags.write = true;
  assert.equal(app.bestTimes.trySaveBestTime('EASY', 10), null);
  assert.equal(e.values.get('jigsaw_best_EASY'), '15');
  app.state.isPaused = true; app.state.elapsedBeforePause = 10000;
  app.goToClear();
  assert.equal(e.node('clear-best-tag').textContent, '記録を保存できませんでした');
  assert.equal(app.settings.setBoolSetting(app.settings.keys.guidePicture, false), false);
  assert.equal(app.settings.getBoolSetting(app.settings.keys.guidePicture, true), false);
  assert.ok(e.alerts.some(x => x.includes('設定を保存できません')));
  const before = e.alerts.length;
  app.settings.setSampleEnabled(false);
  assert.equal(e.alerts.length, before + 1); // One notice for a multi-key setting.
  app.settings.setSampleEnabled(true);
  assert.equal(app.settings.isSampleVisible('sample1'), true);
  await e.node('btn-pause-title').click();
  assert.ok(e.alerts.at(-1).includes('中断データを保存できません'));
  e.flags.write = false;
  assert.equal(app.bestTimes.trySaveBestTime('EASY', 10), true);
  assert.equal(app.bestTimes.trySaveBestTime('EASY', 12), false);
  assert.equal(app.bestTimes.getBestTime('EASY'), 10);

  // Failure preserves the previously loaded image list and resume bytes.
  e = environment(); e.records.set('upload_old', { id: 'upload_old', src: 'data:image/jpeg;base64,old', name: 'old' });
  const resume = JSON.stringify({ version: 1, imageId: 'upload_old', level: 'EASY', pieces: [] });
  e.values.set('jigsaw_resume_v1', resume); app = e.boot(); await flush();
  assert.equal(app.imageManager.getUploadedCount(), 1);
  e.flags.dbRead = true;
  await assert.rejects(app.imageManager.loadUploadedImagesFromDB());
  assert.equal(app.imageManager.getUploadedCount(), 1);
  await e.node('btn-start').click();
  assert.equal(e.values.get('jigsaw_resume_v1'), resume);
  assert.equal(e.node('modal-resume').classList.contains('hidden'), true);
  e.flags.dbRead = false;
  await e.node('btn-start').click();
  assert.equal(e.node('modal-resume').classList.contains('hidden'), false);
  assert.equal(e.values.get('jigsaw_resume_v1'), resume);

  // Request success followed by transaction abort is still a failed read.
  e.flags.abortRead = true;
  await assert.rejects(app.imageManager.loadUploadedImagesFromDB());
  assert.equal(app.imageManager.getUploadedCount(), 1); e.flags.abortRead = false;

  // Failed deletion remains visible and persisted; retry can succeed.
  const deleteButton = () => e.node('uploaded-grid').children[0].querySelector('.thumb-delete');
  e.flags.dbWrite = true; await deleteButton().click();
  assert.equal(app.imageManager.getUploadedCount(), 1); assert.ok(e.records.has('upload_old'));
  assert.ok(e.alerts.at(-1).includes('画像を削除できません'));
  e.flags.dbWrite = false; await deleteButton().click();
  assert.equal(app.imageManager.getUploadedCount(), 0); assert.equal(e.records.has('upload_old'), false);

  // A failed upload must not become a playable session-only image.
  e.flags.dbWrite = true; await app.imageManager.handleFileSelected({ type: 'image/png' });
  assert.equal(app.imageManager.getUploadedCount(), 0); assert.equal(e.records.size, 0);
  assert.ok(e.alerts.at(-1).includes('画像を保存できません'));
  e.flags.dbWrite = false; await app.imageManager.handleFileSelected({ type: 'image/png' });
  assert.equal(app.imageManager.getUploadedCount(), 1); assert.equal(e.records.size, 1);

  // First-load failure must not interpret an unseen uploaded image as deleted.
  e = environment(); e.flags.dbRead = true;
  e.values.set('jigsaw_resume_v1', resume);
  e.records.set('upload_old', { id: 'upload_old', src: 'data:image/jpeg;base64,old', name: 'old' });
  app = e.boot(); await flush(); await e.node('btn-start').click();
  assert.equal(e.values.get('jigsaw_resume_v1'), resume);
  assert.equal(e.node('screen-title').classList.contains('hidden'), false);
  assert.equal(e.node('modal-resume').classList.contains('hidden'), true);
  e.flags.dbRead = false; await e.node('btn-start').click();
  assert.equal(e.node('modal-resume').classList.contains('hidden'), false);
  assert.equal(app.imageManager.getUploadedCount(), 1);

  // Rejected database opens are retried instead of memoized forever.
  e = environment(); e.flags.open = true; app = e.boot(); await flush();
  e.flags.open = false; await app.imageManager.loadUploadedImagesFromDB();
  assert.equal(app.imageManager.getUploadedCount(), 0);
  console.log('PASS: storage-blocked boot, protected resume + retry, transaction abort, upload/delete failures + retries, honest record result, session settings, manual save notification.');
})().catch(error => { console.error(error); process.exitCode = 1; });
