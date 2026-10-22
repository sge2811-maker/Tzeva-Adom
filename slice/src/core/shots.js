// Canonical critic shots. Critics compare these frames round over round, so do NOT change an
// existing shot's time or camera without telling the integrator; add new shots instead.
// cam.mode: 'pose' (fixed pos/look/fov) or 'tactical' (rig target/dist/yaw/pitch).
// yaw: 0 = camera west of the target looking east (toward Jordan); pitch: radians above horizon.
// Times are sim seconds with seed=1 and the 'good' autopilot (see sim/demo.js).
export const SHOTS = {
  'S1-intro': { flow: 'intro', introT: 11, desc: 'Intro flyover: climbing the escarpment, Arad appears' },
  'S2-tactical': { t: 58, cam: { mode: 'tactical', target: [250, 0], dist: 2600, yaw: 0.35, pitch: 0.62 }, desc: 'Prep phase, default RTS camera over Arad, drones inbound from the east' },
  'S3-drones': { t: 78, cam: { mode: 'pose', pos: [860, 24, -30], look: [6400, -110, 300], fov: 48 }, desc: 'From the lookout: Iron Dome kills Shahed drones over the escarpment, Dead Sea and Moab beyond' },
  'S4-alert': { t: 170, cam: { mode: 'tactical', target: [90, 10], dist: 330, yaw: 0.45, pitch: 0.48 }, desc: 'Red alert +10 s: people running to the Avenue shelter, countdown HUD' },
  'S4b-alert-wide': { t: 175, cam: { mode: 'tactical', target: [150, 0], dist: 1500, yaw: 0.2, pitch: 0.7 }, desc: 'Red alert +15 s: routing overview, groups, locked shelters, route lines' },
  'S5-street': { t: 251.4, cam: { mode: 'pose', pos: [-60, 2.6, -40], look: [-300, 2600, 3400], fov: 72 }, desc: "Street level looking south and up: David's Sling intercepts overhead, debris falling" },
  'S6-salvo': { t: 222.4, cam: { mode: 'pose', pos: [-1600, 90, 500], look: [9000, 3600, 200], fov: 64 }, desc: 'Skyline: Arrow 3 exo-atmospheric intercepts high over the Dead Sea' },
  'S7-aftermath': { t: 312, cam: { mode: 'tactical', target: [-2600, 1300], dist: 4200, yaw: -0.25, pitch: 0.4 }, desc: 'All-clear: smoke over Nevatim, people leaving shelters' },
  'S8-debrief': { t: 330, cam: { mode: 'tactical', target: [0, 0], dist: 2400, yaw: 0.2, pitch: 0.5 }, desc: 'Debrief screen over the town' },
};
// Short captures (frame sequences) for motion-dependent streams: start t, seconds, fps, camera from a shot
export const CLIPS = {
  'C1-arrow': { t: 216, len: 9, fps: 12, cam: 'S6-salvo', desc: 'Salvo 1: Arrow 3 intercepts high over the Dead Sea' },
  'C2-alert-beat': { t: 157, len: 12, fps: 12, cam: 'S4-alert', desc: 'Early warning -> siren -> people start running' },
  'C3-drone-kill': { t: 72, len: 10, fps: 12, cam: 'S3-drones', desc: 'Iron Dome vs drones over the escarpment' },
  'C4-overhead': { t: 247, len: 10, fps: 12, cam: 'S5-street', desc: 'Sling intercepts overhead, debris falling on the town' },
};
