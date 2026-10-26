// Offline audio evidence for critics (who cannot listen): renders the mix for a sim-time window
// with window.__slice.audioOffline() in a seeded headless run, then analyses the WAV.
// Usage:
//   node tools/audio-render.mjs --t0 150 --t1 190 --out status/audio/audio-r1/alert [--cam S4-alert] [--seed 1]
// Writes <out>/audio.wav, spectrogram.png (event markers: emission = solid, arrival after the
// speed-of-sound delay = dashed), report.json (peak/true-peak dBFS, approx. integrated loudness,
// clipping, siren pitch contour, onset-vs-event alignment, voice counts) and meta.json (the
// renderer's own schedule: every event with distance, delay, level, and whether it was voiced).
// The browser holds the render lock only while it runs; the analysis runs after release.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, withRenderLock, launch, args, openSlice, SLICE } from './lib.mjs';

const a = args();
const t0 = +(a.t0 ?? 150), t1 = +(a.t1 ?? 190);
const cam = a.cam || (t0 >= 200 && t0 < 290 ? 'S5-street' : 'S4-alert');
const out = path.resolve(a.out || path.join(SLICE, '.capture', `audio-${t0}-${t1}`));
fs.mkdirSync(out, { recursive: true });

let res;
await withRenderLock(async () => {
  const { srv, url } = await serve();
  const browser = await launch();
  try {
    const q = new URLSearchParams({ seed: a.seed || '1', q: 'low', ui: '0', capture: '1', nointro: '1' });
    const { page, logs } = await openSlice(browser, url, { w: 320, h: 180, query: q.toString() });
    const t = Date.now();
    res = await page.evaluate(async ({ t0, t1, cam }) => {
      const S = window.__slice;
      S.seek(t1, 2);
      const { SHOTS } = await import('/src/core/shots.js');
      const shot = SHOTS[cam];
      if (shot) { S.ctx.shot = shot; S.ctx.bus.emit('shot', { name: cam, shot }); }
      for (let i = 0; i < 3; i++) S.frame(1 / 30, false);
      const c = S.ctx.camera;
      const b64 = await S.audioOffline(t0, t1, { listener: 'camera' });
      const marks = S.ctx.bus.log.filter((e) => typeof e.t === 'number' && e.t >= t0 - 60 && e.t <= t1 && ['alert:early', 'alert:start', 'alert:impactWindow', 'alert:end', 'allclear', 'salvo:start', 'salvo:end'].includes(e.type)).map((e) => ({ type: e.type, t: e.t, id: e.id }));
      return { b64, meta: S.audioMeta, marks, listener: { x: c.position.x, y: c.position.y, z: c.position.z } };
    }, { t0, t1, cam });
    res.renderSeconds = (Date.now() - t) / 1000;
    res.consoleErrors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
    await page.close();
  } finally { await browser.close(); srv.close(); }
}, { label: `audio-render ${t0}-${t1}` });

fs.writeFileSync(path.join(out, 'audio.wav'), Buffer.from(res.b64, 'base64'));
const meta = { ...res.meta, cam, listenerPos: res.listener, marks: res.marks, renderSeconds: res.renderSeconds, consoleErrors: res.consoleErrors };
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));
console.error(`[audio-render] rendered ${t1 - t0}s in ${res.renderSeconds}s, analysing...`);


