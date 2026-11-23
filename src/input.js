// §4.1 Плаваючий джойстик (тач і миша) + клавіатура. Результат — вісь (ax, ay) у [−1, 1].
import { C } from './config.js';

export class Input {
  constructor(surface, joyEl, knobEl) {
    this.keys = new Set();
    this.joy = null; // {id, x0, y0, x, y}
    this.joyEl = joyEl; this.knobEl = knobEl;
    this.used = false;
    // налаштування гравця: joySens — чутливість джойстика (менший хід пальця), joyDead — мертва зона, keySens — різкість клавіш
    this.cfg = { joySens: 1, joyDead: C.JOY_DEADZONE, keySens: 1 };
    this.kx = 0; this.ky = 0; this.lastT = performance.now();
    addEventListener('keydown', e => {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { this.keys.add(e.code); this.used = true; e.preventDefault(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.release(); });
    surface.addEventListener('pointerdown', e => {
      if (this.joy) return;
      surface.setPointerCapture(e.pointerId);
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.used = true;
      this.show();
    });
    surface.addEventListener('pointermove', e => { if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY; this.show(); } });
    const up = e => { if (this.joy && e.pointerId === this.joy.id) this.release(); };
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
  }

  release() { this.joy = null; this.joyEl.style.display = 'none'; }

  joyRadiusPx() { return C.JOY_RADIUS / (this.cfg.joySens || 1) * Math.max(1, (window.devicePixelRatio || 1) * 0.6); }

  show() {
    const j = this.joy, r = this.joyRadiusPx();
    let dx = j.x - j.x0, dy = j.y - j.y0;
    const d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    this.joyEl.style.display = 'block';
    this.joyEl.style.left = j.x0 + 'px'; this.joyEl.style.top = j.y0 + 'px';
    this.joyEl.style.width = this.joyEl.style.height = r * 2 + 'px';
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  axis() {
    let tx = 0, ty = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) tx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) tx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) ty += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) ty -= 1;
    // клавіші: вісь доходить до цілі з різкістю keySens (1 — одразу)
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastT) / 1000); this.lastT = now;
    const ks = this.cfg.keySens ?? 1;
    const kr = ks >= 0.99 ? 1 : 1 - Math.exp(-(2 + 28 * ks * ks) * dt);
    this.kx += (tx - this.kx) * kr; this.ky += (ty - this.ky) * kr;
    let ax = Math.abs(this.kx) < 0.01 ? 0 : this.kx, ay = Math.abs(this.ky) < 0.01 ? 0 : this.ky;
    if (this.joy) {
      const r = this.joyRadiusPx();
      let jx = (this.joy.x - this.joy.x0) / r, jy = -(this.joy.y - this.joy.y0) / r;
      const m = Math.hypot(jx, jy);
      if (m > 1) { jx /= m; jy /= m; }
      const dz = this.cfg.joyDead ?? C.JOY_DEADZONE;
      if (m < dz) { jx = 0; jy = 0; } else if (dz > 0) { const k2 = Math.min(1, (m - dz) / (1 - dz)) / m; jx *= k2; jy *= k2; }
      ax += jx; ay += jy;
    }
    return { ax: Math.max(-1, Math.min(1, ax)), ay: Math.max(-1, Math.min(1, ay)) };
  }
}
