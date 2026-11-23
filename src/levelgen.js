// §5.2 Генерація з шаблонів. Чиста логіка, без рендеру.
import { C } from './config.js';

// Прямокутник: [x, y, ширина, висота] від лівого нижнього кута шаблону (x від −140 до +140).
export const TEMPLATES = [
  { id: 'empty', h: 400, minProgress: 0, rects: [], coins: [0, 100] },
  { id: 'car-left', h: 400, minProgress: 0, rects: [[-140, 150, 120, 70, 'car']], coins: [80, 120] },
  { id: 'car-right', h: 400, minProgress: 0, rects: [[20, 150, 120, 70, 'car']], coins: [-80, 120] },
  { id: 'bins-center', h: 400, minProgress: 0.2, rects: [[-40, 180, 80, 40, 'bins']], coins: null },
  { id: 'slalom', h: 600, minProgress: 0.4, rects: [[-140, 100, 170, 40, 'barrier'], [-30, 380, 170, 40, 'barrier']], coins: null },
  { id: 'gate-narrow', h: 400, minProgress: 0.6, rects: [[-140, 180, 105, 40, 'barrier'], [35, 180, 105, 40, 'barrier']], coins: [0, 60] },
];

function circleRect(cx, cy, r, o) {
  const nx = Math.max(o.x0, Math.min(cx, o.x1));
  const ny = Math.max(o.y0, Math.min(cy, o.y1));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
export { circleRect };

export function isFree(obstacles, x, y, r) {
  for (const o of obstacles) if (circleRect(x, y, r, o)) return false;
  return true;
}

