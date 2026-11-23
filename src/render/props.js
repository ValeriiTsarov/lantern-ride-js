// Перешкоди (машини, баки, загородження), монети, батарейки — іграшковий пластик.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { C } from '../config.js';
import { canvasTex, radialTex } from './materials.js';

const CAR_COLORS = [0x7ec8ff, 0xff8fa3, 0xffd166, 0x9b8cff, 0x6ee7b7, 0xff9f5a, 0xf6f1ff];
const BALE_COLORS = [0xf0d38a, 0xe8c77a, 0xf5dc9c];

export class Props {
  constructor(lib, view) {
    this.lib = lib; this.view = view; this.toV = (x, Y, h, lane) => view.toV(x, Y, h, lane);
    this.group = new THREE.Group();
    this.obs = new Map();
    this.coins = new Map();
    this.cans = new Map();
    this.arrows = new Map();
    this.want = new Set(); this.visBuf = []; // перевикористовуються в sync щокадру (без алокацій)
    this.arrowTex = {};
    this.stripe = canvasTex(128, 32, (g, w, h) => {
      g.fillStyle = '#fff6ea'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff7a2f';
      for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
    }, { repeat: true });
    this.amberOn = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa020, emissiveIntensity: 4 });
    this.amberOff = new THREE.MeshStandardMaterial({ color: 0x9a6a30, emissive: 0xffa020, emissiveIntensity: 0.25 });
    this.tail = new THREE.MeshStandardMaterial({ color: 0xff5060, emissive: 0xff2040, emissiveIntensity: 1.6 });
    this.head = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0c0, emissiveIntensity: 0.9 });
    this.wheelSp = lib.plastic(0x2c2838, { rough: 0.6, clear: 0.2 });
    this.glassSp = lib.plastic(0x2a3358, { rough: 0.1, clear: 1 });
    this.coinGeo = new THREE.CylinderGeometry(8, 8, 2.4, 20);
    this.coinSp = lib.plastic(0xffc93c, { emissive: 0xff9a00, emissiveIntensity: 0.55, rough: 0.25, clear: 1, metal: 0.2 });
    this.halo = radialTex(null, null, 64, [[0, 'rgba(120,255,170,0.75)'], [0.5, 'rgba(60,220,140,0.22)'], [1, 'rgba(40,200,120,0)']]);
    this.blinkers = [];
    this.geos = new Map();
    this.haloMat = new THREE.MeshBasicMaterial({ map: this.halo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  // Геометрії — спільні, за ключем із розмірами (розмірів перешкод небагато): нові меші на кожну появу
  // не створюють нових буферів на GPU, тож нема чого й звільняти (dispose) при видаленні
  geo(key, make) {
    let g = this.geos.get(key);
    if (!g) { g = make(); this.geos.set(key, g); }
    return g;
  }

  makeCar(o) {
    const L = this.lib, g = new THREE.Group();
    const w = o.x1 - o.x0, d = o.y1 - o.y0;
    const col = CAR_COLORS[Math.floor(o.v * CAR_COLORS.length)];
    const sp = L.plastic(col, { rough: 0.28, clear: 1 });
    const body = new THREE.Mesh(this.geo('carBody:' + w + ':' + d, () => new RoundedBoxGeometry(w - 4, 24, d - 8, 4, 8)), null);
    body.position.y = 18; L.apply(body, sp);
    const cab = new THREE.Mesh(this.geo('carCab:' + w + ':' + d, () => new RoundedBoxGeometry(w * 0.52, 20, d - 16, 4, 8)), null);
    cab.position.set(-w * 0.04, 38, 0); L.apply(cab, sp);
    const glass = new THREE.Mesh(this.geo('carGlass:' + w + ':' + d, () => new RoundedBoxGeometry(w * 0.54, 13, d - 14, 3, 5)), null);
    glass.position.set(-w * 0.04, 38, 0); L.apply(glass, this.glassSp);
    g.add(body, cab, glass);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wh = new THREE.Mesh(this.geo('wheel', () => new THREE.CylinderGeometry(10, 10, 8, 16)), null);
      wh.rotation.x = Math.PI / 2; wh.position.set(sx * (w / 2 - 22), 10, sz * (d / 2 - 6)); L.apply(wh, this.wheelSp); g.add(wh);
    }
    const front = o.v > 0.5 ? 1 : -1;
    for (const sz of [-1, 1]) {
      const hl = new THREE.Mesh(this.geo('headlight', () => new THREE.SphereGeometry(4, 10, 8)), this.head);
      hl.position.set(front * (w / 2 - 2), 20, sz * (d / 2 - 14)); g.add(hl);
      const tl = new THREE.Mesh(this.geo('taillight', () => new THREE.BoxGeometry(3, 6, 9)), this.tail);
      tl.position.set(-front * (w / 2 - 2), 22, sz * (d / 2 - 14)); g.add(tl);
    }
    return g;
  }

  // копиці сіна посеред дороги
  makeBins(o) {
    const L = this.lib, g = new THREE.Group();
    const w = o.x1 - o.x0, n = 2;
    const sp = L.plastic(BALE_COLORS[Math.floor(o.v * BALE_COLORS.length)], { rough: 0.8, clear: 0.1 });
    const band = L.plastic(0xc0605a, { rough: 0.5 });
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(this.geo('bale:' + w, () => new THREE.CylinderGeometry(19, 19, w / n - 6, 18)), null);
      b.rotation.z = Math.PI / 2; b.position.set(-w / 2 + (i + 0.5) * w / n, 19, (i - 0.5) * 6); L.apply(b, sp);
      const r = new THREE.Mesh(this.geo('baleBand', () => new THREE.TorusGeometry(19.3, 1.2, 6, 20)), null);
      r.rotation.y = Math.PI / 2; r.position.copy(b.position); L.apply(r, band);
      g.add(b, r);
    }
    return g;
  }

  makeBarrier(o) {
    const L = this.lib, g = new THREE.Group();
    const w = o.x1 - o.x0, d = o.y1 - o.y0;
    const key = 'barrier:' + Math.round(w);
    let sp = L.specs.get(key);
    if (!sp) { const tex = this.stripe.clone(); tex.needsUpdate = true; tex.repeat.set(w / 64, 1); sp = L.spec(key, { map: tex, rough: 0.35, clear: 0.9 }); }
    for (const y of [20, 34]) {
      const board = new THREE.Mesh(this.geo('board:' + w, () => new RoundedBoxGeometry(w - 4, 10, 6, 2, 2)), null);
      board.position.set(0, y, 0); L.apply(board, sp); g.add(board);
    }
    const legSp = L.plastic(0xfff6ea, { rough: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(this.geo('leg', () => new THREE.BoxGeometry(4, 40, 4)), null);
      leg.position.set(sx * (w / 2 - 10), 19, sz * (d / 2 - 8)); leg.rotation.x = sz * 0.3; L.apply(leg, legSp); g.add(leg);
    }
    const lamps = [];
    for (const sx of [-1, 1]) {
      const lb = new THREE.Mesh(this.geo('lamp', () => new THREE.CylinderGeometry(3.5, 3.5, 6, 10)), this.amberOff);
      lb.position.set(sx * (w / 2 - 12), 44, 0); g.add(lb); lamps.push(lb);
    }
    this.blinkers.push({ lamps, ph: o.v * 3 });
    g.userData.blink = lamps;
    return g;
  }

  // Батарейка для ліхтарика: іграшкова «пальчикова», трохи нахилена, з блискавкою
  makeCan() {
    const L = this.lib, g = new THREE.Group();
    const inner = new THREE.Group();
    const tilt = new THREE.Group(); tilt.rotation.z = 0.35; tilt.position.y = 16;
    if (!this.boltTex) this.boltTex = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#20a06a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff4b0'; c.beginPath();
      c.moveTo(36, 6); c.lineTo(18, 36); c.lineTo(31, 36); c.lineTo(26, 58); c.lineTo(46, 26); c.lineTo(33, 26); c.lineTo(38, 6); c.closePath(); c.fill();
    });
    const body = new THREE.Mesh(this.geo('batBody', () => new THREE.CylinderGeometry(7.5, 7.5, 20, 20)), null);
    L.apply(body, L.spec('battery:body', { map: this.boltTex, emissive: 0x30ff9a, emissiveIntensity: 0.25, emissiveMap: this.boltTex, rough: 0.25, clear: 1 }));
    const top = new THREE.Mesh(this.geo('batTop', () => new THREE.CylinderGeometry(7.6, 7.6, 6, 20)), null);
    top.position.y = 13; L.apply(top, L.plastic(0xffc93c, { rough: 0.2, clear: 1, metal: 0.3, emissive: 0xff9a00, emissiveIntensity: 0.3 }));
    const nub = new THREE.Mesh(this.geo('batNub', () => new THREE.CylinderGeometry(3, 3, 3, 12)), null);
    nub.position.y = 17.5; L.apply(nub, L.plastic(0xe8e4f0, { rough: 0.15, clear: 1, metal: 0.6 }));
    const bottom = new THREE.Mesh(this.geo('batBottom', () => new THREE.CylinderGeometry(7.6, 7.2, 2.5, 20)), null);
    bottom.position.y = -11; L.apply(bottom, L.plastic(0xe8e4f0, { rough: 0.15, clear: 1, metal: 0.6 }));
    tilt.add(body, top, nub, bottom);
    inner.add(tilt);
    g.add(inner);
    const halo = new THREE.Mesh(this.geo('halo', () => new THREE.PlaneGeometry(70, 70)), this.haloMat);
    halo.rotation.x = -Math.PI / 2; halo.position.y = 1;
    g.add(halo);
    g.userData.inner = inner;
    return g;
  }

  // Стрілки на асфальті перед розвилкою: золота — нова вулиця, біла — вже проїхана, червоний хрестик — проїзду нема
  arrowMat(rel, state) {
    const k = rel + state;
    if (!this.arrowTex[k]) {
      const tex = canvasTex(128, 160, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.lineCap = 'round'; g.lineJoin = 'round';
        if (state === 'x') {
          g.strokeStyle = '#ff4d6d'; g.lineWidth = 16;
          g.beginPath(); g.moveTo(34, 50); g.lineTo(94, 110); g.moveTo(94, 50); g.lineTo(34, 110); g.stroke();
          return;
        }
        g.strokeStyle = state === 'new' ? '#ffd36b' : '#f4f0ff'; g.fillStyle = g.strokeStyle; g.lineWidth = 18;
        g.beginPath();
        if (rel === 'S') { g.moveTo(64, 150); g.lineTo(64, 50); g.stroke(); g.beginPath(); g.moveTo(64, 10); g.lineTo(28, 58); g.lineTo(100, 58); g.fill(); }
        else {
          const sx = rel === 'L' ? -1 : 1;
          g.moveTo(64 - sx * 10, 150); g.lineTo(64 - sx * 10, 80); g.quadraticCurveTo(64 - sx * 10, 52, 64 + sx * 18, 52); g.stroke();
          g.beginPath(); g.moveTo(64 + sx * 58, 52); g.lineTo(64 + sx * 14, 18); g.lineTo(64 + sx * 14, 86); g.fill();
        }
      });
      const col = state === 'new' ? new THREE.Color(2.2, 1.7, 0.9) : state === 'done' ? new THREE.Color(0.75, 0.75, 0.85) : new THREE.Color(2, 0.6, 0.8);
      this.arrowTex[k] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: col });
    }
    return this.arrowTex[k];
  }

  // Стрілки перед розвилкою: золота — відгалуження (більше монет і каністра), біла — основна дорога
  syncArrows(sim, t) {
    const want = this.want; want.clear();
    const geo = this.arrowGeo || (this.arrowGeo = new THREE.PlaneGeometry(64, 80));
    const by = sim.bikeWY;
    for (const f of sim.route.forks) {
      if (f.Y0 < by - 400 || f.Y0 > by + 3000) continue;
      const Y = f.Y0 - 330, rel = f.side < 0 ? 'L' : 'R';
      const chosen = f.id in sim.choice ? sim.choice[f.id] === 'branch' : sim.wantsBranch(f);
      for (const [kind, x, r, st] of [['b', f.side * C.ROAD_HALF * 0.62, rel, 'new'], ['m', -f.side * 30, 'S', 'done']]) {
        const id = f.id + kind;
        want.add(id);
        let m = this.arrows.get(id);
        if (!m) {
          m = new THREE.Mesh(geo, this.arrowMat(r, st));
          m.renderOrder = 3;
          m.position.copy(this.toV(x, Y, 0.9, 'main'));
          m.rotation.order = 'YXZ'; m.rotation.y = this.view.yawAt(Y, 'main'); m.rotation.x = -Math.PI / 2;
          this.group.add(m); this.arrows.set(id, m);
        }
        const on = (kind === 'b') === chosen;
        const k = on ? 1.25 + Math.sin(t * 8) * 0.08 : 0.85;
        m.scale.set(k, k, 1);
      }
    }
    for (const [id, m] of this.arrows) if (!want.has(id)) { this.group.remove(m); this.arrows.delete(id); }
  }

  clear() {
    for (const m of [this.obs, this.coins, this.cans, this.arrows]) { for (const [, o] of m) this.group.remove(o); m.clear(); }
    this.blinkers = [];
    this.geos = new Map();
    this.haloMat = new THREE.MeshBasicMaterial({ map: this.halo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  // Геометрії — спільні, за ключем із розмірами (розмірів перешкод небагато): нові меші на кожну появу
  // не створюють нових буферів на GPU, тож нема чого й звільняти (dispose) при видаленні
  geo(key, make) {
    let g = this.geos.get(key);
    if (!g) { g = make(); this.geos.set(key, g); }
    return g;
  }

  sync(sim, t, yLo, yHi) {
    // перешкоди
    const want = this.want; want.clear();
    for (const o of sim.visibleObstacles(yLo, yHi, this.visBuf)) {
      want.add(o.id);
      if (!this.obs.has(o.id)) {
        const m = o.kind === 'car' ? this.makeCar(o) : o.kind === 'bins' ? this.makeBins(o) : this.makeBarrier(o);
        m.position.copy(this.toV((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, 0, o.lane));
        m.rotation.y = this.view.yawAt((o.y0 + o.y1) / 2, o.lane);
        m.traverse(q => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } });
        this.group.add(m); this.obs.set(o.id, m);
      }
    }
    for (const [id, m] of this.obs) if (!want.has(id)) {
      this.group.remove(m); this.obs.delete(id);
      if (m.userData.blink) this.blinkers = this.blinkers.filter(b => b.lamps !== m.userData.blink);
    }
    for (const b of this.blinkers) {
      const on = Math.sin(t * 5 + b.ph) > 0;
      b.lamps[0].material = on ? this.amberOn : this.amberOff;
      b.lamps[1].material = on ? this.amberOff : this.amberOn;
    }
    // монети
    const wc = this.want; wc.clear();
    for (const c of sim.visibleCoins(yLo, yHi, this.visBuf)) {
      wc.add(c.id);
      let m = this.coins.get(c.id);
      if (!m) {
        m = new THREE.Mesh(this.coinGeo, null); this.lib.apply(m, this.coinSp);
        m.rotation.x = Math.PI / 2; m.castShadow = true;
        m.position.copy(this.toV(c.x, c.y, 14, c.lane));
        this.group.add(m); this.coins.set(c.id, m);
      }
      m.rotation.z = t * 3 + c.y * 0.01;
      m.position.y = 14 + Math.sin(t * 3 + c.y * 0.05) * 2;
    }
    for (const [id, m] of this.coins) if (!wc.has(id)) { this.group.remove(m); this.coins.delete(id); }
    // каністри
    const wcan = this.want; wcan.clear();
    const cans = sim.route.cans, nc = cans.length + (sim.flareCan ? 1 : 0);
    for (let i = 0; i < nc; i++) {
      const c = i < cans.length ? cans[i] : sim.flareCan;
      if (c.taken || c.y < yLo || c.y > yHi) continue;
      wcan.add(c.id);
      let m = this.cans.get(c.id);
      if (!m) { m = this.makeCan(); m.position.copy(this.toV(c.x, c.y, 0, c.lane)); this.group.add(m); this.cans.set(c.id, m); }
      m.userData.inner.rotation.y = t * 1.6;
      m.userData.inner.position.y = 3 + Math.sin(t * 2.5) * 2.5;
    }
    for (const [id, m] of this.cans) if (!wcan.has(id)) { this.group.remove(m); this.cans.delete(id); }
    this.syncArrows(sim, t);
  }
}
