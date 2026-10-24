// Mission pacing. Owned by the camera & game-feel stream (beat timing), read by the sim.
// All times are sim seconds after the player deploys (t = 0 is 23:00 IDT on 13 April 2024).
// The real attack was timed so drones, cruise and ballistic missiles arrived together; the slice
// compresses the ~3 hour night into ~5.5 minutes while keeping that order and convergence.
export const PACING = {
  introLen: 24,            // camera flyover before deploy (real seconds, sim frozen)

  // displayed IDT clock: piecewise-linear map from sim t to minutes after 00:00 on the 13th
  clock: [[0, 1380], [150, 1530], [235, 1542], [285, 1549], [310, 1565], [340, 1572]],

  drones: {
    waves: [[8, 4], [18, 4], [30, 4], [48, 4], [70, 3], [95, 3], [150, 2]], // [t, count]
    speed: 160, agl: 300, spawnX: [13000, 16500], spawnZ: [-6500, 6500],
  },
  coalitionScreen: { from: 16, to: 132, every: [4, 8] }, // distant allied kills over Jordan
  airPatrol: { readyAt: 20, cooldown: 75, duration: 32 },
  cruise: { t: 112, n: 5, gap: 3.2, speed: 280, agl: 140, spawnX: 24000 },
  resupplyAt: 134, resupplyAmount: 80,
  ballisticLaunchMsg: 128,
  earlyWarning: 142,
  sm3Screen: 186,

  alertAt: 160,            // Tzeva Adom sounds in Arad
  countdown: 75,           // siren -> first impact window (the "time to protected space")
  ballisticFlight: 30,     // sector entry -> impact
  salvos: [
    { enter: 205, n: 13, errant: 0 },
    { enter: 222, n: 15, errant: 1 },
    { enter: 241, n: 11, errant: 1 },
  ],
  // Beat timing (camera & game-feel stream): no stretch without a beat longer than ~20 s.
  // Hold 274 -> 294 (HUD all-clear countdown), all-clear 294 -> debrief 313.5. Keeps S7-aftermath
  // (t 312) in the aftermath with people out of the shelters, and S8-debrief (t 330) on the debrief.
  shelterHold: 20,         // "stay inside for 10 minutes", compressed (was 26)
  aftermath: 19.5,         // all-clear -> debrief (was 24)
};

export function firstImpactT(p = PACING) { return p.alertAt + p.countdown; }

export function clockMinutes(t, p = PACING) {
  const c = p.clock;
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) { const [t0, m0] = c[i - 1], [t1, m1] = c[i]; return m0 + (m1 - m0) * (t - t0) / (t1 - t0); }
  }
  const [tl, ml] = c[c.length - 1];
  return ml + (t - tl) * 0.25;
}
