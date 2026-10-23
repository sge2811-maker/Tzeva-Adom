// HUD & UX stream: start screen, intro title cards, mission HUD (status, objectives, red-alert
// module, people-outside roster, air-defence panel with sector radar, commands, quiet feed),
// decluttered world markers (priority + collision avoidance + LOD + Arad cluster), shelter routing
// (select a group -> every shelter shows that group's ETA; hover previews the route; click sends),
// pad build popup, debrief.
// Budget: text writes are throttled to 10 Hz; per frame we only write marker transforms (when they
// move), the route canvas and one CSS variable for the alert pulse. Animations that must appear in
// deterministic captures are driven from dt, not CSS.
import * as THREE from 'three';
import { fmtClock } from '../core/util.js';
import { BAT } from '../sim/defense.js';
import { CIV } from '../sim/civilians.js';
import { GEO, groundAt } from '../world/geo.js';
import { findPath } from '../world/layout.js';
import { iconSprite, ic } from './icons.js';

const COL = { ok: '#7fe0a0', tight: '#ffb547', late: '#ff5a47', blocked: '#ff5a47', idle: '#6fd3ff', sheltered: '#7fe0a0', out: '#7fe0a0' };
const RGB = { ok: '127,224,160', tight: '255,181,71', late: '255,90,71', blocked: '255,90,71', idle: '111,211,255', sheltered: '127,224,160', out: '127,224,160' };
const STATUS_TXT = { ok: 'ON TIME', tight: 'TIGHT', late: 'TOO LATE', blocked: 'LOCKED OUT', idle: '', sheltered: 'SAFE', out: 'SAFE' };
const RUN = { adult: 3.2, teen: 3.7, elder: 2.05, child: 2.8 };
const OBJ_LABEL = { shelter: 'Shelter everyone outdoors', nevatim: 'Keep Nevatim above 60%', town: 'No impacts in Arad', hold: 'Hold until the all-clear' };
const TYPE_ICON = { dome: 'dome', sling: 'sling', arrow: 'arrow' };
const STEM = 14, LBL_H = 21;
const CLUSTER_DIST = 3700;   // camera further than this from Arad: town markers merge into one pin
const FULL_DIST = 1150;      // closer than this: markers show names

