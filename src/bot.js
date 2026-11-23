// §15 Автоматичний бот: тримається вільного проходу, світить фарою на Вогники, збирає батарейки, тікає від Тіні.
import { C } from './config.js';
import { isFree } from './levelgen.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function botInput(sim) {
  const b = sim.bike, by = sim.bikeWY;
  const chased = sim.wisps.some(w => w.y < by - 10 && by - w.y < 260);
  const danger = sim.shade || sim.shadeWarn >= 0 || chased;
  const wantY = danger ? 450 : 320;
  const look = sim.speed * 1.1 + 70;
  const obs = sim.laneObstacles(by - 30, by + look + 40);
  const xLim = C.SIDEWALK_HALF - C.BIKE_R - 2;

  // ціль по X
  let goal = 0, goalW = 0;
  const cans = sim.cans.filter(c => !c.taken && c.y > by + 10 && c.y < by + 500);
  if (sim.flareCan && !sim.flareCan.taken) cans.unshift(sim.flareCan);
  if (cans.length && sim.oil < 92) { cans.sort((a, c) => a.y - c.y); goal = cans[0].x; goalW = 3; }
  let nearW = null, nd = 1e9;
  for (const w of sim.wisps) {
    const d = Math.hypot(w.x - b.x, w.y - by);
    if (d < nd && w.y > by - 40) { nd = d; nearW = w; }
  }
  if (nearW && nd < 240) { goal = nearW.x + Math.sign(nearW.x - b.x) * 30; goalW = 4; }
  // розвилка: на непарних з'їжджаємо на відгалуження (перевіряємо обидві дороги)
  const f = sim.pendingFork;
  if (f && f.Y0 - by < 420) { goal = f.no % 2 ? f.side * C.LANE_T * 1.8 : -f.side * 20; goalW = 8; }

  // кандидати по X, вільні на дистанції look
  let best = b.x, bestCost = 1e9;
  for (let x = -xLim; x <= xLim; x += 6) {
    let ok = true;
    for (let yy = by - 10; yy <= by + look; yy += 12) {
      if (!isFree(obs, x, yy, C.BIKE_R + 7)) { ok = false; break; }
    }
    // маршрут від поточного x до кандидата не має перетинати перешкоду поблизу
    if (ok) {
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        const px = b.x + (x - b.x) * s / steps;
        const py = by + Math.abs(x - b.x) / C.BIKE_VX_MAX * sim.speed * s / steps * 1.5;
        if (!isFree(obs, px, py, C.BIKE_R + 5)) { ok = false; break; }
      }
    }
    if (!ok) continue;
    let cost = Math.abs(x - b.x) * 0.6 + Math.abs(x - goal) * (goalW || 0.3);
    if (Math.abs(x) > C.ROAD_HALF - C.BIKE_R) cost += 400; // не їдемо тротуаром
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  const ax = clamp((best - b.tx) / 20, -1, 1);
  const ay = clamp((wantY - b.ty) / 20, -1, 1);
  return { ax, ay };
}
