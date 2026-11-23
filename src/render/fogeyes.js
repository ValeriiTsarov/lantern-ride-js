// Очі в тумані: лише декорація. Далеко попереду, обабіч дороги, з темряви визирають пари очей —
// кліпають і зникають, коли під'їжджаєш. На симуляцію не впливають.
import * as THREE from 'three';

const geo = new THREE.SphereGeometry(1, 10, 8);
const MAX = 7;

export class FogEyes {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.color = new THREE.Color(0x7fe6f0);
    this.spawnT = 1;
  }

  setColor(c) { this.color.set(c); for (const e of this.list) e.mat.color.copy(this.color).multiplyScalar(3); }

  make() {
    const mat = new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(3), transparent: true, opacity: 0, fog: false, depthWrite: false });
    mat.defines = { NO_DARK: '' };
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.x = s * 11;
      m.scale.set(5, 7, 3);
      g.add(m);
    }
    this.group.add(g);
    return { g, mat, t: 0, life: 0, Y: 0, x: 0, h: 0, blink: 0 };
  }

  // amount: 0 — вимкнено; by — де велосипед; toV(x, Y, h) — у світ; cam — камера (очі дивляться на неї)
  update(dt, amount, by, toV, cam, rnd = Math.random) {
    this.spawnT -= dt * amount;
    if (amount > 0 && this.spawnT <= 0) {
      this.spawnT = 0.6 + rnd() * 1.6;
      let e = this.list.find(e => e.life <= 0);
      if (!e && this.list.length < MAX) { e = this.make(); this.list.push(e); }
      if (e) {
        const side = rnd() < 0.5 ? -1 : 1;
        e.Y = by + 900 + rnd() * 2600;
        e.x = rnd() < 0.15 ? (rnd() * 2 - 1) * 100 : side * (240 + rnd() * 900); // зрідка — просто на дорозі
        e.h = 18 + rnd() * 40;
        e.life = 2.5 + rnd() * 3.5; e.t = 0; e.blink = 0.6 + rnd() * 1.5;
        e.g.scale.setScalar(1 + (e.Y - by) / 2500);
      }
    }
    for (const e of this.list) {
      if (e.life <= 0) { e.g.visible = false; continue; }
      e.t += dt; e.life -= dt;
      const near = e.Y - by < 650; // під'їхав — ховаються
      if (near) e.life = Math.min(e.life, 0.3);
      const a = Math.min(1, e.t / 0.8, e.life / 0.5) * Math.min(1, amount);
      e.mat.opacity = Math.max(0, a);
      e.g.visible = a > 0.01;
      e.g.position.copy(toV(e.x, e.Y, e.h));
      e.g.lookAt(cam.position.x, e.g.position.y, cam.position.z);
      e.blink -= dt;
      const sy = e.blink < 0 ? 0.12 : 1;
      if (e.blink < -0.12) e.blink = 0.8 + rnd() * 2.5;
      for (const m of e.g.children) m.scale.y = 7 * sy;
    }
  }
}
