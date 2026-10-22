// HUD & UX stream: start screen, intro cards, mission HUD (clock, budget, objectives, alert
// countdown, threat board, feed), world markers (pads, shelters, groups, Nevatim), shelter
// routing (select a group, then a shelter; open locked shelters), build popups, debrief.
import * as THREE from 'three';
import { fmtClock, fmtSecs } from '../core/util.js';
import { BAT } from '../sim/defense.js';
import { CIV } from '../sim/civilians.js';
import { GEO, groundAt } from '../world/geo.js';

export function create(ctx) {
  const { hudRoot: root, bus, sim, camera, clock, params, layout } = ctx;
  if (!params.ui) root.style.display = 'none';
  root.innerHTML = `
    <div class="iw-menu" data-r="menu" hidden>
      <div class="sheet">
        <div class="date">MISSION 6 · 13–14 APRIL 2024 · 23:00 IDT · NEGEV</div>
        <h1>IRON <em>WALL</em></h1>
        <p>Iran is about to launch its first direct attack on Israel: around 170 drones, 30 cruise missiles and more than 120 ballistic missiles, timed to arrive together. Most are aimed at Nevatim Air Base. You command the air defence over Arad and the base, and you get the town's people into shelters when the siren sounds.</p>
        <div><button class="iw-btn" data-r="go">Begin</button><button class="iw-btn ghost" data-r="goSkip">Skip intro</button></div>
        <div class="keys">DRAG pan · RIGHT-DRAG rotate · WHEEL zoom · WASD/QE move · SPACE pause · 1 2 3 speed · C cinematic camera</div>
      </div>
    </div>
    <div class="iw-letter off" data-r="letter"></div>
    <div class="iw-cards" data-r="cards"><div class="c1">13 APRIL 2024 · 23:00 · ARAD, NEGEV</div><div class="c2">IRON WALL</div><div class="c3">Iran launches its first direct attack on Israel.</div></div>
    <button class="iw-skip" data-r="skip" hidden>SKIP ▸</button>
    <div data-r="play" hidden>
      <canvas class="iw-route" data-r="route"></canvas>
      <div class="iw-markers" data-r="markers"></div>
      <div class="iw-top">
        <div class="iw-clock panel"><b data-r="clock">23:00</b><span data-r="phase">Drones inbound</span></div>
        <div class="iw-budget panel"><span class="kick">Budget</span><b data-r="budget">$300M</b></div>
      </div>
      <div class="iw-alert panel pulse" data-r="alert" hidden>
        <div><span class="he" lang="he" dir="rtl">צבע אדום</span></div>
        <div class="en" data-r="alertEn">RED ALERT · ARAD</div>
        <div class="count" data-r="alertCount">1:15</div>
        <div class="sub" data-r="alertSub">TO REACH A PROTECTED SPACE</div>
      </div>
      <section class="iw-obj panel" aria-label="Objectives"><div class="kick">Objectives</div><ul data-r="obj"></ul></section>
      <section class="iw-threats panel" aria-label="Threats">
        <div class="rate"><span class="kick">Intercepted</span><b data-r="rate">—</b></div>
        <div class="row"><i style="background:#ffb547"></i><span>Drones</span><b data-r="nDr">0</b></div>
        <div class="row"><i style="background:#ff8a3d"></i><span>Cruise missiles</span><b data-r="nCr">0</b></div>
        <div class="row"><i style="background:#ff4f3d"></i><span>Ballistic missiles</span><b data-r="nBa">0</b></div>
      </section>
      <nav class="iw-bar panel" aria-label="Commands">
        <button class="iw-card" data-r="doctrine"><b>Doctrine</b><small data-r="docTxt">Protect sites</small></button>
        <button class="iw-card" data-r="patrol"><b>Air patrol</b><small data-r="patrolTxt">Not ready</small></button>
        <span class="iw-sep"></span>
        <button class="iw-card" data-r="pause"><b data-r="pauseTxt">Pause</b><small>Space</small></button>
        <button class="iw-card" data-r="speed"><b data-r="speedTxt">1×</b><small>Speed · 1 2 3</small></button>
      </nav>
      <div class="iw-feed" data-r="feed"></div>
      <div class="iw-hint panel" data-r="hint" hidden></div>
      <div class="iw-toast panel" data-r="toast" hidden></div>
      <div class="iw-banner panel" data-r="banner" hidden><b></b><span></span></div>
      <div class="iw-menu-pop panel" data-r="pop" hidden></div>
    </div>
    <div class="iw-debrief" data-r="debrief" hidden><div class="sheet panel" data-r="debriefSheet"></div></div>`;
  const $ = (r) => root.querySelector(`[data-r="${r}"]`);

  // ---------------------------------------------------------------- flow
  $('go').onclick = () => ctx.begin({ intro: true });
  $('goSkip').onclick = () => ctx.begin({ intro: false });
  $('skip').onclick = () => ctx.startPlay();
  bus.on('flow', ({ to }) => {
    $('menu').hidden = to !== 'menu';
    $('play').hidden = to !== 'play';
    $('skip').hidden = to !== 'intro';
    $('letter').classList.toggle('off', to !== 'intro');
    if (to !== 'intro') $('cards').classList.remove('on');
  });

  // ---------------------------------------------------------------- world markers
  const markers = [];
  const mk = (cls, html, world, onClick) => {
    const el = document.createElement('div'); el.className = 'iw-mk ' + cls; el.innerHTML = `<div class="pin">${html}</div>`;
    if (onClick) el.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    $('markers').appendChild(el);
    const m = { el, world, on: null }; markers.push(m); return m;
  };
  const v = new THREE.Vector3();
  let selGroup = null;
  const padM = layout.pads.map((p) => {
    const m = mk('pad', '', new THREE.Vector3(p.x, groundAt(p.x, p.z) + 30, p.z), () => openPad(p, m));
    m.pad = p; return m;
  });
  const shM = sim.shelters.map((s) => {
    const m = mk('shelter', '', new THREE.Vector3(s.x, s.y + 9, s.z), () => clickShelter(s));
    m.s = s; return m;
  });
  const grM = sim.groups.map((g) => {
    const m = mk('group', '', new THREE.Vector3(g.x, groundAt(g.x, g.z) + 6, g.z), () => { selGroup = selGroup === g.id ? null : g.id; hint(); });
    m.g = g; return m;
  });
  const nevM = mk('asset', `NEVATIM AIR BASE · <span data-k="hp">100%</span><span class="hp"><i></i></span>`, new THREE.Vector3(GEO.nevatim.x, groundAt(GEO.nevatim.x, GEO.nevatim.z) + 80, GEO.nevatim.z));
  const aradM = mk('asset', 'ARAD', new THREE.Vector3(0, 60, -40));

  function clickShelter(s) {
    if (s.locked && s.opening <= 0) { sim.cmd('unlock', { shelter: s.id }); return; }
    if (selGroup) { const r = sim.cmd('route', { group: selGroup, shelter: s.id }); if (r && r.ok) toast(`${sim.groups.find((g) => g.id === selGroup).name} → ${s.name}`); selGroup = null; hint(); }
  }
  function openPad(p, m) {
    const pop = $('pop');
    if (p.battery) { pop.hidden = true; return; }
    pop.innerHTML = `<div class="kick">${p.name}</div>` + p.allow.map((t) => `<button class="iw-card" data-t="${t}" ${sim.budget < BAT[t].cost ? 'disabled' : ''}><b>${BAT[t].name}</b><small><span class="px">$${BAT[t].cost}M</span> · ${t === 'dome' ? 'drones, cruise' : 'cruise, ballistic'}</small></button>`).join('');
    pop.hidden = false; pop.dataset.pad = p.id;
    pop.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { sim.cmd('build', { pad: p.id, type: b.dataset.t }); pop.hidden = true; }));
  }
  ctx.canvas.addEventListener('pointerdown', () => { $('pop').hidden = true; });

  // ---------------------------------------------------------------- commands
  $('doctrine').onclick = () => sim.cmd('doctrine', { mode: sim.doctrine === 'protect' ? 'all' : 'protect' });
  $('patrol').onclick = () => sim.cmd('airPatrol', { x: 9500, z: -1200 });
  $('pause').onclick = () => { clock.paused = !clock.paused; };
  $('speed').onclick = () => { clock.speed = clock.speed === 1 ? 2 : clock.speed === 2 ? 4 : 1; };
  addEventListener('keydown', (e) => {
    if (ctx.flow !== 'play') return;
    if (e.key === ' ') { e.preventDefault(); clock.paused = !clock.paused; }
    else if (e.key === '1') clock.speed = 1; else if (e.key === '2') clock.speed = 2; else if (e.key === '3') clock.speed = 4;
    else if (e.key === 'Escape') { selGroup = null; $('pop').hidden = true; hint(); }
  });
  bus.on('cmd:rejected', ({ why }) => toast(why));

  // ---------------------------------------------------------------- feed, toasts, banners
  let toastT = 0, bannerT = 0;
  function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; toastT = 3.2; }
  function banner(a, b, kind) { const el = $('banner'); el.querySelector('b').textContent = a; el.querySelector('span').textContent = b; el.className = 'iw-banner panel ' + kind; el.hidden = false; bannerT = 4; }
  function hint() {
    const el = $('hint');
    if (selGroup) { el.textContent = 'Now click a shelter to send this group there.'; el.hidden = false; }
    else if (sim.phase === 'alert') { el.textContent = 'Click a group, then a shelter, to reroute. Click a locked shelter to open it.'; el.hidden = false; }
    else el.hidden = true;
  }
  bus.on('msg', (m) => {
    const f = $('feed'), d = document.createElement('div');
    d.className = 'ev panel ' + m.kind;
    d.innerHTML = `<time>${fmtClock(sim.clockMinutes())}</time><span></span>`; d.querySelector('span').textContent = m.text;
    f.appendChild(d); while (f.children.length > 4) f.removeChild(f.firstChild);
  });
  bus.on('salvo:end', (S) => banner(`SALVO ${S.id} · ${S.kill}/${S.n} DOWN`, S.nevatim || S.town ? `${S.nevatim + S.town} IMPACT${S.nevatim + S.town > 1 ? 'S' : ''} ON DEFENDED SITES` : 'NO IMPACTS ON DEFENDED SITES', S.nevatim || S.town ? 'bad' : 'good'));
  bus.on('phase', () => hint());
  bus.on('mission:end', (r) => showDebrief(r));

  // ---------------------------------------------------------------- route lines
  const rc = $('route'), rx = rc.getContext('2d');
  function sizeRoute() { rc.width = innerWidth * Math.min(2, devicePixelRatio || 1); rc.height = innerHeight * Math.min(2, devicePixelRatio || 1); }
  sizeRoute();
  const proj = (x, y, z) => { v.set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, ok: v.z < 1 }; };
  const STATUS_COL = { ok: '127,224,160', tight: '255,181,71', late: '255,79,61', blocked: '255,79,61', idle: '99,214,255', sheltered: '127,224,160' };
  function drawRoutes(info) {
    const s = rc.width / innerWidth;
    rx.setTransform(s, 0, 0, s, 0, 0); rx.clearRect(0, 0, innerWidth, innerHeight);
    if (sim.phase !== 'prep' && sim.phase !== 'alert') return;
    const A = sim.civ.A;
    for (const g of info) {
      if (g.status === 'sheltered') continue;
      if (sim.phase === 'prep' && g.id !== selGroup) continue;
      const grp = sim.groups.find((q) => q.id === g.id);
      // path of the first member still outside, or a straight planning line before the siren
      let pts = null;
      for (const i of grp.members) if (A.state[i] !== CIV.SHELTERED && A.path[i]) { pts = A.path[i].slice(A.pi[i] - 1); pts[0] = { x: A.x[i], z: A.z[i] }; break; }
      if (!pts) { const s = sim.shelters.find((q) => q.id === grp.shelter); pts = [{ x: g.x, z: g.z }, { x: s.door.x, z: s.door.z }]; }
      rx.strokeStyle = `rgba(${STATUS_COL[g.status] || '99,214,255'},${g.id === selGroup ? 0.95 : 0.6})`;
      rx.lineWidth = g.id === selGroup ? 3 : 2; rx.setLineDash([6, 6]); rx.lineDashOffset = -clock.realT * 30;
      rx.beginPath();
      let started = false;
      for (const p of pts) { const q = proj(p.x, groundAt(p.x, p.z) + 1.5, p.z); if (!q.ok) { started = false; continue; } if (!started) { rx.moveTo(q.x, q.y); started = true; } else rx.lineTo(q.x, q.y); }
      rx.stroke();
    }
    rx.setLineDash([]);
  }

  // ---------------------------------------------------------------- per-frame
  const objEls = new Map();
  let slow = 0;
  function updateMarkers(info) {
    const W = innerWidth, H = innerHeight;
    for (const m of markers) {
      v.copy(m.world).project(camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      if (on !== m.on) { m.el.style.display = on ? '' : 'none'; m.on = on; }
      if (on) m.el.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - v.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`;
    }
    if (!slow) return;
    for (const m of padM) {
      const b = m.pad.battery ? sim.batteries.find((q) => q.id === m.pad.battery) : null;
      m.el.classList.toggle('built', !!b);
      m.el.firstChild.textContent = b ? `${BAT[b.type].name.toUpperCase()} · ${b.reload > 0 ? 'RELOAD ' + Math.ceil(b.reload) + 's' : b.stock + '/' + b.T.stock}` : `+ ${m.pad.name.toUpperCase()}`;
    }
    for (const m of shM) {
      const s = sim.shelters.find((q) => q.id === m.s.id);
      m.el.classList.toggle('locked', s.locked);
      m.el.classList.toggle('target', !!selGroup);
      m.el.firstChild.textContent = s.locked ? (s.opening > 0 ? `OPENING ${Math.ceil(s.opening)}s` : `LOCKED · CLICK TO OPEN`) : `SHELTER · ${s.occ}/${s.cap}`;
    }
    for (const m of grM) {
      const g = info.find((q) => q.id === m.g.id);
      m.world.set(g.x, groundAt(g.x, g.z) + 6, g.z);
      m.el.className = `iw-mk group ${g.status}${g.id === selGroup ? ' sel' : ''}${g.status === 'sheltered' || g.status === 'out' ? ' done' : ''}`;
      const left = g.n - g.inside;
      m.el.firstChild.textContent = sim.phase === 'prep' ? `${g.n} · ${g.name.toUpperCase()}${g.status === 'late' || g.status === 'blocked' ? ' · ' + (g.status === 'blocked' ? 'SHELTER LOCKED' : 'TOO FAR') : ''}`
        : `${left} OUTSIDE · ${g.status === 'blocked' ? 'LOCKED OUT' : 'ETA ' + fmtSecs(g.eta)}`;
    }
    nevM.el.querySelector('[data-k="hp"]').textContent = Math.round(sim.nevatim) + '%';
    const bar = nevM.el.querySelector('.hp i'); bar.style.width = sim.nevatim + '%'; bar.style.background = sim.nevatim < 60 ? 'var(--threat)' : sim.nevatim < 80 ? 'var(--amber)' : 'var(--good)';
  }
  const PHASE_TXT = { prep: 'Drones inbound', alert: 'Red alert', barrage: 'Ballistic barrage', hold: 'Stay inside', aftermath: 'All clear', debrief: 'Mission over', intro: '' };
  function updatePanels() {
    $('clock').textContent = fmtClock(sim.clockMinutes()) + ' IDT';
    $('phase').textContent = PHASE_TXT[sim.phase] || '';
    $('budget').textContent = `$${Math.max(0, sim.budget).toFixed(sim.budget < 10 ? 1 : 0)}M`;
    const ul = $('obj');
    for (const o of sim.objectives) {
      let li = objEls.get(o.id);
      if (!li) { li = document.createElement('li'); li.innerHTML = '<i></i><span></span>'; ul.appendChild(li); objEls.set(o.id, li); }
      li.className = o.state; li.querySelector('span').innerHTML = `${o.text}<small>${o.detail || ''}</small>`;
    }
    const live = { drone: 0, cruise: 0, ballistic: 0 }; for (const th of sim.threats) if (th.alive) live[th.type]++;
    $('nDr').textContent = live.drone; $('nCr').textContent = live.cruise; $('nBa').textContent = live.ballistic;
    const k = sim.stats.killed, im = sim.stats.impacts, done = k.drone + k.cruise + k.ballistic, hit = im.nevatim + im.town + im.open;
    $('rate').textContent = done + hit ? `${Math.round(done / (done + hit) * 100)}%` : '—';
    $('docTxt').textContent = sim.doctrine === 'protect' ? 'Protect sites' : 'Engage all';
    const P = ctx.pacing.airPatrol;
    $('patrolTxt').textContent = sim.t < P.readyAt ? 'Not ready' : sim.patrolCd > 0 ? `${Math.ceil(sim.patrolCd)} s` : 'Ready';
    $('patrol').disabled = sim.t < P.readyAt || sim.patrolCd > 0;
    $('pauseTxt').textContent = clock.paused ? 'Resume' : 'Pause';
    $('speedTxt').textContent = clock.speed + '×';
    const al = $('alert');
    if (sim.phase === 'alert') { al.hidden = false; $('alertEn').textContent = 'RED ALERT · ARAD'; $('alertCount').textContent = fmtSecs(sim.countdownLeft()); $('alertSub').textContent = 'TO REACH A PROTECTED SPACE'; }
    else if (sim.phase === 'barrage') { al.hidden = false; $('alertEn').textContent = 'IMPACTS · ARAD'; $('alertCount').textContent = 'STAY INSIDE'; $('alertSub').textContent = 'INTERCEPTS AND FALLING DEBRIS'; }
    else if (sim.phase === 'hold') { al.hidden = false; $('alertEn').textContent = 'ALL-CLEAR IN'; $('alertCount').textContent = fmtSecs(sim.holdUntil - sim.t); $('alertSub').textContent = 'STAY IN THE PROTECTED SPACE'; }
    else al.hidden = true;
    al.classList.toggle('pulse', sim.phase === 'alert');
  }
  function showDebrief(r) {
    const s = r.stats, k = s.killed, L = s.launched;
    const tot = L.drone + L.cruise + L.ballistic, kills = k.drone + k.cruise + k.ballistic;
    const verdict = r.win ? 'IRON WALL HELD' : 'THE WALL CRACKED';
    $('debriefSheet').innerHTML = `
      <div class="kick">${r.win ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'} · ${fmtClock(sim.clockMinutes())} IDT</div>
      <div class="verdict" style="color:${r.win ? 'var(--good)' : 'var(--threat)'}">${verdict}</div>
      <ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">${sim.objectives.map((o) => `<li style="font-size:13px"><span style="color:${o.state === 'done' ? 'var(--good)' : 'var(--threat)'}">${o.state === 'done' ? '✓' : '✗'}</span> ${o.text} <span class="mono" style="color:var(--ink-faint)">${o.detail || ''}</span></li>`).join('')}</ul>
      <div class="stats">
        <div><b>${kills}/${tot}</b><span>Threats intercepted in the sector</span></div>
        <div><b>${Math.round(r.nevatim)}%</b><span>Nevatim Air Base</span></div>
        <div><b>${r.total - r.exposed}/${r.total}</b><span>People sheltered in time</span></div>
        <div><b>$${Math.round(s.spent)}M</b><span>Cost of the night</span></div>
        <div><b>${s.coalition + s.sm3}</b><span>Downed by allies before the sector</span></div>
        <div><b>${s.impacts.open}</b><span>Fell on open ground</span></div>
      </div>
      <p class="history"><b>In history:</b> Iran launched about 170 drones, more than 30 cruise missiles and over 120 ballistic missiles. Israel, the US, Britain, France and Jordan intercepted about 99% of them. A few ballistic missiles struck Nevatim, causing light damage, and the base kept operating. A seven-year-old girl in a Bedouin community near Arad was seriously wounded by shrapnel.</p>
      <button class="iw-btn" data-r="again">Play again</button>`;
    $('debrief').hidden = false;
    root.querySelector('[data-r="again"]').onclick = () => location.reload();
  }

  let acc = 0;
  return {
    resize() { sizeRoute(); },
    update(dt) {
      if (ctx.flow === 'intro') $('cards').classList.toggle('on', ctx.introT > 1.5 && ctx.introT < ctx.pacing.introLen - 4);
      if (ctx.flow !== 'play') return;
      acc += dt; slow = 0;
      if (acc > 0.1) { acc = 0; slow = 1; updatePanels(); }
      const info = slow || !this._info ? (this._info = sim.groupInfo()) : this._info;
      updateMarkers(info);
      drawRoutes(info);
      if (toastT > 0 && (toastT -= dt) <= 0) $('toast').hidden = true;
      if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').hidden = true;
    },
  };
}
