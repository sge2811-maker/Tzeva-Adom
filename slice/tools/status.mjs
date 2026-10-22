// Live status page for the gauntlet run: slice/status.html (self-contained, thumbnails inlined).
// Data lives in slice/status/status.json. Update a stream and regenerate:
//   node tools/status.mjs --stream env --state critique --round 2 --score 7 --shot status/shots/env-r2/S6-salvo.jpg --issues status/env-r2-issues.json --note "..."
//   node tools/status.mjs --log "VFX builder started"
//   node tools/status.mjs            (just regenerate)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { args, SLICE } from './lib.mjs';

const a = args();
const file = path.join(SLICE, 'status/status.json');
const STREAMS = [
  ['env', 'Environment & lighting', 'Skyline, atmosphere, fog, tone mapping, bloom, SSAO, colour grade'],
  ['vfx', 'VFX', 'Launches, interceptor trails, intercepts, debris, smoke, screen shake'],
  ['audio', 'Audio', 'Siren timing, spatial audio, impacts, ambience (original/synthesized only)'],
  ['hud', 'HUD & UX', 'Alert countdown, objectives, shelter routing — cinematic and minimal'],
  ['camera', 'Camera & game feel', 'Intro flyover, input response, hit-stop, alert → shelter → aftermath pacing'],
  ['perf', 'Performance', '60 fps on a mid-range laptop in Chrome'],
];
let S = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
if (!S) {
  S = { title: 'Iron Wall — vertical slice gauntlet', started: new Date().toISOString(), mission: { playable: true, note: '' }, streams: {}, log: [] };
  for (const [id, name, scope] of STREAMS) S.streams[id] = { id, name, scope, state: 'queued', round: 0, scores: [], best: null, noImprove: 0, shot: null, issues: [], note: '', commit: null };
}
const now = new Date().toISOString();
if (a.stream) {
  const st = S.streams[a.stream]; if (!st) throw new Error('unknown stream ' + a.stream);
  if (a.state) st.state = a.state;
  if (a.round) st.round = +a.round;
  if (a.score != null && a.score !== true) {
    const score = +a.score;
    st.scores = st.scores.filter((s) => s.round !== +a.round);
    st.scores.push({ round: +(a.round || st.round), score, when: now });
    st.scores.sort((x, y) => x.round - y.round);
    if (st.best == null || score > st.best) { st.best = score; st.noImprove = 0; } else st.noImprove++;
  }
  if (a.shot) st.shot = a.shot;
  if (a.issues) st.issues = JSON.parse(fs.readFileSync(path.resolve(SLICE, a.issues), 'utf8'));
  if (a.note) st.note = a.note;
  if (a.commit) st.commit = a.commit;
  st.updated = now;
}
if (a.log) S.log.unshift({ when: now, text: a.log });
if (a.playable != null) S.mission.playable = a.playable === 'true' || a.playable === true;
if (a.missionNote) S.mission.note = a.missionNote;
if (a.perf) S.perf = JSON.parse(fs.readFileSync(path.resolve(SLICE, a.perf), 'utf8'));
S.updated = now;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(S, null, 2));

