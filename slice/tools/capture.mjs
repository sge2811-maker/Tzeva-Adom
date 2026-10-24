// Deterministic frame capture of the running slice -> frames, MP4 and a contact sheet (PNG grid
// critics can read). Time is stepped by window.__slice.frame(1/fps), so output is smooth and
// identical run to run regardless of how slowly the headless renderer runs.
// Usage:
//   node tools/capture.mjs --clip C1-arrow --out status/clips/vfx-r1 [--w 960 --h 540]
//   node tools/capture.mjs --t 200 --len 30 --fps 30 --cam S6-salvo --camscript trailer --w 1920 --h 1080 --audio --out final
//   node tools/capture.mjs --intro [--len 27] [--fps 4] --out status/clips/camera-dev/intro   (intro flyover from
//     introT = 0 through the hand-off into gameplay; contact-sheet timestamps are intro seconds)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, withRenderLock, launch, args, openSlice, SLICE } from './lib.mjs';

const a = args();
const { SHOTS, CLIPS } = await import(path.join(SLICE, 'src/core/shots.js'));
const clip = a.clip ? CLIPS[a.clip] : null;
if (a.clip && !clip) throw new Error(`Unknown clip ${a.clip}. Known: ${Object.keys(CLIPS).join(', ')}`);
const t0 = a.intro ? +(a.from ?? 0) : +(a.t ?? clip?.t ?? 200), len = +(a.len ?? clip?.len ?? (a.intro ? 27 : 8)), fps = +(a.fps ?? clip?.fps ?? 12);
const camShot = a.cam || clip?.cam || null;
const w = +(a.w || 960), h = +(a.h || 540);
const out = path.resolve(a.out || path.join(SLICE, '.capture', a.clip || 'clip'));
const framesDir = path.join(out, 'frames');
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

await withRenderLock(async () => {
  const { srv, url } = await serve();
  const browser = await launch();
  const t1 = Date.now();
  try {
    const q = new URLSearchParams({ seed: a.seed || '1', q: a.q || 'high', ui: a.ui === '0' ? '0' : '1', capture: '1', nointro: '1', fps: String(fps) });
    const { page, logs } = await openSlice(browser, url, { w, h, query: q.toString() });
    if (a.intro) await page.evaluate((t0) => { const c = window.__slice.ctx; c.setFlow('intro'); c.introT = t0; }, t0);
    else await page.evaluate(({ t0, camShot, script }) => {
      const S = window.__slice;
      S.seek(t0, 6);
      if (camShot) { const mod = S.ctx.shots || null; }
      return true;
    }, { t0, camShot, script: a.camscript || null });
    if (camShot) await page.evaluate(async (name) => {
      const { SHOTS } = await import('/src/core/shots.js');
      const s = SHOTS[name]; window.__slice.ctx.shot = s; window.__slice.ctx.bus.emit('shot', { name, shot: s });
    }, camShot);
    if (a.camscript) await page.evaluate((n) => { const c = window.__slice.ctx.systems.camera; if (c && c.script) c.script(n); else console.warn('camera.script() not available'); }, a.camscript);
    const n = Math.round(len * fps);
    for (let i = 0; i < n; i++) {
      await page.evaluate((dt) => window.__slice.frame(dt), 1 / fps);
      await page.screenshot({ path: path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
      if (i % 30 === 0) console.error(`[capture] frame ${i}/${n} t=${(t0 + i / fps).toFixed(2)}`);
    }
    const info = await page.evaluate(() => window.__slice.info());
    const feelLog = await page.evaluate(() => { const c = window.__slice.ctx.systems.camera; return c && c.feelLog ? c.feelLog.slice() : null; });
    let audio = null;
    if (a.audio) {
      audio = await page.evaluate(async ({ t0, len }) => {
        const S = window.__slice;
        if (!S.audioOffline) return null;
        const wav = await S.audioOffline(t0, t0 + len);
        return wav; // base64 WAV
      }, { t0, len });
      if (audio) fs.writeFileSync(path.join(out, 'audio.wav'), Buffer.from(audio, 'base64'));
      else console.error('[capture] __slice.audioOffline() not available: video will be silent');
    }
    fs.writeFileSync(path.join(out, 'capture.json'), JSON.stringify({ t0, len, fps, w, h, camShot, camscript: a.camscript || null, frames: n, intro: !!a.intro, info, feelLog, consoleErrors: logs.slice(0, 30), seconds: (Date.now() - t1) / 1000 }, null, 2));
    await page.close();
  } finally { await browser.close(); srv.close(); }
}, { label: `capture ${a.clip || t0}` });

// encode
const mp4 = path.join(out, 'clip.mp4');
const ff = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(framesDir, 'f%05d.jpg')];
if (fs.existsSync(path.join(out, 'audio.wav')) && a.audio) ff.push('-i', path.join(out, 'audio.wav'), '-c:a', 'aac', '-b:a', '192k', '-shortest');
ff.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', a.crf || '18', '-preset', 'medium', '-movflags', '+faststart', mp4);
execFileSync('ffmpeg', ff, { stdio: 'inherit' });
// contact sheet: 12 evenly spaced frames, 4 x 3, with timestamps
execFileSync('python3', ['-I', '-c', `
import sys, os, glob
from PIL import Image, ImageDraw
frames = sorted(glob.glob(os.path.join(sys.argv[1], 'f*.jpg')))
t0, fps = float(sys.argv[3]), float(sys.argv[4])
k = 12; idx = [round(i * (len(frames) - 1) / (k - 1)) for i in range(k)]
ims = [Image.open(frames[i]).convert('RGB') for i in idx]
w, h = ims[0].size; s = 480 / w; tw, th = int(w * s), int(h * s)
sheet = Image.new('RGB', (tw * 4, th * 3), (0, 0, 0)); d = ImageDraw.Draw(sheet)
for n, (i, im) in enumerate(zip(idx, ims)):
    x, y = (n % 4) * tw, (n // 4) * th
    sheet.paste(im.resize((tw, th)), (x, y))
    d.rectangle([x, y, x + 70, y + 16], fill=(0, 0, 0)); d.text((x + 4, y + 2), 't=%.2f' % (t0 + i / fps), fill=(255, 210, 120))
sheet.save(sys.argv[2])
`, framesDir, path.join(out, 'contact.png'), String(t0), String(fps)], { stdio: 'inherit' });
console.log(`clip: ${mp4}\ncontact sheet: ${path.join(out, 'contact.png')}`);
