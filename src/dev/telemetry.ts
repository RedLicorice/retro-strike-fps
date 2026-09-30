/* Dev-only telemetry: forwards console problems, periodic game-state samples and detected anomalies
   to the Vite dev server (.telemetry/log.jsonl). Press F9 in game to drop a marker with full state.
   Everything here is a no-op in production builds. */

type Ev = { kind: string; [k: string]: any };
const queue: Ev[] = [];
let installed = false;
const session = Math.random().toString(36).slice(2, 8);

export function track(kind: string, data: Record<string, any> = {}){
  if (!import.meta.env.DEV) return;
  queue.push({ kind, s: session, ms: Math.round(performance.now()), ...data });
  if (queue.length > 400) queue.splice(0, queue.length - 400);
}

function flush(beacon = false){
  if (!queue.length) return;
  const body = JSON.stringify(queue.splice(0));
  if (beacon && navigator.sendBeacon) navigator.sendBeacon('/__telemetry', body);
  else fetch('/__telemetry', { method: 'POST', body, keepalive: true }).catch(() => {});
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/* `game` is a getter so this module never imports gameplay code (no cycles, nothing pulled into prod) */
export function installTelemetry(game: () => any){
  if (!import.meta.env.DEV || installed) return;
  installed = true;

  /* ---- console + errors ---- */
  for (const level of ['error', 'warn'] as const){
    const orig = console[level].bind(console);
    console[level] = (...args: any[]) => {
      orig(...args);
      track('console.' + level, { msg: args.map(a => a instanceof Error ? a.stack || a.message : typeof a === 'object' ? safe(a) : String(a)).join(' ').slice(0, 2000) });
    };
  }
  addEventListener('error', e => track('error', { msg: e.message, src: e.filename + ':' + e.lineno + ':' + e.colno, stack: e.error && e.error.stack }));
  addEventListener('unhandledrejection', e => track('rejection', { msg: String(e.reason && (e.reason.stack || e.reason)) }));

  /* ---- state sampler (1 Hz while playing) + anomaly watcher (4 Hz) ---- */
  const last: Record<string, number> = {};
  const anomaly = (kind: string, data: any) => {
    const t = performance.now();
    if (last[kind] && t - last[kind] < 2000) return;       /* throttle per kind */
    last[kind] = t;
    track('anomaly.' + kind, { ...data, state: snapshot(game()) });
  };
  setInterval(() => {
    const g = game(); if (!g || !g.Game || g.Game.state !== 'play') return;
    const P = g.Player, M = g.MAP, c = g.ctx.cam;
    if (!P.alive) return;
    const ground = M.groundAt(P.pos.x, P.pos.z, P.pos.y + .5, 1);
    if (P.pos.y < -.3 || P.pos.y < ground - .4) anomaly('below-ground', { y: r2(P.pos.y), ground: r2(ground) });
    const inBox = (x: number, y: number, z: number) => M.boxes.find((b: any) => x > b.x0 + .02 && x < b.x1 - .02 && z > b.z0 + .02 && z < b.z1 - .02 && y > b.y0 + .02 && y < b.y1 - .02);
    const b = inBox(P.pos.x, P.pos.y + .9, P.pos.z) || inBox(P.pos.x, P.pos.y + .3, P.pos.z);
    if (b) anomaly('inside-geometry', { box: [b.x0, b.y0, b.z0, b.x1, b.y1, b.z1].map(r2), mat: b.mat });
    const cb = inBox(c.position.x, c.position.y, c.position.z);
    if (cb) anomaly('camera-in-geometry', { cam: c.position.asArray().map(r2), box: [cb.x0, cb.y0, cb.z0, cb.x1, cb.y1, cb.z1].map(r2), mat: cb.mat });
    if (P.vel.y < -18) anomaly('falling-fast', { vy: r2(P.vel.y) });
  }, 250);
  setInterval(() => { const g = game(); if (g && g.Game && g.Game.state === 'play') track('sample', snapshot(g)); }, 1000);

  /* ---- F9 marker ---- */
  addEventListener('keydown', e => {
    if (e.code !== 'F9') return;
    e.preventDefault();
    track('marker', { state: snapshot(game()), note: 'F9 pressed by player' });
    flush();
    const t = document.createElement('div');
    t.textContent = 'TELEMETRY MARKER SENT';
    t.style.cssText = 'position:fixed;left:50%;top:20%;transform:translateX(-50%);z-index:99999;background:#9be36b;color:#000;font:bold 14px monospace;padding:6px 12px';
    document.body.appendChild(t); setTimeout(() => t.remove(), 1400);
  });

  setInterval(() => flush(), 1000);
  addEventListener('pagehide', () => flush(true));
  track('session', { ua: navigator.userAgent, w: innerWidth, h: innerHeight });
}

function snapshot(g: any){
  if (!g || !g.Player) return null;
  const P = g.Player, M = g.MAP, c = g.ctx.cam, W = g.Wep;
  let ground = null;
  try { ground = r2(M.groundAt(P.pos.x, P.pos.z, P.pos.y + .5, 1)); } catch {}
  return {
    game: g.Game.state, mode: g.Game.mode, seed: M.seed,
    pos: [P.pos.x, P.pos.y, P.pos.z].map(r2), vel: [P.vel.x, P.vel.y, P.vel.z].map(r2), ground,
    yaw: r2(P.yaw), pitch: r2(P.pitch), alive: P.alive, onGround: P.onGround, stance: P.stance, sliding: r2(P.sliding),
    view3p: r2(g.ctx.view3p), cam: c ? c.position.asArray().map(r2) : null,
    wpn: W.def && W.def.id, fps: Math.round(g.ctx.engine.getFps()), actors: g.Game.actors.length
  };
}

function safe(o: any){ try { return JSON.stringify(o).slice(0, 800); } catch { return String(o); } }
