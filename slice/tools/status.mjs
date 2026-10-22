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
// score history drawn to scale: 1..10, pass line at 8
const chart = (scores) => {
  const W = 220, H = 56, pad = 14, n = Math.max(scores.length, 3), bw = Math.min(26, (W - pad * 2) / n - 6);
  const y = (v) => H - 6 - (v / 10) * (H - 14);
  const bars = scores.map((s, i) => {
    const x = pad + i * ((W - pad * 2) / n) + 3, h = H - 6 - y(s.score);
    const cls = s.score >= 8 ? 'ok' : s.score >= 6 ? 'mid' : 'lo';
    return `<rect class="b ${cls}" x="${x.toFixed(1)}" y="${y(s.score).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"/><text class="v" x="${(x + bw / 2).toFixed(1)}" y="${(y(s.score) - 3).toFixed(1)}">${s.score}</text><text class="r" x="${(x + bw / 2).toFixed(1)}" y="${H}">R${s.round}</text>`;
  }).join('');
  return `<svg class="hist" viewBox="0 0 ${W} ${H + 2}" role="img" aria-label="Critic scores by round"><line class="pass" x1="${pad}" x2="${W - pad}" y1="${y(8).toFixed(1)}" y2="${y(8).toFixed(1)}"/><text class="pl" x="${W - pad}" y="${(y(8) - 3).toFixed(1)}">pass 8</text>${bars}</svg>`;
};
const cards = STREAMS.map(([id]) => {
  const st = S.streams[id], [label, cls] = STATE[st.state] || [st.state, 'q'];
  const img = thumb(st.shot);
  const issues = (st.issues || []).slice(0, 6).map((i) => {
    const sev = typeof i === 'string' ? '' : (i.severity || '');
    const text = typeof i === 'string' ? i : i.text || JSON.stringify(i);
    return `<li class="${esc(sev)}">${sev ? `<span class="sev">${esc(sev)}</span>` : ''}<span>${esc(text)}</span></li>`;
  }).join('');
  return `<article class="card">
    <header><h2>${esc(st.name)}</h2><span class="chip ${cls}">${label}</span></header>
    <p class="scope">${esc(st.scope)}</p>
    ${st.scores.length ? chart(st.scores) : '<p class="muted">No critic rounds yet</p>'}
    ${img ? `<img src="${img}" alt="${esc(st.name)}: latest critic screenshot" loading="lazy">` : '<div class="noimg">No screenshot yet</div>'}
    ${st.note ? `<p class="note">${esc(st.note)}</p>` : ''}
    <h3>Open issues${st.issues.length ? ` <span class="count">${st.issues.length}</span>` : ''}</h3>
    ${issues ? `<ul class="issues">${issues}</ul>` : '<p class="muted">None recorded</p>'}
    <footer>${st.commit ? `Commit <code>${esc(st.commit)}</code> · ` : ''}${st.updated ? `Updated ${esc(st.updated.replace('T', ' ').slice(0, 16))} UTC` : ''}</footer>
  </article>`;
}).join('\n');
const passed = Object.values(S.streams).filter((s) => s.state === 'passed').length;
const flagged = Object.values(S.streams).filter((s) => s.state === 'flagged').length;
const active = Object.values(S.streams).filter((s) => s.state === 'building' || s.state === 'critique').length;
const fragment = `<title>Iron Wall Gauntlet</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: a C2 status board — summary strip, six stream cards, event log. Dark-first (night console), light mirrored. */
:root {
  --bg: #070b10; --panel: #0d141b; --line: rgba(160,200,216,.16); --ink: #e2eaee; --dim: #93a5ae; --faint: #667882;
  --accent: #63d6ff; --pass: #7fe0a0; --warn: #ffb547; --fail: #ff6b5a;
  --f-display: "Saira Condensed", "Arial Narrow", sans-serif; --f-body: "IBM Plex Sans", "Segoe UI", Roboto, sans-serif; --f-data: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --bg: #eef2f5; --panel: #ffffff; --line: rgba(20,40,60,.14); --ink: #13202a; --dim: #4b5c67; --faint: #74848e; --accent: #0a7fb0; --pass: #1f8a4c; --warn: #a86400; --fail: #c4321f; color-scheme: light; } }
:root[data-theme="light"] { --bg: #eef2f5; --panel: #ffffff; --line: rgba(20,40,60,.14); --ink: #13202a; --dim: #4b5c67; --faint: #74848e; --accent: #0a7fb0; --pass: #1f8a4c; --warn: #a86400; --fail: #c4321f; color-scheme: light; }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 15px/1.55 var(--f-body); }
main { max-width: 1280px; margin: 0 auto; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 22px; }
.kick { font: 600 11px/1 var(--f-data); letter-spacing: .18em; text-transform: uppercase; color: var(--warn); }
h1 { font: 800 clamp(34px, 5vw, 56px)/1 var(--f-display); letter-spacing: .02em; margin: 8px 0 6px; text-wrap: balance; }
.lead { margin: 0; color: var(--dim); max-width: 70ch; }
.sum { display: flex; flex-wrap: wrap; gap: 10px; }
.sum div { background: var(--panel); border: 1px solid var(--line); padding: 10px 14px; min-width: 150px; flex: 1 1 150px; }
.sum b { display: block; font: 600 24px/1.2 var(--f-data); font-variant-numeric: tabular-nums; }
.sum span { font-size: 12.5px; color: var(--dim); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 16px; }
.card { background: var(--panel); border: 1px solid var(--line); padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.card header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.card h2 { font: 800 22px/1.1 var(--f-display); letter-spacing: .03em; margin: 0; }
.card h3 { font: 600 11px/1 var(--f-data); margin: 6px 0 0; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); display: flex; gap: 8px; align-items: center; }
.count { color: var(--ink); border: 1px solid var(--line); padding: 2px 6px; }
.scope { margin: 0; color: var(--dim); font-size: 13.5px; }
.chip { font: 600 11px/1 var(--f-data); padding: 6px 8px; border: 1px solid var(--line); white-space: nowrap; color: var(--dim); }
.chip.p { color: var(--pass); border-color: var(--pass); } .chip.f { color: var(--fail); border-color: var(--fail); } .chip.c { color: var(--warn); border-color: var(--warn); } .chip.b { color: var(--accent); border-color: var(--accent); }
.hist { width: 100%; max-width: 320px; height: auto; }
.hist .pass { stroke: var(--pass); stroke-dasharray: 3 3; stroke-width: 1; opacity: .7; }
.hist .pl, .hist .r, .hist .v { font: 9px var(--f-data); fill: var(--faint); text-anchor: middle; }
.hist .pl { text-anchor: end; fill: var(--pass); }
.hist .v { fill: var(--ink); font-size: 10px; }
.hist .b.ok { fill: var(--pass); } .hist .b.mid { fill: var(--warn); } .hist .b.lo { fill: var(--fail); }
.card img { width: 100%; max-width: 100%; aspect-ratio: 16/9; object-fit: cover; border: 1px solid var(--line); background: #000; }
.noimg { aspect-ratio: 16/9; max-width: 100%; display: grid; place-items: center; border: 1px dashed var(--line); color: var(--faint); font-size: 13px; }
.note { margin: 0; font-size: 13.5px; }
.issues { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 13.5px; }
.issues li { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: baseline; border-left: 2px solid var(--line); padding-left: 8px; }
.issues li.blocker { border-left-color: var(--fail); } .issues li.major { border-left-color: var(--warn); } .issues li.minor { border-left-color: var(--faint); }
.sev { font: 600 10px/1 var(--f-data); letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
.issues li.blocker .sev { color: var(--fail); } .issues li.major .sev { color: var(--warn); }
.muted { color: var(--faint); font-size: 13px; margin: 0; }
footer { margin-top: auto; font: 12px var(--f-data); color: var(--faint); }
code { font-family: var(--f-data); }
.log { background: var(--panel); border: 1px solid var(--line); padding: 14px 16px; }
.log h3 { font: 600 11px/1 var(--f-data); letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin: 0 0 10px; }
.log ul { margin: 0; padding: 0; display: grid; gap: 6px; }
.log li { list-style: none; display: grid; grid-template-columns: 132px 1fr; gap: 10px; font-size: 13.5px; }
.log li span { min-width: 0; }
.log time { font: 12px var(--f-data); color: var(--faint); font-variant-numeric: tabular-nums; }
@media (max-width: 520px) { .log li { grid-template-columns: 1fr; gap: 0; } }
</style>
<main>
<header>
<div class="kick">Tzeva Adom · mission 6 · live status</div>
<h1>Iron Wall gauntlet</h1>
<p class="lead">Six builder streams, each judged by a fresh-context critic rendering the running game against the 2020-era 3D RTS bar. A stream passes at 8/10, or is flagged after three rounds without improvement. Updated ${esc(S.updated.replace('T', ' ').slice(0, 16))} UTC.</p>
</header>
<section class="sum" aria-label="Summary">
  <div><b>${passed}/6</b><span>Streams passed</span></div>
  <div><b>${active}</b><span>Building or in review</span></div>
  <div><b>${flagged}</b><span>Flagged</span></div>
  <div><b>${S.mission.playable ? 'Yes' : 'No'}</b><span>Mission playable start to finish</span></div>
  <div><b>${S.perf ? esc(S.perf.headline || '—') : '—'}</b><span>${S.perf ? esc(S.perf.label || 'Performance') : 'Performance budget'}</span></div>
</section>
<section class="grid" aria-label="Streams">${cards}</section>
<section class="log" aria-label="Log"><h3>Log</h3><ul>${S.log.slice(0, 40).map((l) => `<li><time>${esc(l.when.replace('T', ' ').slice(0, 16))}</time><span>${esc(l.text)}</span></li>`).join('')}</ul></section>
</main>`;
fs.writeFileSync(path.join(SLICE, 'status.html'), `<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${fragment}\n</html>\n`);
if (a.artifact) fs.writeFileSync(path.resolve(a.artifact), fragment);
console.log('status.html updated' + (a.artifact ? ` (+ artifact fragment ${a.artifact})` : ''));