// ------------------------------------------------------------------------------------------
var PY = String.raw`
import sys, os, json
import numpy as np
from scipy.io import wavfile
from scipy import signal
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

out = sys.argv[1]
meta = json.load(open(os.path.join(out, 'meta.json')))
sr, x = wavfile.read(os.path.join(out, 'audio.wav'))
x = x.astype(np.float64) / 32768.0
if x.ndim == 1: x = x[:, None]
t0 = meta['t0']; n = len(x); dur = n / sr
mono = x.mean(axis=1)
db = lambda v: float(20 * np.log10(max(v, 1e-12)))

# ---- levels
peak = float(np.max(np.abs(x)))
tp = max(float(np.max(np.abs(signal.resample_poly(x[:, c], 4, 1)))) for c in range(x.shape[1]))
clips = int(np.sum(np.abs(x) >= 0.999))
# BS.1770 K-weighting (48 kHz coefficients) + gating
def kweight(ch):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, ch))
kw = np.stack([kweight(x[:, c]) for c in range(x.shape[1])], 1)
def blocks(win, hop):
    W, H = int(win * sr), int(hop * sr); res = []
    for s in range(0, max(1, n - W + 1), H):
        ms = np.mean(kw[s:s + W] ** 2, axis=0).sum(); res.append((s / sr, -0.691 + 10 * np.log10(max(ms, 1e-12))))
    return res
mom = blocks(0.4, 0.1)
L = np.array([v for _, v in mom])
g1 = L[L > -70]
lufs = None
if len(g1):
    rel = 10 * np.log10(np.mean(10 ** (g1 / 10))) - 10
    g2 = g1[g1 > rel]; lufs = float(10 * np.log10(np.mean(10 ** (g2 / 10))))
st = blocks(3.0, 0.5); S = np.array([v for _, v in st])
Sg = S[S > -70]
lra = float(np.percentile(Sg, 95) - np.percentile(Sg, 10)) if len(Sg) > 2 else None

# ---- spectrogram
nfft, hop = 4096, 512
f, tt, Z = signal.stft(mono, sr, nperseg=nfft, noverlap=nfft - hop, boundary=None)
P = 20 * np.log10(np.abs(Z) + 1e-9)
tt = tt + t0

# ---- siren pitch contour (measured from the WAV): dominant 270-1000 Hz peak while the Arad
# poles sound, restricted to frames where that band dominates
sir = [s for s in meta.get('sirens', []) if s['name'].startswith('Arad')]
siren = None
if sir:
    s0 = t0 + max(0.0, min(s['outT'] for s in sir) + 4.0); s1 = t0 + min(dur, min(s['endOutT'] for s in sir) - 4.0)
    if s1 - s0 > 6:
        band = (f >= 270) & (f <= 1000)
        sel = (tt >= s0) & (tt <= s1)
        Pb = np.abs(Z[band][:, sel]); fb = f[band]
        k = np.argmax(Pb, axis=0)
        # parabolic interpolation
        fr = []
        for j, i in enumerate(k):
            if 0 < i < len(fb) - 1:
                a_, b_, c_ = np.log(Pb[i - 1, j] + 1e-12), np.log(Pb[i, j] + 1e-12), np.log(Pb[i + 1, j] + 1e-12)
                p_ = 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ + 1e-12); fr.append(fb[i] + p_ * (fb[1] - fb[0]))
            else: fr.append(fb[i])
        fr = np.array(fr); ts = tt[sel]
        fm = signal.medfilt(fr, 5)
        y = fm - fm.mean(); ac_ = np.correlate(y, y, 'full')[len(y) - 1:]; dt_ = ts[1] - ts[0]
        lo, hi = int(2.5 / dt_), min(len(ac_) - 1, int(8 / dt_))
        per = float((lo + np.argmax(ac_[lo:hi])) * dt_) if hi > lo else None
        design = [s for s in meta['sirens'] if s['name'] == 'Arad centre'][0]
        siren = {'window': [round(float(s0), 2), round(float(s1), 2)], 'minHz': round(float(np.percentile(fm, 3)), 1), 'maxHz': round(float(np.percentile(fm, 97)), 1),
                 'periodS': round(per, 3) if per else None, 'design': {'fLo': design['fLo'], 'fHi': design['fHi'], 'period': design['period']},
                 'contour': {'t': [round(float(v), 2) for v in ts[::4]], 'hz': [round(float(v), 1) for v in fm[::4]]}}
        sirenTrace = (ts, fm)

# ---- onsets vs scheduled arrivals: spectral flux (log magnitude), low band (booms) + broadband
mag = np.log1p(np.abs(Z) * 50)
flux = np.maximum(0, np.diff(mag, axis=1)).sum(axis=0); flux = np.concatenate([[0], flux])
lowb = f < 300
fl_low = np.concatenate([[0], np.maximum(0, np.diff(mag[lowb], axis=1)).sum(axis=0)])
def peaks(env, thr):
    e = (env - np.median(env)) / (np.std(env) + 1e-9)
    pk, _ = signal.find_peaks(e, height=thr, distance=3)
    return tt[pk]
onsets = np.unique(np.concatenate([peaks(flux, 2.5), peaks(fl_low, 2.5)]))
ev = [e for e in meta['events'] if e.get('scheduled') and e['type'] in ('launch', 'intercept', 'impact') and 0 <= e['outT'] <= dur]
align = []
for e in ev:
    ta = t0 + e['outT']
    cand = onsets[(onsets >= ta - 0.08) & (onsets <= ta + 0.25)]
    m = float(cand[np.argmin(np.abs(cand - ta))]) if len(cand) else None
    align.append({'type': e['type'], 'kind': e['kind'], 'emitT': e['te'], 'distM': e['d'], 'expectedDelayS': round(e['d'] / 343.0, 3), 'expectedArrivalT': round(ta, 3),
                  'detectedOnsetT': round(m, 3) if m else None, 'errorMs': round((m - ta) * 1000, 1) if m else None, 'levelDb': e.get('levelDb')})
matched = [a for a in align if a['errorMs'] is not None]
audible = [a for a in align if (a['levelDb'] or -99) > -40]
am = [a for a in audible if a['errorMs'] is not None]

# ---- figure
fig = plt.figure(figsize=(18, 8.6), dpi=100)
ax = fig.add_axes([0.05, 0.36, 0.84, 0.58])
fmask = (f >= 25) & (f <= 16000)
vmax = np.percentile(P[fmask], 99.7)
ax.pcolormesh(tt, f[fmask], P[fmask], shading='auto', cmap='magma', vmin=vmax - 80, vmax=vmax)
ax.set_yscale('log'); ax.set_ylim(25, 16000); ax.set_xlim(t0, t0 + dur)
ax.set_ylabel('Hz'); ax.set_title('Iron Wall audio, sim %.1f-%.1f s, listener %s at (%d, %d, %d) m [%s]  |  solid = emission, dashed = arrival (d/343 m/s)' % (t0, t0 + dur, meta['cam'], meta['listenerPos']['x'], meta['listenerPos']['y'], meta['listenerPos']['z'], meta['listener']), fontsize=10)
col = {'alert:start': '#ff3030', 'alert:early': '#ff9a3c', 'alert:impactWindow': '#ff60c0', 'alert:end': '#a0a0ff', 'allclear': '#40ff80', 'salvo:start': '#ffb000', 'salvo:end': '#ffd870'}
for mk in meta['marks']:
    if t0 <= mk['t'] <= t0 + dur:
        ax.axvline(mk['t'], color=col.get(mk['type'], 'w'), lw=1.6); ax.text(mk['t'], 13000, ' ' + mk['type'] + (' %s' % mk['id'] if mk.get('id') else ''), color=col.get(mk['type'], 'w'), fontsize=8, rotation=90, va='top')
ecol = {'impact': '#ffffff', 'intercept': '#00e5ff', 'launch': '#7CFC00'}
for e in meta['events']:
    if not e.get('scheduled') or e['type'] not in ecol: continue
    ta = t0 + e['outT']; te = e['te']
    if t0 <= ta <= t0 + dur:
        ax.axvline(ta, ymin=0, ymax=0.12 if e['type'] == 'launch' else 0.3, color=ecol[e['type']], lw=1.0, ls='--', alpha=0.9)
    if t0 <= te <= t0 + dur and e['type'] != 'launch':
        ax.axvline(te, ymin=0.88, ymax=1.0, color=ecol[e['type']], lw=1.0, alpha=0.9)
for s in meta.get('sirens', []):
    ta = t0 + s['outT']
    if t0 <= ta <= t0 + dur: ax.annotate('siren ' + s['name'] + ' (+%.1fs)' % s['delay'], (ta, 340), color='#ff8080', fontsize=7, rotation=90, va='bottom')
if siren: ax.plot(sirenTrace[0], sirenTrace[1], color='cyan', lw=0.6, alpha=0.6)
from matplotlib.lines import Line2D
ax.legend(handles=[Line2D([], [], color='#ffffff', ls='--', label='impact arrival'), Line2D([], [], color='#00e5ff', ls='--', label='intercept arrival'), Line2D([], [], color='#7CFC00', ls='--', label='launch arrival'), Line2D([], [], color='cyan', label='measured siren pitch')], loc='lower right', fontsize=8, framealpha=0.4)
ax2 = fig.add_axes([0.05, 0.07, 0.84, 0.24], sharex=ax)
ax2.plot([t0 + a for a, _ in mom], [v for _, v in mom], color='#4a90d9', lw=0.6, label='momentary LUFS (400 ms)')
ax2.plot([t0 + a + 1.5 for a, _ in st], [v for _, v in st], color='#e0a030', lw=1.4, label='short-term LUFS (3 s)')
ax2.set_ylim(-60, 0); ax2.set_ylabel('LUFS'); ax2.set_xlabel('sim time (s)'); ax2.grid(alpha=0.3)
ax3 = ax2.twinx()
vt = meta['stats']['voiceTimeline']
if vt:
    ax3.step([t0 + a for a, _ in vt], [k for _, k in vt], where='post', color='#c050ff', lw=0.9, label='one-shot voices')
ax3.set_ylim(0, 50); ax3.set_ylabel('voices (cap 48)')
for o in onsets: ax2.axvline(o, ymin=0.9, ymax=1, color='k', lw=0.6)
ax2.legend(loc='upper left', fontsize=8); ax3.legend(loc='upper right', fontsize=8)
fig.text(0.895, 0.93, 'peak %.1f dBFS\ntrue peak %.1f dBTP\nclipped %d\nintegrated %s LUFS\nLRA %s LU\nmax voices %d\nstolen %d dropped %d' % (db(peak), db(tp), clips, '%.1f' % lufs if lufs is not None else '-', '%.1f' % lra if lra is not None else '-', meta['maxConcurrentVoices'], meta['stats']['stolen'], meta['stats']['dropped']), fontsize=9, va='top', family='monospace')
fig.savefig(os.path.join(out, 'spectrogram.png'))

skipped = {}
for e in meta['events']:
    if not e.get('scheduled'): skipped[e.get('why', '?')] = skipped.get(e.get('why', '?'), 0) + 1
rep = {
    'window': [t0, t0 + dur], 'listener': {'cam': meta['cam'], 'pos': meta['listenerPos'], 'mode': meta['listener']},
    'peakDbfs': round(db(peak), 2), 'truePeakDbtp': round(db(tp), 2), 'clippedSamples': clips,
    'integratedLufsApprox': round(lufs, 1) if lufs is not None else None, 'loudnessRangeLuApprox': round(lra, 1) if lra is not None else None,
    'maxShortTermLufs': round(float(S.max()), 1) if len(S) else None,
    'siren': siren, 'sirenSchedule': meta.get('sirens'),
    'onsetAlignment': {'note': 'expected arrival = emission + distance/343 m/s (solved for the moving listener); detected = nearest spectral-flux onset in [-80, +250] ms. Overlapping sounds mask some onsets.',
                       'events': len(align), 'matched': len(matched), 'audibleAbove-40dB': len(audible), 'audibleMatched': len(am),
                       'medianAbsErrorMs': round(float(np.median([abs(a['errorMs']) for a in matched])), 1) if matched else None, 'detail': align},
    'voices': {'maxConcurrentTotal': meta['maxConcurrentVoices'], 'maxOneShots': meta['stats']['maxConc'], 'cap': meta['stats']['cap'], 'stolen': meta['stats']['stolen'], 'dropped': meta['stats']['dropped'],
               'sirens': len(meta.get('sirens', [])), 'movers': meta.get('movers')},
    'eventsNotVoiced': skipped, 'beats': meta.get('beats'), 'renderSeconds': meta['renderSeconds'], 'consoleErrors': meta['consoleErrors'],
}
json.dump(rep, open(os.path.join(out, 'report.json'), 'w'), indent=1)
print(json.dumps({k: rep[k] for k in ('peakDbfs', 'truePeakDbtp', 'clippedSamples', 'integratedLufsApprox', 'loudnessRangeLuApprox')}), 'siren', siren and {k: siren[k] for k in ('minHz', 'maxHz', 'periodS')}, 'align', rep['onsetAlignment']['matched'], '/', rep['onsetAlignment']['events'], 'voices', rep['voices']['maxConcurrentTotal'], 'errors', len(meta['consoleErrors']))
`;

execFileSync('python3', ['-I', '-c', PY, out], { stdio: 'inherit' });
console.log(`wav: ${path.join(out, 'audio.wav')}\nspectrogram: ${path.join(out, 'spectrogram.png')}\nreport: ${path.join(out, 'report.json')}`);
