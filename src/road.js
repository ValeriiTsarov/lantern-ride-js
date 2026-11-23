// Проселкова дорога. makeRoute — чиста логіка (симуляція, бот): що де стоїть уздовж траси.
// RoadShape — лише вигляд: як Y траси лягає на мапу. Звивистість — налаштування, на гру не впливає.
// Координати траси: Y — пройдена відстань, x — зсув праворуч від осі своєї дороги.
import { C } from './config.js';
import { makeRng } from './rng.js';
import { TEMPLATES, isFree } from './levelgen.js';

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Зсув відгалуження вбік від основної дороги на висоті Y (0 — поза розвилкою)
export function forkOff(f, Y) {
  if (!f || Y <= f.Y0 || Y >= f.Y1) return 0;
  return f.side * C.FORK_OFF * smooth(f.Y0, f.Y0 + C.FORK_RAMP, Y) * (1 - smooth(f.Y1 - C.FORK_RAMP, f.Y1, Y));
}

export function makeRoute(level) {
  const def = C.ROUTES[Math.min(level, C.ROUTES.length) - 1];
  const rng = makeRng(level * 7919 + 5);
  const n = def.houses, sec = def.len / n;
  const houses = [];
  for (let k = 0; k < n; k++) {
    const final = k === n - 1;
    houses.push({ id: k, Y: final ? def.len : Math.round(sec * (k + 1)), side: final ? 0 : rng() < 0.5 ? -1 : 1, final });
  }
  // розвилки — у різних проміжках між будинками
  const free = [...Array(n).keys()].slice(n > def.forks ? 1 : 0), forks = []; // перший відтинок — без розвилки
  for (let i = 0; i < def.forks && free.length; i++) {
    const s = free.splice(Math.floor(rng() * free.length), 1)[0];
    const room = sec - C.FORK_LEN, jit = Math.max(0, room / 2 - C.FORK_MARGIN);
    const Y0 = Math.round(s * sec + room / 2 + (rng() * 2 - 1) * jit);
    forks.push({ id: 'f' + i, Y0, Y1: Y0 + C.FORK_LEN, side: rng() < 0.5 ? -1 : 1 });
  }
  forks.sort((a, b) => a.Y0 - b.Y0);
  forks.forEach((f, i) => { f.no = i; });

  const route = { level, len: def.len, wispK: def.wisp ?? 1, houses, forks, obstacles: [], coins: [], cans: [] };
  // зони без перешкод: після будинку (продовження), біля розгалуження і злиття
  const clear = [[-1e9, C.SAFE_AFTER_CP]];
  for (const h of houses) clear.push([h.Y - 150, h.Y + C.SAFE_AFTER_CP]);
  for (const f of forks) clear.push([f.Y0 - 500, f.Y0 + 300], [f.Y1 - 350, f.Y1 + 300]);
  genLane(route, rng, 'main', 0, def.len - 200, clear, 0);
  for (const f of forks) genLane(route, rng, f.id, f.Y0 + 300, f.Y1 - 350, [], 0.3);
  route.mainCoins = route.coins.filter(c => c.lane === 'main').length;
  return route;
}

// Перешкоди з шаблонів, монети, каністри на одній дорозі (lane) між lo і hi
function genLane(route, rng, lane, lo, hi, clear, harder) {
  const { level, len } = route;
  const obstacles = [];
  let y = lo, prev = null, uid = 0;
  while (y < hi) {
    const z = clear.find(([a, b]) => y + 400 > a && y < b);
    if (z) { y = z[1]; continue; }
    const p = Math.min(1, 0.9 * y / len + 0.2 * (level - 1) + harder);
    let t = rng.pick(TEMPLATES.filter(t => t.minProgress <= p && t.id !== prev));
    if (t.rects.some(r => r[4] === 'car') && rng() < 0.55) t = TEMPLATES[0]; // машин на проселку мало
    if (y + t.h > hi) break;
    if (clear.some(([a, b]) => y + t.h > a && y < b)) { y += 100; continue; }
    for (const [rx, ry, rw, rh, kind] of t.rects) obstacles.push({ id: `${lane}:${uid++}`, lane, kind, x0: rx, y0: y + ry, x1: rx + rw, y1: y + ry + rh, v: rng() });
    if (t.coins) for (let i = 0; i < C.COIN_LINE; i++) route.coins.push({ id: `${level}:${lane}:${route.coins.length}`, lane, x: t.coins[0], y: y + t.coins[1] + i * C.COIN_STEP });
    prev = t.id;
    y += t.h;
    if (lane === 'main' && rng() < 0.3) y += 600 + 900 * rng(); // відтинок порожньої дороги
  }
  route.obstacles.push(...obstacles);
  const pad = C.BIKE_R + C.CAN_R + 4;
  let cy = lo + C.OIL_EVERY * 0.6 + rng.range(-C.OIL_JITTER, C.OIL_JITTER);
  if (lane !== 'main') cy = (lo + hi) / 2; // на відгалуженні — одна каністра посередині
  while (cy < hi) {
    const xs = [];
    for (let x = -C.ROAD_HALF + 20; x <= C.ROAD_HALF - 20; x += 10) {
      if (isFree(obstacles, x, cy, pad) && isFree(obstacles, x, cy - 40, C.BIKE_R + 4) && isFree(obstacles, x, cy + 40, C.BIKE_R + 4)) xs.push(x);
    }
    if (xs.length) route.cans.push({ id: `${lane}:c${uid++}`, lane, x: rng.pick(xs), y: cy, taken: false });
    if (lane !== 'main') break;
    cy += C.OIL_EVERY + rng.range(-C.OIL_JITTER, C.OIL_JITTER);
  }
}