// thumbnails as data URIs
const thumb = (rel) => {
  if (!rel) return null;
  const src = path.resolve(SLICE, rel);
  if (!fs.existsSync(src)) return null;
  try {
    const b64 = execFileSync('python3', ['-I', '-c', `
import sys, io, base64
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); im.thumbnail((720, 405))
b = io.BytesIO(); im.save(b, 'JPEG', quality=72); print(base64.b64encode(b.getvalue()).decode())`, src], { maxBuffer: 1 << 26 }).toString().trim();
    return 'data:image/jpeg;base64,' + b64;
  } catch (e) { return null; }
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATE = { queued: ['Queued', 'q'], building: ['Building', 'b'], critique: ['Critic reviewing', 'c'], passed: ['Passed', 'p'], flagged: ['Flagged', 'f'] };
const cards = STREAMS.map(([id]) => {
  const st = S.streams[id], [label, cls] = STATE[st.state] || [st.state, 'q'];
  const img = thumb(st.shot);
  const hist = st.scores.map((s) => `<span class="sc ${s.score >= 8 ? 'ok' : s.score >= 6 ? 'mid' : 'lo'}" title="Round ${s.round}">R${s.round} <b>${s.score}</b></span>`).join('<i>→</i>') || '<span class="muted">No critic rounds yet</span>';
  return `<article class="card">
    <header><h2>${esc(st.name)}</h2><span class="chip ${cls}">${label}</span></header>
    <p class="scope">${esc(st.scope)}</p>
    <div class="hist">${hist}</div>
    ${img ? `<img src="${img}" alt="${esc(st.name)}: latest critic screenshot" loading="lazy">` : '<div class="noimg">No screenshot yet</div>'}
    ${st.note ? `<p class="note">${esc(st.note)}</p>` : ''}
    <h3>Open issues${st.issues.length ? ` <span class="muted">(${st.issues.length})</span>` : ''}</h3>
    ${st.issues.length ? `<ul>${st.issues.slice(0, 6).map((i) => `<li>${esc(typeof i === 'string' ? i : i.text || JSON.stringify(i))}</li>`).join('')}</ul>` : '<p class="muted">None recorded</p>'}
    <footer>${st.commit ? `Commit <code>${esc(st.commit)}</code> · ` : ''}${st.updated ? `Updated ${esc(st.updated.replace('T', ' ').slice(0, 16))} UTC` : ''}</footer>
  </article>`;
}).join('\n');
const passed = Object.values(S.streams).filter((s) => s.state === 'passed').length;
const flagged = Object.values(S.streams).filter((s) => s.state === 'flagged').length;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iron Wall Status</title>
<style>
:root { --bg:#070b10; --panel:#0d141b; --line:rgba(160,200,216,.16); --ink:#e2eaee; --dim:#93a5ae; --faint:#5e707a; --ok:#7fe0a0; --mid:#ffb547; --lo:#ff6b5a; --friend:#63d6ff; color-scheme: dark; }
:root[data-theme="light"] { --bg:#f3f5f7; --panel:#fff; --line:rgba(20,40,60,.14); --ink:#14202a; --dim:#4c5d68; --faint:#7d8c95; color-scheme: light; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
main { max-width: 1280px; margin: 0 auto; padding: 28px 16px 60px; }
.kick { font: 600 11px/1 ui-monospace,Menlo,Consolas,monospace; letter-spacing:.18em; text-transform:uppercase; color:var(--mid); }
h1 { font-size: clamp(28px,4vw,42px); margin:8px 0 4px; letter-spacing:.01em; }
.sum { display:flex; flex-wrap:wrap; gap:10px; margin:18px 0 26px; }
.sum div { background:var(--panel); border:1px solid var(--line); padding:10px 14px; min-width:150px; }
.sum b { display:block; font:600 22px/1.2 ui-monospace,Menlo,Consolas,monospace; }
.sum span { font-size:12.5px; color:var(--dim); }
.grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap:16px; }
.card { background:var(--panel); border:1px solid var(--line); padding:16px; display:flex; flex-direction:column; gap:10px; }
.card header { display:flex; justify-content:space-between; align-items:center; gap:10px; }
.card h2 { font-size:18px; margin:0; }
.card h3 { font-size:12px; margin:4px 0 0; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); }
.scope { margin:0; color:var(--dim); font-size:13.5px; }
.chip { font:600 11px/1 ui-monospace,Menlo,Consolas,monospace; padding:6px 8px; border:1px solid var(--line); white-space:nowrap; }
.chip.p { color:var(--ok); border-color:var(--ok); } .chip.f { color:var(--lo); border-color:var(--lo); } .chip.c { color:var(--mid); border-color:var(--mid); } .chip.b { color:var(--friend); border-color:var(--friend); }
.hist { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font:12.5px ui-monospace,Menlo,Consolas,monospace; }
.hist i { color:var(--faint); font-style:normal; }
.sc { padding:3px 7px; border:1px solid var(--line); } .sc b { font-size:14px; }
.sc.ok b { color:var(--ok); } .sc.mid b { color:var(--mid); } .sc.lo b { color:var(--lo); }
.card img { width:100%; aspect-ratio:16/9; object-fit:cover; border:1px solid var(--line); background:#000; }
.noimg { aspect-ratio:16/9; display:grid; place-items:center; border:1px dashed var(--line); color:var(--faint); font-size:13px; }
.note { margin:0; font-size:13.5px; }
ul { margin:0; padding-left:18px; font-size:13.5px; display:grid; gap:4px; }
.muted { color:var(--faint); font-size:13px; margin:0; }
footer { margin-top:auto; font-size:12px; color:var(--faint); }
code { font-family: ui-monospace,Menlo,Consolas,monospace; }
.log { margin-top:28px; background:var(--panel); border:1px solid var(--line); padding:14px 16px; }
.log li { list-style:none; display:grid; grid-template-columns: 130px 1fr; gap:10px; font-size:13.5px; }
.log ul { padding:0; }
.log time { font:12px ui-monospace,Menlo,Consolas,monospace; color:var(--faint); }
@media (max-width: 520px) { .log li { grid-template-columns: 1fr; gap:0; } }
</style></head>
<body><main>
<div class="kick">Tzeva Adom · mission 6 · live status</div>
<h1>${esc(S.title)}</h1>
<p class="muted">Updated ${esc(S.updated.replace('T', ' ').slice(0, 16))} UTC. A stream passes at 8/10 from a fresh-context critic judging the running game, or is flagged after 3 rounds without improvement.</p>
<section class="sum">
  <div><b>${passed}/6</b><span>Streams passed</span></div>
  <div><b>${flagged}</b><span>Flagged</span></div>
  <div><b>${S.mission.playable ? 'Yes' : 'No'}</b><span>Mission playable start to finish</span></div>
  <div><b>${S.perf ? esc(S.perf.headline || '—') : '—'}</b><span>${S.perf ? esc(S.perf.label || 'Performance') : 'Performance budget'}</span></div>
</section>
<section class="grid">${cards}</section>
<section class="log"><h3>Log</h3><ul>${S.log.slice(0, 40).map((l) => `<li><time>${esc(l.when.replace('T', ' ').slice(0, 16))}</time><span>${esc(l.text)}</span></li>`).join('')}</ul></section>
</main>
<script>try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}</script>
</body></html>`;
fs.writeFileSync(path.join(SLICE, 'status.html'), html);
console.log('status.html updated');
