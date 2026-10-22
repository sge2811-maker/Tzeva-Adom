// Autopilot "player" used for attract mode, critic shots and captures.
//   good: deploys sensibly, calls the air patrol, opens the locked shelters and reroutes the
//         evening walkers at the siren (shows the intended play)
//   bad:  does nothing (verifies the loss path)
export function createDemo(sim, mode = 'good') {
  if (mode === 'off' || !mode) return { step() {} };
  const P = sim.pacing;
  const plan = mode === 'bad' ? [] : [
    { t: 3, c: ['build', { pad: 'AE', type: 'dome' }] },
    { t: 6, c: ['build', { pad: 'AN', type: 'sling' }] },
    { t: 10, c: ['build', { pad: 'NW', type: 'sling' }] },
    { t: 46, c: ['route', { group: 'G7', shelter: 'S7' }] },
    { t: P.airPatrol.readyAt + 24, c: ['airPatrol', { x: 9500, z: -1200 }] },
    { t: P.alertAt + 1.5, c: ['unlock', { shelter: 'S1' }] },
    { t: P.alertAt + 3.0, c: ['unlock', { shelter: 'S5' }] },
  ];
  let i = 0;
  return {
    plan,
    step() {
      while (i < plan.length && plan[i].t <= sim.t) { const [n, a] = plan[i++].c; sim.cmd(n, { ...a, by: 'demo' }); }
    },
  };
}