// Курс траси ψ(Y) (рад, 0 — північ, + — праворуч): хвилюється навколо півночі, тож дорога в'ється, але не закручується.
// curve — сила звивистості (0 — пряма), wave — довжина хвиль. Спільне для вигляду і симуляції (повороти, §4.1).
export function roadPsi(level, Y, curve = 1, wave = 1) {
  return curve * (0.55 * Math.sin(Y / (1500 * wave) + level * 1.7) + 0.35 * Math.sin(Y / (650 * wave) + level * 2.9));
}
// Курс дороги lane з урахуванням відгалуження
export function laneHeading(route, lane, Y, curve = 1, wave = 1) {
  const f = lane && lane !== 'main' ? route.forks.find(q => q.id === lane) : null;
  let a = roadPsi(route.level, Y, curve, wave);
  if (f) a += Math.atan((forkOff(f, Y + 5) - forkOff(f, Y - 5)) / 10);
  return a;
}

// Вигляд траси на мапі за курсом ψ(Y).
export class RoadShape {
  constructor(route, curve = 1, wave = 1) {
    this.route = route;
    this.step = 10;
    this.y0 = -3000;
    const n = Math.ceil((route.len + 6000) / this.step) + 1;
    this.X = new Float32Array(n); this.Y = new Float32Array(n); this.P = new Float32Array(n);
    const psi = (Y) => roadPsi(route.level, Y, curve, wave);
    let x = 0, y = 0;
    const i0 = Math.round(-this.y0 / this.step);
    this.X[i0] = 0; this.Y[i0] = 0; this.P[i0] = psi(0);
    for (let i = i0 + 1; i < n; i++) { // уперед від старту
      const a = psi(this.y0 + (i - 0.5) * this.step);
      x += Math.sin(a) * this.step; y += Math.cos(a) * this.step;
      this.X[i] = x; this.Y[i] = y; this.P[i] = psi(this.y0 + i * this.step);
    }
    x = 0; y = 0;
    for (let i = i0 - 1; i >= 0; i--) { // назад від старту
      const a = psi(this.y0 + (i + 0.5) * this.step);
      x -= Math.sin(a) * this.step; y -= Math.cos(a) * this.step;
      this.X[i] = x; this.Y[i] = y; this.P[i] = psi(this.y0 + i * this.step);
    }
  }
  fork(lane) { return lane && lane !== 'main' ? this.route.forks.find(f => f.id === lane) : null; }
  // точка на дорозі lane: out.X (схід), out.Y (північ), out.hx/hy — напрям руху
  at(Y, x = 0, lane = 'main', out = {}) {
    const f = this.fork(lane);
    const lat = x + forkOff(f, Y);
    const t = Math.min(this.X.length - 1.001, Math.max(0, (Y - this.y0) / this.step));
    const i = Math.floor(t), k = t - i;
    const X = this.X[i] + (this.X[i + 1] - this.X[i]) * k, Yw = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * k;
    let a = this.P[i] + (this.P[i + 1] - this.P[i]) * k;
    const hx0 = Math.sin(a), hy0 = Math.cos(a);
    out.X = X + hy0 * lat; out.Y = Yw - hx0 * lat;
    if (f) a += Math.atan((forkOff(f, Y + 5) - forkOff(f, Y - 5)) / 10);
    out.hx = Math.sin(a); out.hy = Math.cos(a);
    return out;
  }
}
