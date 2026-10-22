// Event bus. Sim events carry sim time in `t`; every emit is also appended to `bus.log`
// (used by the offline audio renderer, captures and tests). See docs/BRIEF.md for the event contract.
export function createBus() {
  const map = new Map();
  const any = new Set();
  const bus = {
    log: [],
    logEnabled: true,
    on(type, fn) {
      if (type === '*') { any.add(fn); return () => any.delete(fn); }
      let s = map.get(type);
      if (!s) map.set(type, (s = new Set()));
      s.add(fn);
      return () => s.delete(fn);
    },
    once(type, fn) {
      const off = bus.on(type, (p) => { off(); fn(p); });
      return off;
    },
    emit(type, payload = {}) {
      if (bus.logEnabled) bus.log.push({ type, ...payload });
      const s = map.get(type);
      if (s) for (const fn of [...s]) {
        try { fn(payload, type); } catch (e) { console.error(`[bus] ${type} handler failed`, e); }
      }
      for (const fn of [...any]) {
        try { fn(payload, type); } catch (e) { console.error('[bus] * handler failed', e); }
      }
    },
  };
  return bus;
}