export function create(ctx) {
  const { hudRoot: root, bus, sim, camera, clock, params, layout, pacing } = ctx;
  if (!params.ui) root.style.display = 'none';
  if (params.capture) root.classList.add('iw-cap');
  root.innerHTML = iconSprite() + `
    <div class="iw-menu" data-r="menu" hidden>
      <div class="sheet">
        <div class="series"><i></i>Tzeva Adom · Seven Fronts · Mission 6</div>
        <h1>Iron Wall</h1>
        <div class="he" lang="he" dir="rtl">חומת ברזל</div>
        <div class="date">13–14 APRIL 2024 · 23:00 IDT · ARAD, NEGEV</div>
        <p>Iran is about to launch its first direct attack on Israel: some 170 drones, 30 cruise missiles and more than 120 ballistic missiles, timed to arrive together. Most are aimed at Nevatim Air Base. Command the air defence over Arad and the base, and when the siren sounds, get the town's people into shelters.</p>
        <div class="acts">
          <button class="iw-btn primary" data-r="go"><span>Begin mission</span>${ic('play')}</button>
          <button class="iw-btn" data-r="goSkip"><span>Skip intro</span>${ic('route')}</button>
        </div>
        <div class="keys"><span><kbd>DRAG</kbd> pan</span><span><kbd>RMB</kbd> rotate</span><span><kbd>WHEEL</kbd> zoom</span><span><kbd>WASD</kbd> move</span><span><kbd>SPACE</kbd> pause</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed</span><span><kbd>C</kbd> cinematic</span></div>
      </div>
      <div class="fine">A dramatisation of the night of 13–14 April 2024. Arad's street plan, shelters and people are invented.</div>
    </div>
    <div class="iw-letter off" data-r="letter"></div>
    <div class="iw-cards" data-r="cards" hidden>
      <div class="c1" data-r="c1">13 APRIL 2024 · 23:00 IDT<b>ARAD · THE NEGEV</b></div>
      <div class="c2" data-r="c2"><div class="k">MISSION 6</div><div class="t">Iron Wall</div><div class="he" lang="he" dir="rtl">חומת ברזל</div></div>
      <div class="c3" data-r="c3">Iran launches its first direct attack on Israel.<small>DRONES · CRUISE MISSILES · BALLISTIC MISSILES</small></div>
    </div>
    <button class="iw-skip" data-r="skip" hidden>SKIP INTRO</button>
    <div class="iw-play" data-r="play" hidden>
      <div class="iw-frame" data-r="frame"></div>
      <canvas class="iw-route" data-r="route"></canvas>
      <div class="iw-markers" data-r="markers"></div>
      <div class="iw-status" data-r="status">
        <div class="clock panel"><b data-r="clock">23:00</b><span data-r="phase">Drones inbound</span></div>
        <div class="money panel"><span class="kick">Budget</span><b data-r="budget">$300M</b></div>
      </div>
      <div class="iw-alert" data-r="alert" hidden><div class="box">
        <div class="he" lang="he" dir="rtl" data-r="alHe">צבע אדום</div>
        <div class="en" data-r="alEn">RED ALERT · ARAD</div>
        <div class="big" data-r="alBig"><b data-r="alNum">75</b><span data-r="alUnit">SEC</span></div>
        <div class="bar" data-r="alBarW"><i data-r="alBar"></i></div>
        <div class="sub" data-r="alSub">TO REACH A PROTECTED SPACE</div>
        <div class="shel" data-r="alShel"><span>IN PROTECTED SPACES</span><b data-r="alIn">0 / 92</b></div>
      </div></div>
      <section class="iw-obj panel" data-r="objp" aria-label="Objectives"><div class="kick">Objectives</div><ul data-r="obj"></ul></section>
      <section class="iw-roster panel" data-r="roster" aria-label="People outside" hidden>
        <div class="hd"><span class="kick">People outside</span><b data-r="rosterN">92</b></div>
        <div data-r="rosterRows"></div>
        <div class="legend"><span style="--c:var(--good)">on time</span><span style="--c:var(--amber)">tight</span><span style="--c:var(--threat)">late / locked</span></div>
      </section>
      <section class="iw-ad panel" data-r="ad" aria-label="Air defence">
        <div class="hd"><span class="kick">Air defence</span><b data-r="rate">—<small>INTERCEPTED</small></b></div>
        <canvas data-r="radar" width="226" height="118" title="Sector map: click to move the camera"></canvas>
        <div class="thr"><span data-r="tDr">${ic('drone')}<b>0</b></span><span data-r="tCr">${ic('cruise')}<b>0</b></span><span data-r="tBa">${ic('ballistic')}<b>0</b></span><span style="margin-left:auto">inbound</span></div>
        <div class="bats" data-r="bats"></div>
      </section>
      <nav class="iw-bar panel" data-r="bar" aria-label="Commands">
        <button class="iw-cmd" data-r="patrol">${ic('jet')}<span><b>Air patrol</b><small data-r="patrolTxt">Not ready</small></span><i class="cd" data-r="patrolCd"></i></button>
        <button class="iw-cmd" data-r="doctrine">${ic('target')}<span><b data-r="docTxt">Protect sites</b><small>Doctrine</small></span></button>
        <button class="iw-cmd" data-r="pause"><span data-r="pauseIc">${ic('pause')}</span><span><b data-r="pauseTxt">Pause</b><small>Space</small></span></button>
        <button class="iw-cmd" data-r="speed">${ic('clock')}<span><b data-r="speedTxt">1×</b><small>Speed</small></span></button>
      </nav>
      <div class="iw-hint" data-r="hint" hidden></div>
      <div class="iw-feed" data-r="feed"></div>
      <div class="iw-toast" data-r="toast" hidden></div>
      <div class="iw-banner" data-r="banner" hidden><b></b><span></span></div>
      <div class="iw-pop" data-r="pop" hidden></div>
    </div>
    <div class="iw-debrief" data-r="debrief" hidden><div class="sheet" data-r="debriefSheet"></div></div>`;
  const $ = (r) => root.querySelector(`[data-r="${r}"]`);
  const set = (el, k, v) => { if (el[k] !== v) el[k] = v; };   // write only on change
  let T = 0;                                                    // HUD time (real seconds, dt-driven)

  // fonts: boot waits for these so the first frame (and every capture) uses the vendored faces
  const ready = (async () => {
    if (!document.fonts) return;
    const L = [];
    for (const w of [300, 400, 500, 600, 700]) L.push(document.fonts.load(`${w} 12px "IW Sans"`, 'Aa0'));
    for (const w of [400, 600, 700]) L.push(document.fonts.load(`${w} 12px "IW Sans"`, 'צבע אדום'));
    for (const w of [400, 500, 600]) L.push(document.fonts.load(`${w} 12px "IW Mono"`, 'A0'));
    await Promise.race([Promise.all(L), new Promise((r) => setTimeout(r, 4000))]);
  })().catch(() => {});

  // ---------------------------------------------------------------- flow
  $('go').onclick = () => ctx.begin({ intro: true });
  $('goSkip').onclick = () => ctx.begin({ intro: false });
  $('skip').onclick = () => ctx.startPlay();
  bus.on('flow', ({ to }) => {
    $('menu').hidden = to !== 'menu';
    $('play').hidden = to !== 'play';
    $('skip').hidden = to !== 'intro';
    $('cards').hidden = to !== 'intro';
    $('letter').classList.toggle('off', to !== 'intro');
  });

  // ---------------------------------------------------------------- helpers
  const mctx = document.createElement('canvas').getContext('2d');
  const textW = (s, font, ls = 0) => { if (!s) return 0; mctx.font = font; return mctx.measureText(s).width + s.length * ls; };
  const F_N = '600 11px "IW Mono"', F_E = '500 10.5px "IW Mono"', F_X = '600 11.5px "IW Sans"';
  const shelterById = new Map(sim.shelters.map((s) => [s.id, s]));
  const groupById = new Map(sim.groups.map((g) => [g.id, g]));
  const shortName = (s) => s.name.replace(/ shelter$/i, '');
  const secs = (s) => (s >= 999 ? '—' : `${Math.max(0, Math.ceil(s))}s`);
  let info = sim.groupInfo();
  let infoById = new Map(info.map((g) => [g.id, g]));
  const loads = new Map();             // shelter id -> projected load (inside + heading there)
  let selGroup = null, hoverShelter = null;

  // group run speed for ETA previews: the slowest kind present sets the pace
  const groupSpeed = new Map(sim.groups.map((g) => [g.id, Math.min(...Object.entries(g.mix).filter(([, p]) => p > 0.05).map(([k]) => RUN[k] || 3)) * 0.9]));
  // planned path (street graph) from a point to a shelter door, cached per group/shelter
  const activeNodes = layout.nodes.filter((n) => n.adj.some((id) => layout.edges[id].on));
  function nearestNode(x, z) { let b = activeNodes[0], bd = Infinity; for (const n of activeNodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; b = n; } } return b.id; }
  const planCache = new Map();
  function plan(gid, sid) {
    const g = infoById.get(gid), s = shelterById.get(sid);
    const key = gid + '>' + sid, c = planCache.get(key);
    if (c && Math.hypot(c.x - g.x, c.z - g.z) < 30) return c;
    let pts;
    if (Math.hypot(s.door.x - g.x, s.door.z - g.z) < 140) pts = [{ x: g.x, z: g.z }, s.door];
    else {
      const ids = findPath(layout, nearestNode(g.x, g.z), s.node) || [];
      pts = [{ x: g.x, z: g.z }, ...ids.map((id) => layout.nodes[id]), s.door];
    }
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const p = { x: g.x, z: g.z, pts, len };
    planCache.set(key, p);
    return p;
  }
  // ETA estimate for sending group gid to shelter sid now (used for the alternatives only; the
  // group's current shelter shows the sim's own estimate)
  function etaTo(gid, sid) {
    const g = infoById.get(gid), s = shelterById.get(sid);
    if (g.shelter === sid) return g.eta;
    const left = g.n - g.inside;
    let e = (sim.phase === 'prep' ? 1.6 : 0.6) + plan(gid, sid).len / groupSpeed.get(gid) + (left / 2.6) * 0.5;
    if (s.locked) e = Math.max(e, s.opening > 0 ? s.opening : 5);
    return e;
  }
  const budgetLeft = () => (sim.phase === 'prep' ? pacing.countdown : sim.countdownLeft() ?? 0);
  const etaStatus = (e) => { const L = budgetLeft(); return e <= L - 6 ? 'ok' : e <= L ? 'tight' : 'late'; };
  function freeAt(sid, exceptGid) {
    const s = shelterById.get(sid);
    let n = s.occ;
    for (const g of info) if (g.shelter === sid && g.id !== exceptGid) n += g.n - g.inside;
    return s.cap - n;
  }

  // ---------------------------------------------------------------- world markers
  const markers = [];
  const v = new THREE.Vector3();
  function mk(kind, id, world, icon, onClick) {
    const el = document.createElement('div');
    el.className = `mk mk-${kind} m-compact`;
    el.dataset.mk = id;
    el.innerHTML = `<i class="stem"></i><i class="foot"></i><div class="lbl"><span class="ico">${ic(icon)}</span><b class="n"></b><span class="e"></span><span class="x"></span></div>`;
    const lbl = el.querySelector('.lbl');
    const m = {
      kind, id, el, lbl, world, icon, stem: el.querySelector('.stem'), nEl: el.querySelector('.n'), eEl: el.querySelector('.e'), xEl: el.querySelector('.x'), icoEl: el.querySelector('.ico'),
      n: '', e: '', x: '', wC: 40, wF: 60, prio: 10, mode: 'compact', dy: 0, sx: -1e4, sy: -1e4, on: true, want: 'compact', cls: '', d: 0,
    };
    if (onClick) {
      const h = (e) => { e.stopPropagation(); onClick(m, e); };
      lbl.addEventListener('click', h); el.querySelector('.foot').addEventListener('click', h);
    }
    $('markers').appendChild(el);
    markers.push(m);
    return m;
  }
  function setText(m, n, e, x, icon) {
    if (icon && icon !== m.icon) { m.icon = icon; m.icoEl.innerHTML = ic(icon); }
    if (n !== m.n) { m.n = n; m.nEl.textContent = n; }
    if (e !== m.e) { m.e = e; m.eEl.textContent = e; }
    if (x !== m.x) { m.x = x; m.xEl.textContent = x; }
    const base = 5 + 14 + 5 + textW(n, F_N) + (e ? 5 + textW(e, F_E) : 0) + 9;
    m.wC = base; m.wF = base + (x ? 5 + textW(x.toUpperCase(), F_X, 0.69) : 0);
  }
  function setCls(m, cls) { if (cls !== m.cls) { m.cls = cls; m.el.className = `mk mk-${m.kind} ${cls} m-${m.mode}`; } }

  const padM = layout.pads.map((p) => { const m = mk('pad', 'pad-' + p.id, new THREE.Vector3(p.x, groundAt(p.x, p.z) + 4, p.z), 'hexplus', () => openPad(p, m)); m.pad = p; return m; });
  const shM = sim.shelters.map((s) => { const m = mk('shelter', s.id, new THREE.Vector3(s.door.x, s.y + 3, s.door.z), 'shelter', () => clickShelter(s)); m.s = s; return m; });
  const grM = sim.groups.map((g) => { const m = mk('group', g.id, new THREE.Vector3(g.x, groundAt(g.x, g.z) + 2, g.z), 'people', () => selectGroup(selGroup === g.id ? null : g.id)); m.g = g; return m; });
  const nevM = mk('asset', 'nevatim', new THREE.Vector3(GEO.nevatim.x, groundAt(GEO.nevatim.x, GEO.nevatim.z) + 20, GEO.nevatim.z), 'base');
  nevM.lbl.insertAdjacentHTML('beforeend', '<span class="hp"><i></i></span>'); nevM.hp = nevM.lbl.querySelector('.hp i');
  const aradM = mk('asset', 'arad', new THREE.Vector3(0, groundAt(0, 0) + 20, 0), 'town');
  for (const m of shM) {
    for (const el of [m.lbl, m.el.querySelector('.foot')]) {
      el.addEventListener('mouseenter', () => { hoverShelter = m.s.id; refreshSlow(); });
      el.addEventListener('mouseleave', (e) => { if (hoverShelter === m.s.id && !m.el.contains(e.relatedTarget)) { hoverShelter = null; refreshSlow(); } });
    }
    m.lbl.insertAdjacentHTML('beforeend', '<i class="fl"></i>'); m.fl = m.lbl.querySelector('.fl');
  }
  for (const m of grM) { m.lbl.insertAdjacentHTML('beforeend', '<i class="fl"></i>'); m.fl = m.lbl.querySelector('.fl'); }
  const flashes = new Map();            // marker -> time left
  const flash = (m) => { if (m && m.fl) flashes.set(m, 1.2); };

  function selectGroup(id) {
    selGroup = id;
    $('pop').hidden = true;
    refreshSlow();
  }
  function clickShelter(s) {
    const g = selGroup ? groupById.get(selGroup) : null;
    const sm = shM.find((q) => q.s.id === s.id);
    if (s.locked && s.opening <= 0) {
      const r = sim.cmd('unlock', { shelter: s.id });
      if (r && r.ok) { flash(sm); toast(`Opening ${s.name} · crew on site in 5 s`, 'good', 'unlock'); }
      if (!g) { refreshSlow(); return; }
    }
    if (g) {
      if (g.shelter === s.id) { toast(`${g.name} are already heading to the ${s.name}`, 'info', 'route'); selectGroup(null); return; }
      const e = etaTo(g.id, s.id), free = freeAt(s.id, g.id), left = infoById.get(g.id).n - infoById.get(g.id).inside;
      const r = sim.cmd('route', { group: g.id, shelter: s.id });
      if (r && r.ok) {
        const st = etaStatus(e);
        toast(`${g.name} rerouted to the ${s.name} · ETA ${secs(e)}${free < left ? ` · only ${Math.max(0, free)} places left` : ''}`, free < left || st === 'late' ? 'bad' : st === 'tight' ? 'info' : 'good', 'route');
        flash(sm); flash(grM.find((q) => q.g.id === g.id));
        routeFlashT = 1.2;
      }
      selectGroup(null);
    } else if (!s.locked) {
      toast(`${s.name}: ${s.occ}/${s.cap} inside. Select a group first, then click a shelter.`, 'info', 'shelter');
    }
  }

  // ---------------------------------------------------------------- pad popup
  function openPad(p, m) {
    const pop = $('pop');
    selGroup = null;
    if (p.battery) {
      const b = sim.batteries.find((q) => q.id === p.battery);
      toast(`${BAT[b.type].name} at ${p.name}: ${b.reload > 0 ? 'reloading' : b.stock + '/' + b.T.stock + ' ready'}`, 'info', TYPE_ICON[b.type]);
      pop.hidden = true; return;
    }
    const role = { dome: 'Drones and cruise missiles · short range', sling: 'Cruise and ballistic · low in the atmosphere' };
    pop.innerHTML = `<div class="kick">Deploy at ${p.name}</div>` + p.allow.map((t) => `<button data-build="${t}" ${sim.budget < BAT[t].cost ? 'disabled' : ''}>${ic(TYPE_ICON[t])}<span><b>${BAT[t].name}</b><small>${role[t] || ''}</small></span><span class="px">$${BAT[t].cost}M</span></button>`).join('');
    pop.hidden = false; pop.dataset.pad = p.id;
    const x = Math.min(innerWidth - 260, Math.max(8, m.sx - 124)), y = m.sy + 12 > innerHeight - 160 ? m.sy - 190 : m.sy + 12;
    pop.style.transform = `translate(${x}px, ${y}px)`;
    pop.querySelectorAll('[data-build]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const r = sim.cmd('build', { pad: p.id, type: b.dataset.build });
      pop.hidden = true;
      if (r && r.ok) { toast(`${BAT[b.dataset.build].name} deploying at ${p.name}`, 'good', TYPE_ICON[b.dataset.build]); refreshSlow(); }
    }));
  }
  // a click on empty ground (no drag) closes the popup and clears the selection
  let downAt = null;
  ctx.canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  ctx.canvas.addEventListener('pointerup', (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5 && e.button === 0) { $('pop').hidden = true; if (selGroup) selectGroup(null); }
    downAt = null;
  });

  // ---------------------------------------------------------------- commands
  $('doctrine').onclick = () => { sim.cmd('doctrine', { mode: sim.doctrine === 'protect' ? 'all' : 'protect' }); toast(sim.doctrine === 'all' ? 'Engage all: batteries also fire at threats falling on open ground' : 'Protect sites: batteries ignore threats falling on open ground', 'info', 'target'); refreshSlow(); };
  $('patrol').onclick = () => { const r = sim.cmd('airPatrol', { x: 9500, z: -1200 }); if (r && r.ok) toast('Coalition air patrol inbound east of Arad', 'good', 'jet'); refreshSlow(); };
  $('pause').onclick = () => { clock.paused = !clock.paused; refreshSlow(); };
  $('speed').onclick = () => { clock.speed = clock.speed === 1 ? 2 : clock.speed === 2 ? 4 : 1; refreshSlow(); };
  addEventListener('keydown', (e) => {
    if (ctx.flow !== 'play') return;
    if (e.key === ' ') { e.preventDefault(); clock.paused = !clock.paused; }
    else if (e.key === '1') clock.speed = 1; else if (e.key === '2') clock.speed = 2; else if (e.key === '3') clock.speed = 4;
    else if (e.key === 'Escape') { $('pop').hidden = true; selectGroup(null); }
    refreshSlow();
  });
  bus.on('cmd:rejected', ({ why }) => toast(why, 'bad', 'warn'));

  // ---------------------------------------------------------------- feed, toasts, banners
  let toastT = 0, bannerT = -1, routeFlashT = 0;
  function toast(text, kind = 'info', icon = 'route') { const t = $('toast'); t.className = 'iw-toast ' + kind; t.innerHTML = ic(icon); t.append(text); t.hidden = false; toastT = 3.4; }
  function banner(a, b, kind) { const el = $('banner'); el.querySelector('b').textContent = a; el.querySelector('span').textContent = b; el.className = 'iw-banner ' + kind; el.hidden = false; bannerT = sim.t + 4.2; }
  const feedItems = [];
  bus.on('msg', (m) => {
    if (/^Municipal crew opening|is open\.$/.test(m.text)) return; // markers + toasts already say this
    const d = document.createElement('div');
    d.className = 'ev ' + m.kind;
    d.innerHTML = `<time>${fmtClock(sim.clockMinutes())}</time><span></span>`; d.querySelector('span').textContent = m.text.replace(/^\d\d:\d\d · /, '');
    $('feed').appendChild(d); feedItems.push({ d, t: sim.t });
    while (feedItems.length > 3) feedItems.shift().d.remove();
  });
  bus.on('salvo:end', (S) => banner(`Salvo ${S.id} · ${S.kill} of ${S.n} intercepted`, S.nevatim || S.town ? `${S.nevatim + S.town} impact${S.nevatim + S.town > 1 ? 's' : ''} on defended sites` : 'No impacts on defended sites', S.nevatim || S.town ? 'bad' : 'good'));
  bus.on('alert:impactWindow', ({ exposed, total }) => banner(exposed ? `${exposed} people still outside` : `All ${total} in protected spaces`, exposed ? 'impact window · stay low, stay covered' : 'impact window · everyone outdoors made it', exposed ? 'bad' : 'good'));
  bus.on('shelter:full', ({ id }) => { const m = shM.find((q) => q.s.id === id); flash(m); toast(`${shelterById.get(id).name} is full: people are moving on to the next shelter`, 'bad', 'warn'); });
  bus.on('shelter:blocked', ({ id }) => { flash(shM.find((q) => q.s.id === id)); toast(`People are waiting at the locked ${shelterById.get(id).name}: click it to open`, 'bad', 'lock'); });
  bus.on('shelter:open', ({ id }) => flash(shM.find((q) => q.s.id === id)));
  let alertT0 = -1, clearT0 = -1;
  bus.on('alert:start', () => { alertT0 = T; });
  bus.on('allclear', () => { clearT0 = sim.t; });
  bus.on('phase', () => refreshSlow());
  bus.on('mission:end', (r) => showDebrief(r));

  // ---------------------------------------------------------------- route canvas
  const rc = $('route'), rx = rc.getContext('2d');
  let rdpr = 1;
  function sizeRoute() { rdpr = Math.min(2, devicePixelRatio || 1); rc.width = innerWidth * rdpr; rc.height = innerHeight * rdpr; }
  sizeRoute();
  const P = { x: 0, y: 0, ok: false };
  const proj = (x, y, z) => { v.set(x, y, z).project(camera); P.x = (v.x + 1) / 2 * innerWidth; P.y = (1 - v.y) / 2 * innerHeight; P.ok = v.z < 1 && v.z > -1; return P; };
  function polyline(pts, from = 0) {
    rx.beginPath(); let started = false;
    for (let i = from; i < pts.length; i++) {
      const p = pts[i], q = proj(p.x, groundAt(p.x, p.z) + 1.5, p.z);
      if (!q.ok) { started = false; continue; }
      if (!started) { rx.moveTo(q.x, q.y); started = true; } else rx.lineTo(q.x, q.y);
    }
    rx.stroke();
  }
  function ring(x, z, r, col, a, w) {
    rx.strokeStyle = `rgba(${col},${a})`; rx.lineWidth = w; rx.beginPath();
    const y = groundAt(x, z) + 1; let started = false;
    for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI * 2, q = proj(x + Math.cos(t) * r, y, z + Math.sin(t) * r); if (!q.ok) { started = false; continue; } if (!started) { rx.moveTo(q.x, q.y); started = true; } else rx.lineTo(q.x, q.y); }
    rx.stroke();
  }
  let routeDirty = true;
  function drawRoutes(townDist) {
    const show = (sim.phase === 'prep' || sim.phase === 'alert') && townDist < CLUSTER_DIST;
    if (!show) { if (routeDirty) { rx.setTransform(1, 0, 0, 1, 0, 0); rx.clearRect(0, 0, rc.width, rc.height); routeDirty = false; } return; }
    routeDirty = true;
    rx.setTransform(rdpr, 0, 0, rdpr, 0, 0); rx.clearRect(0, 0, innerWidth, innerHeight);
    const A = sim.civ.A, near = townDist < 1300;
    rx.lineCap = 'round'; rx.lineJoin = 'round';
    for (const g of info) {
      if (g.status === 'sheltered' || g.status === 'out') continue;
      const grp = groupById.get(g.id), sel = g.id === selGroup, col = RGB[g.status] || RGB.idle;
      // ground ring on the crowd: they are only a few pixels tall from the RTS camera
      if (sim.phase === 'prep' || g.inside < g.n * 0.5) ring(g.x, g.z, grp.spread + 6, col, sel ? 0.95 : 0.55, sel ? 2.4 : 1.4);
      // route: the planned path before the siren (selected group only), the live path after
      let pts = null, from = 0;
      if (sim.phase === 'alert') for (const i of grp.members) if (A.state[i] !== CIV.SHELTERED && A.path[i]) { pts = A.path[i]; from = Math.max(0, A.pi[i] - 1); break; }
      if (!pts && (sel || sim.phase === 'alert')) pts = plan(g.id, g.shelter).pts;
      if (!pts || (sim.phase === 'prep' && !sel)) continue;
      const a = sel ? 0.95 : 0.55 + (routeFlashT > 0 ? 0.4 * routeFlashT : 0);
      rx.setLineDash([]); rx.strokeStyle = `rgba(0,0,0,${a * 0.5})`; rx.lineWidth = sel ? 6 : 4; polyline(pts, from);
      rx.setLineDash([7, 6]); rx.lineDashOffset = -T * 26; rx.strokeStyle = `rgba(${col},${a})`; rx.lineWidth = sel ? 2.6 : 1.8; polyline(pts, from);
    }
    // hover preview: the alternative route for the selected group
    if (selGroup && hoverShelter && infoById.get(selGroup).shelter !== hoverShelter) {
      const p = plan(selGroup, hoverShelter), st = etaStatus(etaTo(selGroup, hoverShelter));
      rx.setLineDash([]); rx.strokeStyle = 'rgba(0,0,0,0.5)'; rx.lineWidth = 6; polyline(p.pts);
      rx.setLineDash([3, 5]); rx.lineDashOffset = -T * 30; rx.strokeStyle = `rgba(${RGB[st]},1)`; rx.lineWidth = 2.8; polyline(p.pts);
      const s = shelterById.get(hoverShelter); ring(s.door.x, s.door.z, 10, '255,255,255', 0.9, 2);
    }
    rx.setLineDash([]);
    // people dots: a readable stand-in for the tiny crowd figures while they run
    if (near && sim.phase === 'alert') {
      for (let i = 0; i < A.n; i++) {
        const st = A.state[i]; if (st !== CIV.MOVING && st !== CIV.WAITING && st !== CIV.QUEUE && st !== CIV.REACT) continue;
        const q = proj(A.x[i], A.y[i] + 1.7, A.z[i]); if (!q.ok) continue;
        const g = infoById.get(sim.groups[A.group[i]].id);
        rx.fillStyle = `rgba(${RGB[g.status] || RGB.idle},0.8)`; rx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
      }
    }
  }

  // ---------------------------------------------------------------- marker content (10 Hz)
  function updateMarkerContent() {
    const sel = selGroup ? infoById.get(selGroup) : null;
    for (const m of shM) {
      const s = m.s, full = s.occ >= s.cap;
      const st = s.locked ? (s.opening > 0 ? 'st-opening' : 'st-locked') : full ? 'st-full' : 'st-open';
      let n, e = '', x = shortName(s), icon = s.locked ? (s.opening > 0 ? 'unlock' : 'lock') : 'shelter', extra = '';
      if (s.locked) n = s.opening > 0 ? `OPENING ${Math.ceil(s.opening)}` : 'LOCKED';
      else n = `${s.occ}/${s.cap}`;
      if (sel && sel.status !== 'sheltered') {
        const eta = etaTo(sel.id, s.id), es = etaStatus(eta), free = freeAt(s.id, sel.id);
        e = sel.shelter === s.id ? `ETA ${secs(eta)}` : `${secs(eta)}`;
        x = free < sel.n - sel.inside ? `${Math.max(0, free)} places left` : sel.shelter === s.id ? 'current' : `${free} free`;
        extra = ` pick e-${free < sel.n - sel.inside ? 'late' : es}`;
        if (s.locked && s.opening <= 0) x = 'click: open + send';
      } else if (s.locked && s.opening <= 0) x = 'click to open';
      setText(m, n, e, x, icon);
      setCls(m, st + extra + (sel && sel.shelter === s.id ? ' tgt' : '') + (hoverShelter === s.id ? ' hov' : ''));
      m.prio = (hoverShelter === s.id ? 200 : 0) + (s.locked ? 80 : 30) + (sel ? 40 : 0) + (sel && sel.shelter === s.id ? 20 : 0);
      m.forceFull = !!sel || hoverShelter === s.id || (s.locked && s.opening <= 0 && sim.phase === 'alert');
    }
    for (const m of grM) {
      const g = infoById.get(m.g.id);
      m.world.set(g.x, groundAt(g.x, g.z) + 2, g.z);
      m.done = g.status === 'sheltered' || g.status === 'out';
      const left = g.n - g.inside;
      let status = g.status, why = STATUS_TXT[g.status];
      const s = shelterById.get(g.shelter);
      const crowded = !m.done && !s.locked && loads.get(g.shelter) > s.cap;
      if (crowded && status === 'ok') { status = 'tight'; why = 'SHELTER OVERCROWDED'; }
      if (status === 'blocked') why = sim.phase === 'prep' ? 'SHELTER LOCKED' : `${shortName(s).toUpperCase()} LOCKED`;
      m.status = status;
      const e = status === 'blocked' ? '' : `${sim.phase === 'prep' ? 'ETA ' : ''}${secs(g.eta)}`;
      const x = sim.phase === 'prep' ? `${g.name} · ${why}` : `${why} · ${g.name}`;
      setText(m, String(left), e, x, 'people');
      setCls(m, `st-${status}${selGroup === g.id ? ' sel' : ''}`);
      m.prio = selGroup === g.id ? 300 : (selGroup ? 5 : 0) + (status === 'late' || status === 'blocked' ? 95 : status === 'tight' ? 70 : 55) - (selGroup ? 60 : 0);
      m.forceFull = selGroup === g.id || ((status === 'late' || status === 'blocked') && sim.phase === 'alert');
    }
    for (const m of padM) {
      const b = m.pad.battery ? sim.batteries.find((q) => q.id === m.pad.battery) : null;
      if (b) setText(m, b.reload > 0 ? `RELOAD ${Math.ceil(b.reload)}` : `${b.stock}/${b.T.stock}`, '', BAT[b.type].name, TYPE_ICON[b.type]);
      else setText(m, 'DEPLOY', '', m.pad.name, 'hexplus');
      setCls(m, b ? (b.reload > 0 ? 'built rl' : 'built') : 'empty');
      m.prio = b ? 20 : 45;
    }
    setText(nevM, `${Math.round(sim.nevatim)}%`, '', 'Nevatim AB', 'base');
    nevM.hp.style.width = sim.nevatim + '%'; nevM.hp.style.background = sim.nevatim < 60 ? 'var(--threat)' : sim.nevatim < 80 ? 'var(--amber)' : 'var(--good)';
    nevM.prio = 15; nevM.forceFull = true;
    const outside = info.reduce((a, g) => a + (g.n - g.inside), 0), locked = sim.shelters.filter((s) => s.locked).length;
    const late = info.filter((g) => g.status === 'late' || g.status === 'blocked').length;
    setText(aradM, 'ARAD', outside && sim.phase !== 'aftermath' && sim.phase !== 'debrief' ? `${outside} outside` : '', locked ? `${locked} shelters locked` : late ? `${late} groups late` : `${sim.shelters.length} shelters`, 'town');
    setCls(aradM, late || (locked && sim.phase === 'alert') ? 'warn' : '');
    aradM.el.style.setProperty('--c', late || (locked && sim.phase === 'alert') ? 'var(--threat)' : '#cbd6dc');
    aradM.prio = 60; aradM.forceFull = true;
  }

  // ---------------------------------------------------------------- marker placement (per frame)
  const placed = [];   // rect pool: [x0, y0, x1, y1]
  let nPlaced = 0;
  const obstacles = [];
  function pushRect(x0, y0, x1, y1) { let r = placed[nPlaced]; if (!r) placed[nPlaced] = r = [0, 0, 0, 0]; r[0] = x0; r[1] = y0; r[2] = x1; r[3] = y1; nPlaced++; }
  function hits(x0, y0, x1, y1) { for (let i = 0; i < nPlaced; i++) { const r = placed[i]; if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true; } return false; }
  let order = markers.slice();
  const TRY_FULL = ['full', 0, 'full', 24, 'full', 48, 'compact', 0, 'compact', 24, 'compact', 48], TRY_CMP = ['compact', 0, 'compact', 24, 'compact', 48];
  function fits(m, md, d, sx, sy) {
    const w = md === 'full' ? m.wF : m.wC, y1 = sy - STEM - d, y0 = y1 - LBL_H;
    if (hits(sx - w / 2 - 2, y0 - 2, sx + w / 2 + 2, y1 + 2)) return false;
    pushRect(sx - w / 2 - 2, y0 - 2, sx + w / 2 + 2, y1 + 2);
    return true;
  }
  function placeMarkers(townDist) {
    const W = innerWidth, H = innerHeight;
    nPlaced = 0;
    for (const o of obstacles) pushRect(o[0], o[1], o[2], o[3]);
    const cluster = townDist > CLUSTER_DIST;
    const hideAll = sim.phase === 'debrief';
    for (const m of order) {
      let on = !hideAll;
      if (on && (m.kind === 'group' || m.kind === 'shelter')) on = !cluster && !(m.kind === 'group' && m.done);
      if (on && m === aradM) on = cluster;
      if (on) { v.copy(m.world).project(camera); on = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02; }
      if (on) { m.d = camera.position.distanceTo(m.world); if (m.kind === 'pad' && m.d > 9000 && !m.pad.battery) on = false; }
      if (!on) { if (m.mode !== 'hidden') { m.mode = 'hidden'; m.el.className = `mk mk-${m.kind} ${m.cls} m-hidden`; } continue; }
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      const want = m.forceFull || m.d < FULL_DIST ? 'full' : 'compact';
      // try: previous placement first (stability), then full/compact at increasing lifts, then a dot
      let mode = null, dy = 0;
      if (m.mode !== 'hidden' && m.mode !== 'dot' && (m.mode === want || m.mode === 'compact') && fits(m, m.mode, m.dy, sx, sy)) { mode = m.mode; dy = m.dy; }
      else {
        const tries = want === 'full' ? TRY_FULL : TRY_CMP;
        for (let k = 0; k < tries.length; k += 2) if (fits(m, tries[k], tries[k + 1], sx, sy)) { mode = tries[k]; dy = tries[k + 1]; break; }
      }
      if (!mode) { mode = 'dot'; dy = 0; }
      pushRect(sx - 8, sy - 8, sx + 8, sy + 8); // the ground foot is always reserved
      if (mode !== m.mode || dy !== m.dy) {
        m.mode = mode;
        m.el.className = `mk mk-${m.kind} ${m.cls} m-${mode}`;
        if (dy !== m.dy) { m.dy = dy; m.lbl.style.bottom = `${STEM + dy}px`; m.stem.style.height = `${STEM - 2 + dy}px`; }
      }
      if (Math.abs(sx - m.sx) > 0.3 || Math.abs(sy - m.sy) > 0.3) { m.sx = sx; m.sy = sy; m.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`; }
    }
  }
  function readObstacles() {
    obstacles.length = 0;
    for (const r of ['status', 'objp', 'ad', 'bar', 'alert', 'roster', 'hint', 'feed']) {
      const el = $(r); if (el.hidden) continue;
      const b = el.getBoundingClientRect(); if (b.width && b.height) obstacles.push([b.left - 4, b.top - 4, b.right + 4, b.bottom + 4]);
    }
  }

  // ---------------------------------------------------------------- panels (10 Hz)
  const PHASE_TXT = { prep: 'Drones inbound', alert: 'Red alert · Arad', barrage: 'Ballistic barrage', hold: 'Stay inside', aftermath: 'All clear', debrief: 'Mission over' };
  const objEls = new Map();
  const rosterEls = new Map();
  for (const g of sim.groups) {
    const b = document.createElement('button');
    b.dataset.group = g.id;
    b.innerHTML = '<i></i><span class="nm"></span><span class="n"></span><span class="e"></span>';
    b.querySelector('.nm').textContent = g.name;
    b.onclick = (e) => { e.stopPropagation(); selectGroup(selGroup === g.id ? null : g.id); };
    $('rosterRows').appendChild(b); rosterEls.set(g.id, { b, n: b.querySelector('.n'), e: b.querySelector('.e'), c: '', cls: '' });
  }
  const batEls = new Map();
  function updatePanels() {
    set($('clock'), 'innerHTML', `${fmtClock(sim.clockMinutes())}<small>IDT</small>`);
    set($('phase'), 'textContent', sim.phase === 'prep' && sim.t >= pacing.earlyWarning ? 'Early warning' : PHASE_TXT[sim.phase] || '');
    set($('budget'), 'textContent', `$${Math.max(0, sim.budget).toFixed(sim.budget < 10 ? 1 : 0)}M`);
    // objectives
    const total = sim.civ.total, inside = info.reduce((a, g) => a + g.inside, 0);
    for (const o of sim.objectives) {
      let li = objEls.get(o.id);
      if (!li) {
        li = document.createElement('li'); li.innerHTML = `<span data-i></span><span class="t"></span><span class="v"></span><span class="bar"><i></i></span>`;
        $('obj').appendChild(li); li._i = li.querySelector('[data-i]'); li._t = li.querySelector('.t'); li._v = li.querySelector('.v'); li._b = li.querySelector('.bar'); li._bi = li._b.firstChild; li._st = ''; objEls.set(o.id, li);
        li._t.textContent = OBJ_LABEL[o.id] || o.text;
      }
      if (li._st !== o.state) { li._st = o.state; li.className = o.state; li._i.innerHTML = ic(o.state === 'done' ? 'check' : o.state === 'failed' ? 'cross' : o.id === 'shelter' ? 'people' : o.id === 'nevatim' ? 'base' : o.id === 'town' ? 'town' : 'clock'); }
      let val = '', frac = null;
      if (o.id === 'shelter') { const n = o.state === 'active' ? inside : total - (sim.exposedAtImpact ?? 0); val = `${n}/${total}`; frac = n / total; }
      else if (o.id === 'nevatim') { val = `${Math.round(sim.nevatim)}%`; frac = sim.nevatim / 100; }
      else if (o.id === 'town') val = sim.townHits ? `${sim.townHits} hit${sim.townHits > 1 ? 's' : ''}` : '0';
      else if (o.id === 'hold') val = sim.phase === 'hold' ? `${Math.ceil(Math.max(0, sim.holdUntil - sim.t))}s` : o.state === 'done' ? 'done' : '';
      set(li._v, 'textContent', val);
      li._b.hidden = frac == null;
      if (frac != null) { li._bi.style.width = `${Math.round(frac * 100)}%`; li._bi.style.background = o.id === 'nevatim' ? (sim.nevatim < 60 ? 'var(--threat)' : sim.nevatim < 80 ? 'var(--amber)' : 'var(--good)') : ''; }
    }
    // roster
    const showRoster = (sim.phase === 'prep' || sim.phase === 'alert');
    $('roster').hidden = !showRoster;
    if (showRoster) {
      let out = 0;
      for (const g of info) {
        const r = rosterEls.get(g.id), m = grM.find((q) => q.g.id === g.id), st = m.status || g.status, left = g.n - g.inside;
        out += left;
        set(r.n, 'textContent', left ? String(left) : '');
        set(r.e, 'textContent', g.status === 'sheltered' ? 'SAFE' : st === 'blocked' ? 'LOCKED' : secs(g.eta));
        const c = COL[st] || COL.idle; if (c !== r.c) { r.c = c; r.b.style.setProperty('--c', c); }
        const cls = (selGroup === g.id ? 'sel' : '') + (g.status === 'sheltered' ? ' done' : ''); if (cls !== r.cls) { r.cls = cls; r.b.className = cls; }
      }
      set($('rosterN'), 'textContent', `${out}/${total}`);
    }
    // air defence
    const live = { drone: 0, cruise: 0, ballistic: 0 }; for (const th of sim.threats) if (th.alive) live[th.type]++;
    for (const [r, k] of [['tDr', 'drone'], ['tCr', 'cruise'], ['tBa', 'ballistic']]) { const el = $(r); set(el.lastChild, 'textContent', String(live[k])); el.classList.toggle('live', live[k] > 0); }
    const k = sim.stats.killed, im = sim.stats.impacts, done = k.drone + k.cruise + k.ballistic, hit = im.nevatim + im.town + im.open;
    set($('rate'), 'innerHTML', `${done + hit ? Math.round(done / (done + hit) * 100) + '%' : '—'}<small>INTERCEPTED</small>`);
    for (const b of sim.batteries) {
      let r = batEls.get(b.id);
      if (!r) {
        const el = document.createElement('div'); el.className = 'bat';
        const pad = b.pad ? layout.pads.find((p) => p.id === b.pad) : null;
        el.innerHTML = `${ic(TYPE_ICON[b.type])}<span>${BAT[b.type].name}<small>${pad ? pad.name.replace('Nevatim', 'Nev.') : 'off-map'}</small></span><span class="am"><u><i></i></u><em></em></span>`;
        $('bats').appendChild(el); r = { el, i: el.querySelector('u i'), t: el.querySelector('em'), cls: '' }; batEls.set(b.id, r);
      }
      const rl = b.reload > 0;
      const frac = rl ? 1 - b.reload / b.T.reload : b.stock / b.T.stock;
      r.i.style.width = `${Math.round(frac * 100)}%`;
      set(r.t, 'textContent', rl ? `${Math.ceil(b.reload)}s` : `${b.stock}`);
      const cls = 'bat' + (rl ? ' rl' : ''); if (cls !== r.cls) { r.cls = cls; r.el.className = cls; }
    }
    // commands
    const AP = pacing.airPatrol, ready = sim.t >= AP.readyAt && sim.patrolCd <= 0;
    set($('patrolTxt'), 'textContent', sim.t < AP.readyAt ? `On station in ${Math.ceil(AP.readyAt - sim.t)}s` : sim.patrolCd > 0 ? `Ready in ${Math.ceil(sim.patrolCd)}s` : 'Ready · call it');
    $('patrol').disabled = !ready; $('patrol').classList.toggle('ready', ready);
    $('patrolCd').style.transform = `scaleX(${sim.t < AP.readyAt ? sim.t / AP.readyAt : sim.patrolCd > 0 ? 1 - sim.patrolCd / AP.cooldown : 1})`;
    set($('docTxt'), 'textContent', sim.doctrine === 'protect' ? 'Protect sites' : 'Engage all');
    set($('pauseTxt'), 'textContent', clock.paused ? 'Resume' : 'Pause');
    const pi = clock.paused ? 'play' : 'pause'; if ($('pauseIc').dataset.i !== pi) { $('pauseIc').dataset.i = pi; $('pauseIc').innerHTML = ic(pi); }
    set($('speedTxt'), 'textContent', clock.speed + '×');
    // coach line
    const hint = $('hint');
    let h = '';
    if (selGroup) { const g = infoById.get(selGroup); h = `${ic('people')}<span><b>${g.name}</b> (${g.n - g.inside}) selected · click a shelter to send them · each shelter shows their ETA · <kbd>ESC</kbd> cancel</span>`; }
    else if (sim.phase === 'alert') h = `${ic('lock')}<span>Click a <b>locked shelter</b> to open it · click a <b>group</b>, then a shelter, to reroute</span>`;
    else if (sim.phase === 'prep' && sim.t >= 40) h = `${ic('route')}<span>Plan ahead: click a <b>group</b>, then a <b>shelter</b>. Amber or red groups won't make it in ${pacing.countdown} s.</span>`;
    else if (sim.phase === 'prep' && sim.t < 40 && layout.pads.some((p) => !p.battery) && sim.budget >= 40) h = `${ic('hexplus')}<span>Click a dashed <b>pad</b> marker to deploy Iron Dome or David's Sling</span>`;
    if (h !== hint._h) { hint._h = h; hint.innerHTML = h; hint.hidden = !h; }
    updateAlert();
  }

  // ---------------------------------------------------------------- red-alert module
  const al = $('alert');
  let alMode = '';
  function updateAlert() {
    let mode = '';
    if (sim.phase === 'prep' && sim.t >= pacing.earlyWarning) mode = 'warn';
    else if (sim.phase === 'alert') mode = 'alert';
    else if (sim.phase === 'barrage') mode = 'barrage';
    else if (sim.phase === 'hold') mode = 'hold';
    else if (sim.phase === 'aftermath' && clearT0 >= 0 && sim.t - clearT0 < 9) mode = 'clear';
    if (mode !== alMode) {
      alMode = mode; al.hidden = !mode; al.className = 'iw-alert ' + mode;
      const he = $('alHe'), big = $('alBig');
      const cfg = {
        warn: [null, 'EARLY WARNING · NEGEV', false, 'Stay near a protected space · plan your shelter routes now', false, false],
        alert: ['צבע אדום', 'RED ALERT · ARAD', false, 'TO REACH A PROTECTED SPACE', true, true],
        barrage: ['הישארו במרחב המוגן', 'IMPACT WINDOW · ARAD', true, 'INTERCEPTS AND FALLING DEBRIS OVERHEAD', false, true],
        hold: ['הישארו במרחב המוגן', 'ALL-CLEAR IN', false, 'LAST SALVO DOWN · STAY IN THE PROTECTED SPACE', true, false],
        clear: ['אפשר לצאת מהמרחב המוגן', 'ALL CLEAR · ARAD', true, 'PEOPLE CAN LEAVE THE PROTECTED SPACES', false, false],
      }[mode];
      if (cfg) {
        he.hidden = !cfg[0]; if (cfg[0]) he.textContent = cfg[0];
        $('alEn').textContent = cfg[1];
        big.hidden = mode === 'warn'; big.classList.toggle('txt', cfg[2]);
        $('alSub').textContent = cfg[3];
        $('alBarW').hidden = !cfg[4]; $('alShel').hidden = !cfg[5];
        $('alUnit').textContent = mode === 'alert' ? 'SEC' : '';
        if (mode === 'barrage') $('alNum').textContent = 'STAY INSIDE';
        if (mode === 'clear') $('alNum').textContent = 'ALL CLEAR';
      }
    }
    if (mode === 'alert') {
      const left = sim.countdownLeft();
      set($('alNum'), 'textContent', String(Math.max(0, Math.ceil(left))));
      $('alBar').style.transform = `scaleX(${(left / pacing.countdown).toFixed(4)})`;
    } else if (mode === 'hold') {
      const left = Math.max(0, sim.holdUntil - sim.t);
      set($('alNum'), 'textContent', `0:${String(Math.ceil(left)).padStart(2, '0')}`);
      $('alBar').style.transform = `scaleX(${(left / pacing.shelterHold).toFixed(4)})`;
    } else if (mode === 'barrage') {
      const ids = Object.keys(sim.salvos).map(Number), cur = ids.length ? Math.max(...ids) : 0;
      set($('alSub'), 'textContent', cur ? `SALVO ${cur} OF ${pacing.salvos.length} · INTERCEPTS AND FALLING DEBRIS` : 'BALLISTIC MISSILES INBOUND');
    }
    if (mode === 'alert' || mode === 'barrage') {
      const total = sim.civ.total, inside = info.reduce((a, g) => a + g.inside, 0);
      const b = $('alIn'); set(b, 'textContent', `${inside} / ${total}`); b.classList.toggle('ok', inside === total);
    }
  }
  function animateAlert(dt) {
    // siren-synced pulse (one swell per 4.5 s siren cycle) plus a short entrance; dt-driven
    const frame = $('frame');
    if (alMode === 'alert') {
      const since = alertT0 >= 0 ? T - alertT0 : 10;
      const cyc = ((since % 4.5) / 4.5), p = 0.5 - 0.5 * Math.cos(cyc * Math.PI * 2);
      al.style.setProperty('--p', p.toFixed(3));
      const ent = Math.min(1, since / 0.55), e = 1 - Math.pow(1 - ent, 3);
      al.style.transform = ent < 1 ? `scale(${(1.12 - 0.12 * e).toFixed(4)})` : '';
      al.style.opacity = ent < 1 ? e.toFixed(3) : '';
      frame.style.opacity = (0.12 + 0.22 * p + (since < 1.2 ? 0.6 * (1 - since / 1.2) : 0)).toFixed(3);
    } else {
      if (al.style.transform) { al.style.transform = ''; al.style.opacity = ''; }
      const want = alMode === 'barrage' ? 0.1 : 0;
      if (frame.style.opacity !== String(want)) frame.style.opacity = String(want);
    }
  }

  // ---------------------------------------------------------------- sector radar (10 Hz)
  const rad = $('radar'), rg = rad.getContext('2d');
  const RW = 226, RH = 118, X0 = -12500, X1 = 19500, sc = RW / (X1 - X0), Z0 = -RH / 2 / sc;
  rad.width = RW * 2; rad.height = RH * 2;
  const rxp = (x) => (x - X0) * sc, rzp = (z) => (z - Z0) * sc;
  const camDir = new THREE.Vector3();
  function drawRadar() {
    const c = rg; c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, RW, RH);
    c.fillStyle = 'rgba(70,120,150,0.16)'; c.fillRect(rxp(9800), 0, rxp(16300) - rxp(9800), RH);
    c.strokeStyle = 'rgba(160,200,215,0.08)'; c.lineWidth = 1; c.beginPath();
    for (let x = -10000; x <= 18000; x += 5000) { c.moveTo(rxp(x), 0); c.lineTo(rxp(x), RH); }
    for (let z = -5000; z <= 5000; z += 5000) { c.moveTo(0, rzp(z)); c.lineTo(RW, rzp(z)); }
    c.stroke();
    c.font = '500 7.5px "IW Mono"'; c.fillStyle = 'rgba(160,190,205,0.55)';
    c.fillText('DEAD SEA', rxp(10400), RH - 5); c.fillText('JORDAN', rxp(16900), RH - 5);
    // defended sites
    c.strokeStyle = 'rgba(203,214,220,0.6)'; c.beginPath(); c.arc(rxp(GEO.nevatim.x), rzp(GEO.nevatim.z), GEO.nevatim.r * sc, 0, Math.PI * 2); c.stroke();
    c.fillStyle = sim.townHits ? '#ff5a47' : '#e8eef1'; c.fillRect(rxp(0) - 2.5, rzp(0) - 2.5, 5, 5);
    c.fillStyle = 'rgba(203,214,220,0.7)'; c.fillText('ARAD', rxp(0) + 5, rzp(0) - 4); c.fillText('NEVATIM', rxp(GEO.nevatim.x) - 18, rzp(GEO.nevatim.z) + GEO.nevatim.r * sc + 9);
    // batteries and their reach
    for (const b of sim.batteries) {
      if (b.offstage) continue;
      c.strokeStyle = 'rgba(111,211,255,0.16)'; c.beginPath(); c.arc(rxp(b.x), rzp(b.z), Math.min(BAT[b.type].range, 16000) * sc, 0, Math.PI * 2); c.stroke();
      c.fillStyle = b.reload > 0 ? '#ffb547' : '#6fd3ff'; c.beginPath(); c.moveTo(rxp(b.x), rzp(b.z) - 3); c.lineTo(rxp(b.x) + 3, rzp(b.z) + 2.5); c.lineTo(rxp(b.x) - 3, rzp(b.z) + 2.5); c.fill();
    }
    for (const p of layout.pads) if (!p.battery) { c.strokeStyle = 'rgba(111,211,255,0.5)'; c.setLineDash([1.5, 1.5]); c.strokeRect(rxp(p.x) - 2.5, rzp(p.z) - 2.5, 5, 5); c.setLineDash([]); }
    // tracks
    for (const th of sim.threats) {
      if (!th.alive) continue;
      const x = Math.min(X1 - 3, Math.max(X0 + 3, th.pos.x)), z = th.pos.z, px = rxp(x), pz = rzp(z);
      if (pz < 0 || pz > RH) continue;
      const col = th.type === 'ballistic' ? '#ff5a47' : th.type === 'cruise' ? '#ff8a3d' : '#ffb547';
      c.strokeStyle = col; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(px, pz); c.lineTo(px - th.vel.x * sc * (th.type === 'ballistic' ? 1.2 : 18), pz - th.vel.z * sc * (th.type === 'ballistic' ? 1.2 : 18)); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = col; c.fillRect(px - 1.5, pz - 1.5, th.type === 'ballistic' ? 3.5 : 3, th.type === 'ballistic' ? 3.5 : 3);
    }
    c.fillStyle = '#bfefff';
    for (const it of sim.interceptors) { if (!it.alive || it.pos.x < X0 || it.pos.x > X1) continue; c.fillRect(rxp(it.pos.x) - 0.75, rzp(it.pos.z) - 0.75, 1.5, 1.5); }
    for (const j of sim.jets) { if (!j.alive) continue; c.fillStyle = '#6fd3ff'; c.beginPath(); c.arc(rxp(Math.min(X1, Math.max(X0, j.pos.x))), rzp(j.pos.z), 2, 0, Math.PI * 2); c.fill(); }
    // camera
    camera.getWorldDirection(camDir);
    const cx = rxp(camera.position.x), cz = rzp(camera.position.z), a = Math.atan2(camDir.z, camDir.x);
    c.strokeStyle = 'rgba(232,238,241,0.75)'; c.beginPath(); c.moveTo(cx + Math.cos(a - 0.45) * 12, cz + Math.sin(a - 0.45) * 12); c.lineTo(cx, cz); c.lineTo(cx + Math.cos(a + 0.45) * 12, cz + Math.sin(a + 0.45) * 12); c.stroke();
  }
  rad.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const cam = ctx.systems.camera; if (!cam || !cam.goal) return;
    const b = rad.getBoundingClientRect(), x = X0 + (e.clientX - b.left) / sc, z = Z0 + (e.clientY - b.top) / sc;
    if (cam.mode !== 'tactical') return;
    cam.goal.tx = x; cam.goal.tz = z;
  });

  // ---------------------------------------------------------------- debrief
  function showDebrief(r) {
    const s = r.stats, k = s.killed, L = s.launched;
    const tot = L.drone + L.cruise + L.ballistic, kills = k.drone + k.cruise + k.ballistic;
    const by = s.by || {};
    const layers = [['arrow', 'Arrow 3', by.arrow || 0], ['sling', "David's Sling", by.sling || 0], ['dome', 'Iron Dome', by.dome || 0], ['jet', 'Air patrol', by.aam || 0], ['radar', 'Allies, before the sector', s.coalition + s.sm3]];
    const mx = Math.max(1, ...layers.map((l) => l[2]));
    const win = r.win;
    $('debriefSheet').innerHTML = `
      <div class="k1"><i></i>After-action report · ${fmtClock(sim.clockMinutes())} IDT · 14 April 2024</div>
      <div class="verdict ${win ? 'win' : 'loss'}">${win ? 'The wall held' : 'The wall cracked'}</div>
      <div class="res ${win ? 'win' : 'loss'}">${win ? 'Mission accomplished' : 'Mission failed'} · Iron Wall</div>
      <div class="objs">${sim.objectives.map((o) => `<div class="${o.state}">${ic(o.state === 'done' ? 'check' : 'cross')}${OBJ_LABEL[o.id] || o.text}<small>${o.detail || (o.state === 'done' ? 'complete' : '')}</small></div>`).join('')}</div>
      <div class="grid">
        <div class="stats">
          <div><b>${r.total - r.exposed}/${r.total}</b><span>People sheltered before impact</span></div>
          <div><b style="color:${r.nevatim < 60 ? 'var(--threat)' : r.nevatim < 80 ? 'var(--amber)' : 'var(--good)'}">${Math.round(r.nevatim)}%</b><span>Nevatim Air Base operational</span></div>
          <div><b>${kills}/${tot}</b><span>Threats intercepted in the sector</span></div>
          <div><b>$${Math.round(s.spent)}M</b><span>Cost of the night</span></div>
        </div>
        <div class="layers"><div class="kick">Intercepts by layer</div>${layers.map(([i, n, c]) => `<div class="layer">${ic(i)}<span>${n}</span><u><i style="width:${Math.round(c / mx * 100)}%"></i></u><em>${c}</em></div>`).join('')}</div>
      </div>
      <div class="history"><b>IN HISTORY</b>Iran launched about 170 drones, more than 30 cruise missiles and over 120 ballistic missiles. Israel, the US, Britain, France and Jordan intercepted about 99% of them. A few ballistic missiles struck Nevatim, causing light damage, and the base kept operating. A seven-year-old girl in a Bedouin community near Arad was seriously wounded by shrapnel.</div>
      <div class="acts"><button class="iw-btn primary" data-r="again"><span>Play again</span>${ic('play')}</button><button class="iw-btn" data-r="watch"><span>Watch the sky</span>${ic('radar')}</button></div>`;
    $('debrief').hidden = false;
    $('play').classList.add('dim');
    root.querySelector('[data-r="again"]').onclick = () => location.reload();
    root.querySelector('[data-r="watch"]').onclick = () => { $('debrief').hidden = true; };
  }

  // ---------------------------------------------------------------- intro cards (dt-driven)
  const cards = [[$('c1'), 0.05, 0.3], [$('c2'), 0.36, 0.68], [$('c3'), 0.72, 0.9]];
  function introCards() {
    const u = (ctx.introT || 0) / pacing.introLen;
    for (const [el, a, b] of cards) {
      const f = Math.min(1, Math.max(0, Math.min((u - a) / 0.05, (b - u) / 0.05)));
      const o = f.toFixed(3); if (el.style.opacity !== o) { el.style.opacity = o; el.style.transform = `translateY(${((1 - f) * 8).toFixed(1)}px)`; }
    }
    const t = cards[1][0].querySelector('.t'), w = Math.min(1, Math.max(0, (u - 0.36) / 0.32));
    t.style.letterSpacing = `${(0.3 - 0.2 * (1 - Math.pow(1 - w, 2))).toFixed(3)}em`;
  }

  // ---------------------------------------------------------------- per frame
  function computeLoads() {
    loads.clear();
    for (const s of sim.shelters) loads.set(s.id, s.occ);
    for (const g of info) loads.set(g.shelter, loads.get(g.shelter) + g.n - g.inside);
  }
  let slowAcc = 1, obsAcc = 1, forceSlow = false;
  function refreshSlow() { forceSlow = true; }
  function slowTick() {
    info = sim.groupInfo(); infoById = new Map(info.map((g) => [g.id, g]));
    if (selGroup && (infoById.get(selGroup).status === 'sheltered' || sim.phase !== 'prep' && sim.phase !== 'alert')) selGroup = null;
    computeLoads();
    updateMarkerContent();
    order = markers.slice().sort((a, b) => b.prio - a.prio);
    updatePanels();
    drawRadar();
  }
  const townPos = new THREE.Vector3(0, 0, 0);
  return {
    ready,
    resize() { sizeRoute(); obsAcc = 1; },
    update(dt) {
      T += dt;
      if (ctx.flow === 'intro') { introCards(); return; }
      if (ctx.flow !== 'play') return;
      obsAcc += dt;
      if (obsAcc > 0.5) { obsAcc = 0; readObstacles(); }    // layout reads first, before any write
      slowAcc += dt;
      if (slowAcc >= 0.1 || forceSlow) { slowAcc = 0; forceSlow = false; slowTick(); }
      const townDist = camera.position.distanceTo(townPos);
      placeMarkers(townDist);
      drawRoutes(townDist);
      animateAlert(dt);
      for (const [m, t] of flashes) {
        const nt = t - dt;
        if (nt <= 0) { flashes.delete(m); m.fl.style.opacity = '0'; continue; }
        flashes.set(m, nt); const k = nt / 1.2; m.fl.style.opacity = k.toFixed(2); m.fl.style.transform = `scale(${(1 + (1 - k) * 0.35).toFixed(3)})`;
      }
      if (routeFlashT > 0) routeFlashT = Math.max(0, routeFlashT - dt);
      if (toastT > 0 && (toastT -= dt) <= 0) $('toast').hidden = true;
      if (bannerT > 0 && sim.t > bannerT) { $('banner').hidden = true; bannerT = -1; }
      for (const f of feedItems) { const old = sim.t - f.t > 9; if (old !== !!f.old) { f.old = old; f.d.classList.toggle('old', old); } }
    },
  };
}
