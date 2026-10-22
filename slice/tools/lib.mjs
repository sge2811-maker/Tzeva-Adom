// Shared helpers for the dev tools: static server, a cross-process render lock (only one headless
// Chromium renders at a time: the box has 2 CPUs and no GPU), and a browser launcher.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

export function serve(root = SLICE) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const LOCK = '/tmp/iron-wall-render.lock';
export async function withRenderLock(fn, { timeoutMs = 45 * 60 * 1000, label = 'render' } = {}) {
  const t0 = Date.now();
  let announced = false;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      fs.writeFileSync(path.join(LOCK, 'owner'), JSON.stringify({ pid: process.pid, label, since: new Date().toISOString() }));
      break;
    } catch (e) {
      let stale = false;
      try {
        const o = JSON.parse(fs.readFileSync(path.join(LOCK, 'owner'), 'utf8'));
        try { process.kill(o.pid, 0); } catch (_) { stale = true; }
        if (!announced) { console.error(`[lock] waiting for ${o.label} (pid ${o.pid}) since ${o.since}`); announced = true; }
      } catch (_) { stale = Date.now() - t0 > 5000; }
      if (stale) { fs.rmSync(LOCK, { recursive: true, force: true }); continue; }
      if (Date.now() - t0 > timeoutMs) throw new Error('render lock timeout');
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  const release = () => { try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch (_) { /* ignore */ } };
  process.once('exit', release);
  try { return await fn(); } finally { release(); }
}

export async function launch() {
  const { chromium } = await import('playwright');
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
}

export function args(argv = process.argv.slice(2)) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const nx = argv[i + 1]; if (nx == null || nx.startsWith('--')) o[k] = true; else { o[k] = nx; i++; } }
  }
  return o;
}

// open the slice and wait until it is ready; collects console errors
export async function openSlice(browser, url, { w = 1600, h = 900, query = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${url}/index.html?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__slice && window.__slice.ready, null, { timeout: 180000 });
  return { page, logs };
}
