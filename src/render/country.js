// Сільська місцевість уздовж проселкової дороги: ґрунтова дорога з відгалуженнями, поля, гаї,
// хутори при дорозі (будинки-чекпойнти), дерев'яні ліхтарі, що загоряються, коли їх проминаєш.
// Будується один раз на рівень (і заново, якщо змінили вигін дороги в налаштуваннях).
import * as THREE from 'three';
import { C } from '../config.js';
import { makeRng } from '../rng.js';
import { BUILDINGS } from './assets.js';
import { canvasTex, radialTex } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KS = 145; // масштаб моделей Kenney → u
const PALS = ['colormap', 'variation-a', 'variation-b', 'variation-c'];
const FIELD_COLORS = [0xead9a4, 0xb9dca0, 0xd7c6ea, 0xf0c9b4, 0xc9e3c0];
const V = (X, Y, h = 0) => new THREE.Vector3(X, h, -Y);
export const yawOf = (hx, hy) => Math.atan2(-hx, hy);      // об'єкт, що «дивиться» в напрямку h (його −z)
const faceYaw = (fx, fy) => Math.atan2(fx, -fy);            // модель Kenney фасадом (+z) у напрямку f
const CELL = 300;
const CHUNK = 1500; // довжина шматка інстансів пейзажу по Y (для відсікання)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0); // схований інстанс (ще не засвічений)

export class Country {
  constructor(lib, assets, route, shape, colors) {
    this.lib = lib; this.assets = assets; this.route = route; this.shape = shape;
    this.group = new THREE.Group();
    this.houses = new Map(); // id → {g, bulbs, pool, mark, extra, lit}
    this.lamps = [];
    this.pending = [];
    this.time = 0;
    this.rng = makeRng(route.level * 31 + 7);
    this.reserved = [];
    this.poolTex = radialTex(null, null, 128, [[0, 'rgba(255,200,130,0.9)'], [0.4, 'rgba(255,170,90,0.35)'], [1, 'rgba(255,150,70,0)']]);
    this.bulbOff = new THREE.MeshStandardMaterial({ color: 0x6a6480, roughness: 0.3 });
    this.bulbOn = new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffc070, emissiveIntensity: 4 });
    this.makeTextures();
    // Світло від засвічених хуторів: постійна кількість джерел (без перекомпіляції шейдерів),
    // вмикаються біля двох найближчих засвічених будинків: тепле заливне світло спереду й згори.
    this.houseLights = [];
    for (let i = 0; i < 2; i++) {
      const front = new THREE.PointLight(0xffc27a, 0, 1500, 1.2);
      this.group.add(front);
      this.houseLights.push({ front });
    }
    this.lightK = 1;
    this.groundSp = lib.spec('ground', { map: this.tex.grass, color: colors.grassColor, rough: 0.8, clear: 0, sheen: 0 }); // без clearcoat/sheen: дешевий шейдер на найбільшій площі
    this.roadSp = lib.spec('dirt', { map: this.tex.dirt, color: colors.roadColor, rough: 0.75, clear: 0 });
    this.indexRoads();
    this.buildGround();
    this.buildRoads();
    this.buildHouses();
    this.buildLamps();
    this.buildScenery();
  }

  setColors(s) { this.lib.setColor(this.groundSp, s.grassColor); this.lib.setColor(this.roadSp, s.roadColor); }

  // ---------- допоміжне ----------
  at(Y, x = 0, lane = 'main') { return this.shape.at(Y, x, lane, {}); }
  // точки осей доріг у сітці: щоб нічого не поставити на дорогу за будь-якого вигину
  indexRoads() {
    this.grid = new Map();
    const add = (Y, lane) => {
      const p = this.at(Y, 0, lane), k = Math.floor(p.X / CELL) + ',' + Math.floor(p.Y / CELL);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(p.X, p.Y);
    };
    for (let Y = -3000; Y <= this.route.len + 320; Y += 40) add(Y, 'main');
    for (const f of this.route.forks) for (let Y = f.Y0; Y <= f.Y1; Y += 40) add(Y, f.id);
  }
  roadDist(X, Y) {
    const cx = Math.floor(X / CELL), cy = Math.floor(Y / CELL);
    let d2 = 1e12;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const pts = this.grid.get((cx + i) + ',' + (cy + j));
      if (pts) for (let q = 0; q < pts.length; q += 2) d2 = Math.min(d2, (pts[q] - X) ** 2 + (pts[q + 1] - Y) ** 2);
    }
    return Math.sqrt(d2);
  }
  free(X, Y, r) {
    if (this.roadDist(X, Y) < C.SIDEWALK_HALF + 20 + r) return false;
    for (const z of this.reserved) if ((z.X - X) ** 2 + (z.Y - Y) ** 2 < (z.r + r) ** 2) return false;
    return true;
  }
  houseSpec(pal, lit) {
    const A = this.assets;
    return this.lib.spec(`house:${pal}:${lit}`, {
      map: A.palettes[pal], emissiveMap: A.windowMask,
      emissive: lit ? 0xffc070 : 0x7a68c8, emissiveIntensity: lit ? 2.2 : 0.15, rough: 0.5, clear: 0.45,
      selfLit: lit, // засвічений будинок підсвічений цілком, не лише вікна
    });
  }
  propSpec(pal = 'colormap') { return this.lib.spec('prop:' + pal, { map: this.assets.palettes[pal], rough: 0.5, clear: 0.4 }); }
  applyHouse(obj, pal, lit) {
    const sp = this.houseSpec(pal, lit);
    obj.traverse(o => { if (o.isMesh) { this.lib.apply(o, sp); o.castShadow = true; o.receiveShadow = true; } });
    obj.userData.pal = pal; obj.userData.lit = lit;
  }
  applyProp(obj, pal = 'colormap') {
    const sp = this.propSpec(pal);
    obj.traverse(o => { if (o.isMesh) { this.lib.apply(o, sp); o.castShadow = true; o.receiveShadow = true; } });
  }
  model(name, s = 1) { const m = this.assets.models[name].clone(); m.scale.setScalar(KS * s); return m; }

  // Багато однакових моделей Kenney одним викликом малювання: items = [{X, Y, s, ry}]
  scatter(name, items, pal = 'colormap') {
    if (!items.length) return;
    const src = this.assets.models[name];
    src.updateMatrixWorld(true);
    const sp = this.propSpec(pal);
    src.traverse(o => {
      if (o.isMesh) this.scatterGeo(o.geometry, sp, items, true, KS, o.matrixWorld);
    });
  }
  // Інстанси шматками по Y (CHUNK): у кожного шматка своя bounding sphere, тож невидимі відсікаються
  // в усіх проходах (камера, тіні), а не малюються всім рівнем.
  scatterGeo(geo, sp, items, shadow = true, k = 1, local = null) {
    const chunks = new Map();
    for (const it of items) { const c = Math.floor(it.Y / CHUNK); if (!chunks.has(c)) chunks.set(c, []); chunks.get(c).push(it); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const part of chunks.values()) {
      const im = new THREE.InstancedMesh(geo, null, part.length);
      this.lib.apply(im, sp);
      im.castShadow = shadow; im.receiveShadow = true;
      part.forEach((it, i) => {
        q.setFromEuler(e.set(it.rx || 0, it.ry || 0, 0)); p.set(it.X, it.h || 0, -it.Y); sc.setScalar(k * (it.s || 1));
        m4.compose(p, q, sc); if (local) m4.multiply(local);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }
  // Статичні однакові меші одним InstancedMesh (ліхтарі, гірлянди): mats — масив Matrix4
  instances(geo, mat, mats, parent = this.group) {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    parent.add(im);
    return im;
  }

  makeTextures() {
    const t = this.tex = {};
    // світлі текстури: колір задає матеріал (налаштування «Колір трави / дороги»)
    t.grass = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1100; i++) {
        g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,230,${Math.random() * 0.25})` : `rgba(40,70,60,${Math.random() * 0.12})`;
        g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 0, 7); g.fill();
      }
    }, { repeat: true });
    t.dirt = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      for (const u of [0.3, 0.7]) { // колії
        const gr = g.createLinearGradient((u - 0.09) * w, 0, (u + 0.09) * w, 0);
        gr.addColorStop(0, 'rgba(90,60,40,0)'); gr.addColorStop(0.5, 'rgba(90,60,40,0.16)'); gr.addColorStop(1, 'rgba(90,60,40,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      g.fillStyle = 'rgba(80,130,70,0.16)'; // трава посередині
      for (let i = 0; i < 160; i++) g.fillRect(w * (0.47 + Math.random() * 0.06), Math.random() * h, 2, 5);
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,250,235' : '70,50,35'},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      for (const e of [0, 1]) { // нерівні узбіччя
        for (let y = 0; y < h; y += 3) {
          const k = 6 + Math.random() * 10;
          g.fillStyle = 'rgba(70,110,60,0.35)';
          g.fillRect(e ? w - k : 0, y, k, 3);
        }
      }
    }, { repeat: true });
    t.rows = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(60,50,40,0.13)';
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h);
    }, { repeat: true });
  }

  // Стрічка дороги lane від Ya до Yb. Сітка 25 u уздовж і 6 смуг поперек — щоб гнулася разом
  // із Curved World і середина не провисала під траву.
  ribbon(lane, Ya, Yb, half, h, sp) {
    const n = Math.max(2, Math.ceil((Yb - Ya) / 25)), M = 6, pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const Y = Ya + (Yb - Ya) * i / n;
      for (let j = 0; j <= M; j++) {
        const p = this.at(Y, (j / M * 2 - 1) * half, lane);
        pos.push(p.X, h, -p.Y); uv.push(j / M, Y / 420);
      }
      if (i) for (let j = 0; j < M; j++) {
        const a = (i - 1) * (M + 1) + j, c = a + M + 1;
        idx.push(a, a + 1, c, a + 1, c + 1, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, null);
    this.lib.apply(m, sp);
    m.receiveShadow = true; m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  // ---------- земля і дороги ----------
  buildGround() {
    const S = this.shape;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < S.X.length; i += 10) { x0 = Math.min(x0, S.X[i]); x1 = Math.max(x1, S.X[i]); y0 = Math.min(y0, S.Y[i]); y1 = Math.max(y1, S.Y[i]); }
    const M = 3500, W = x1 - x0 + 2 * M, H = y1 - y0 + 2 * M;
    this.tex.grass.repeat.set(W / 320, H / 320);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(W, H, Math.ceil(W / 160), Math.ceil(H / 160)), null);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, -1));
    this.lib.apply(lawn, this.groundSp);
    lawn.receiveShadow = true; lawn.frustumCulled = false;
    this.group.add(lawn);
  }

  buildRoads() {
    const R = this.route;
    this.ribbon('main', -3000, R.len + 300, C.SIDEWALK_HALF - 4, 0.2, this.roadSp);
    for (const f of R.forks) this.ribbon(f.id, f.Y0, f.Y1, C.SIDEWALK_HALF - 4, 0.35, this.roadSp);
    // подвір'я в кінці дороги
    const end = this.at(R.len + 300);
    const yard = new THREE.Mesh(new THREE.CircleGeometry(330, 40, 0), null);
    yard.rotation.x = -Math.PI / 2; yard.position.copy(V(end.X + end.hx * 200, end.Y + end.hy * 200, 0.15));
    this.lib.apply(yard, this.roadSp); yard.receiveShadow = true;
    this.group.add(yard);
  }

  // ---------- хутори ----------
  buildHouses() {
    for (const h of this.route.houses) this.buildFarm(h);
  }

  buildFarm(h) {
    const L = this.lib, rng = this.rng;
    const p = this.at(h.Y), rx = p.hy, ry = -p.hx; // праворуч від дороги
    let X, Y, face, scale = 1.45;
    if (h.final) { // дім — у кінці дороги, фасадом до неї
      const e = this.at(h.Y + 300);
      X = e.X + e.hx * 520; Y = e.Y + e.hy * 520; face = faceYaw(-e.hx, -e.hy); scale = 1.7;
    } else {
      const lat = h.side * (C.SIDEWALK_HALF + 360);
      X = p.X + rx * lat; Y = p.Y + ry * lat; face = faceYaw(-rx * h.side, -ry * h.side);
      // доріжка від дороги до ґанку
      const path = new THREE.Mesh(new THREE.PlaneGeometry(80, 250, 1, 6), null);
      path.rotation.order = 'YXZ'; path.rotation.set(-Math.PI / 2, yawOf(rx * h.side, ry * h.side), 0);
      path.position.copy(V(p.X + rx * h.side * (C.SIDEWALK_HALF + 110), p.Y + ry * h.side * (C.SIDEWALK_HALF + 110), 0.25));
      L.apply(path, this.roadSp); path.receiveShadow = true; this.group.add(path);
    }
    this.reserved.push({ X, Y, r: 300 });
    const g = new THREE.Group();
    g.position.copy(V(X, Y));
    g.rotation.y = face;
    const pal = 'variation-' + 'abc'[h.id % 3];
    const house = this.model('building-type-' + 'bdnuh'[h.id % 5], scale);
    this.applyHouse(house, pal, false);
    g.add(house);
    // гірлянда на низькому паркані перед фасадом (локально: +z — до дороги)
    if (!this.bulbGeo) this.bulbGeo = new THREE.SphereGeometry(3.4, 10, 8);
    const bm = [];
    for (let q = 0; q < 13; q++) bm.push(new THREE.Matrix4().makeTranslation((q / 12 - 0.5) * 260, 34 + Math.cos((q / 12 - 0.5) * Math.PI) * 10, 160));
    const bulbs = this.instances(this.bulbGeo, this.bulbOff, bm, g); // усі 13 вмикаються разом — один меш
    for (const u of [-130, 130]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 46, 10), null);
      post.position.set(u, 23, 160);
      L.apply(post, L.plastic(0xfff2dc, { rough: 0.35, clear: 0.8 })); post.castShadow = true; g.add(post);
    }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(620, 620, 4, 4), new THREE.MeshBasicMaterial({ map: this.poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 1.5, 140);
    g.add(pool);
    // маркер «ще темний будинок»
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex(), transparent: true, depthWrite: false, color: new THREE.Color(1.3, 1.2, 1.8) }));
    mark.scale.set(80, 80, 1); mark.position.set(0, 240, 0);
    g.add(mark);
    this.group.add(g);
    // сусідні хати хутора — засвічуються разом
    const extra = [];
    const n = h.final ? 4 : 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const a = rng() * Math.PI * 2, d = 480 + rng() * 280;
        const hx = X + Math.cos(a) * d, hy = Y + Math.sin(a) * d;
        if (!this.free(hx, hy, 170)) continue;
        const o = this.model(BUILDINGS[Math.floor(rng() * BUILDINGS.length)], 0.95 + rng() * 0.2);
        o.position.copy(V(hx, hy));
        const toRoad = this.at(h.Y);
        o.rotation.y = faceYaw(toRoad.X - hx, toRoad.Y - hy) + (rng() - 0.5) * 0.6;
        this.applyHouse(o, PALS[Math.floor(rng() * PALS.length)], false);
        this.group.add(o); extra.push(o);
        this.reserved.push({ X: hx, Y: hy, r: 170 });
        break;
      }
    }
    // паркан уздовж дороги біля хутора
    if (!h.final) for (const dY of [-320, -160, 160, 320]) {
      const q = this.at(h.Y + dY, h.side * (C.SIDEWALK_HALF + 40));
      const f = this.model('fence-1x4', 0.9);
      f.position.copy(V(q.X, q.Y)); f.rotation.y = yawOf(q.hx, q.hy) + Math.PI / 2;
      this.applyProp(f, pal); this.group.add(f);
    }
    this.houses.set(h.id, { g, house, bulbs, pool, mark, extra, lit: false, litT: 0, X, Y });
  }
  markTex() {
    if (!this._mark) this._mark = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(190,170,255,0.25)'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
      g.font = '84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🏠', 64, 70);
    });
    return this._mark;
  }

  // ---------- ліхтарі вздовж дороги ----------
  buildLamps() {
    const L = this.lib, wood = L.plastic(0x8a6248, { rough: 0.7, clear: 0.15 }), dark = L.plastic(0x3a3448, { rough: 0.4 });
    let side = 1;
    const mats = [], g = new THREE.Object3D();
    for (let Y = -1200; Y < this.route.len; Y += 650) {
      side = -side;
      const p = this.at(Y, side * (C.SIDEWALK_HALF + 30));
      if (this.roadDist(p.X, p.Y) < C.SIDEWALK_HALF + 25) continue; // на відгалуженні
      g.position.copy(V(p.X, p.Y));
      g.rotation.y = yawOf(p.hx, p.hy) + (side > 0 ? Math.PI / 2 : -Math.PI / 2); // локально +x — до дороги
      g.updateMatrix(); mats.push(g.matrix.clone());
      this.reserved.push({ X: p.X, Y: p.Y, r: 30 });
      this.lamps.push({ i: this.lamps.length, Y, lit: false });
    }
    if (!mats.length) return;
    // кожна частина — один InstancedMesh на всі ліхтарі (локальні зсуви запечені в геометрію)
    const T = (geo, x, y, z, ry = 0, rx = 0) => geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0))).translate(x, y, z);
    const woodGeo = mergeGeometries([T(new THREE.CylinderGeometry(2.6, 3.4, 96, 7), 0, 48, 0), T(new THREE.BoxGeometry(30, 3.5, 3.5), 13, 92, 0)]);
    const pole = this.instances(woodGeo, null, mats); L.apply(pole, wood); pole.castShadow = true;
    const cap = this.instances(T(new THREE.ConeGeometry(7, 6, 4), 26, 86, 0, Math.PI / 4), null, mats); L.apply(cap, dark);
    const bulbGeo = T(new THREE.BoxGeometry(7, 9, 7), 26, 78, 0);
    this.lampOff = this.instances(bulbGeo, this.bulbOff, mats);
    this.lampOn = this.instances(bulbGeo, this.bulbOn, mats);
    this.lampPool = this.instances(T(new THREE.PlaneGeometry(260, 260, 2, 2), 26, 1.2, 0, 0, -Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.poolTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), mats);
    this.lampMats = mats;
    for (const l of this.lamps) this.setLamp(l, l.Y < 0);
  }
  // засвітити/погасити ліхтар: ховаємо інстанс у «вимкненому» мешті й показуємо у «ввімкненому»
  setLamp(l, on) {
    l.lit = on;
    const M = this.lampMats[l.i];
    this.lampOff.setMatrixAt(l.i, on ? ZERO : M);
    this.lampOn.setMatrixAt(l.i, on ? M : ZERO);
    this.lampPool.setMatrixAt(l.i, on ? M : ZERO);
    for (const im of [this.lampOff, this.lampOn, this.lampPool]) im.instanceMatrix.needsUpdate = true;
  }

  // ---------- пейзаж: гаї, поля, луки з копицями ----------
  buildScenery() {
    const R = this.route, rng = this.rng;
    const trees = { 'tree-large': [], 'tree-small': [] }, bales = [], bushes = [], fences = [];
    const zoneOf = (Y, s) => { const r = makeRng(Math.floor(Y / 900) * 13 + (s > 0 ? 7 : 3) + R.level * 101)(); return r < 0.38 ? 'forest' : r < 0.75 ? 'field' : 'meadow'; };
    const tree = (X, Y, sc) => { if (!this.free(X, Y, 40)) return; trees[rng() < 0.55 ? 'tree-large' : 'tree-small'].push({ X, Y, s: sc, ry: rng() * 6.3 }); };
    for (let Y = -2600; Y < R.len + 2600; Y += 110) {
      for (const s of [-1, 1]) {
        const zone = zoneOf(Y, s);
        const lat = (a, b) => s * (a + rng() * (b - a));
        if (zone === 'forest') {
          for (let k = 0; k < 4; k++) { const p = this.at(Y + rng() * 110, lat(240, 1700)); tree(p.X, p.Y, 1 + rng() * 0.8); }
        } else if (zone === 'field') {
          if (Math.floor(Y / 900) !== Math.floor((Y - 110) / 900)) this.field(Y + 450, s);
          if (rng() < 0.35) { const p = this.at(Y, lat(230, 300)); tree(p.X, p.Y, 0.8 + rng() * 0.4); }
        } else {
          if (rng() < 0.5) { const p = this.at(Y, lat(260, 1500)); tree(p.X, p.Y, 0.9 + rng() * 0.7); }
          if (rng() < 0.3) { const p = this.at(Y, lat(320, 1100)); if (this.free(p.X, p.Y, 30)) bales.push({ X: p.X, Y: p.Y, h: 20, s: 1, rx: Math.PI / 2, ry: rng() * 6.3 }); }
          if (rng() < 0.6) { const p = this.at(Y, lat(220, 400)); if (this.free(p.X, p.Y, 18)) bushes.push({ X: p.X, Y: p.Y, h: 6, s: 0.8 + rng() * 0.7 }); }
          const q = this.at(Y, s * (C.SIDEWALK_HALF + 40)); // паркан уздовж луки
          if (this.free(q.X, q.Y, 10) && Y % 220 < 110) fences.push({ X: q.X, Y: q.Y, s: 0.9, ry: yawOf(q.hx, q.hy) + Math.PI / 2 });
        }
      }
    }
    for (const k in trees) this.scatter(k, trees[k]);
    this.scatter('fence-low', fences);
    this.scatterGeo(new THREE.CylinderGeometry(22, 22, 34, 16), this.lib.plastic(0xf1d58e, { rough: 0.8, clear: 0.1 }), bales);
    this.scatterGeo(new THREE.SphereGeometry(22, 10, 8), this.lib.plastic(0x88c49a, { rough: 0.7, clear: 0.15, sheen: 0.4 }), bushes);
  }

  // Поле з рядками, повернуте вздовж дороги
  field(Y, s) {
    const rng = this.rng, w = 600 + rng() * 500, l = 650 + rng() * 300, lat = s * (C.SIDEWALK_HALF + 120 + w / 2);
    const c = this.at(Y, lat);
    // усі кути мають бути далеко від доріг
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const q = this.at(Y + b * l / 2, lat + a * w / 2);
      if (!this.free(q.X, q.Y, 0)) return;
    }
    const col = FIELD_COLORS[Math.floor(rng() * FIELD_COLORS.length)];
    const tex = this.tex.rows.clone(); tex.needsUpdate = true; tex.repeat.set(w / 64, l / 64);
    const sp = this.lib.spec('field:' + col + ':' + Math.round(w), { map: tex, color: col, rough: 0.85, clear: 0, sheen: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l, 4, 6), null);
    m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, yawOf(c.hx, c.hy), 0);
    m.position.copy(V(c.X, c.Y, 0.1));
    this.lib.apply(m, sp); m.receiveShadow = true;
    this.group.add(m);
    this.reserved.push({ X: c.X, Y: c.Y, r: Math.min(w, l) / 2 });
  }

  // ---------- засвічування ----------
  schedule(delay, fn) { this.pending.push({ t: this.time + delay, fn }); }

  // ліхтарі, які велосипед уже проминув
  lightUpTo(Y) {
    for (const l of this.lamps) if (!l.lit && l.Y < Y) {
      l.lit = true;
      this.schedule(0.05, () => this.setLamp(l, true));
    }
  }

  // будинок-чекпойнт і весь його хутір хвилею
  lightHouse(id) {
    const m = this.houses.get(id);
    if (!m || m.lit) return;
    m.lit = true; m.litT = 0;
    m.bulbs.material = this.bulbOn;
    m.mark.visible = false;
    this.applyHouse(m.house, m.house.userData.pal, true);
    for (const o of m.extra) this.schedule(Math.hypot(o.position.x - m.g.position.x, o.position.z - m.g.position.z) / 1400, () => this.applyHouse(o, o.userData.pal, true));
  }

  // X, Y — де зараз велосипед (світові координати мапи)
  update(dt, X = 0, Y = 0) {
    this.time += dt;
    if (this.pending.length) {
      const due = this.pending.filter(p => p.t <= this.time);
      if (due.length) { this.pending = this.pending.filter(p => p.t > this.time); for (const p of due) p.fn(); }
    }
    // джерела світла — до двох найближчих засвічених будинків (без алокацій щокадру)
    let m0 = null, m1 = null, d0 = Infinity, d1 = Infinity;
    for (const m of this.houses.values()) {
      if (!m.lit) { m.mark.position.y = 240 + Math.sin(this.time * 2 + m.X) * 8; continue; }
      m.litT += dt;
      m.pool.material.opacity = Math.min(1, m.litT / 0.6) * 0.75;
      const d = (m.X - X) ** 2 + (m.Y - Y) ** 2;
      if (d < d0) { m1 = m0; d1 = d0; m0 = m; d0 = d; } else if (d < d1) { m1 = m; d1 = d; }
    }
    this.houseLights.forEach((L, i) => {
      const m = i ? m1 : m0;
      if (!m) { L.front.intensity = 0; return; }
      const k = Math.min(1, m.litT / 0.8) * this.lightK * (1 + 0.04 * Math.sin(this.time * 3 + i));
      L.front.position.set(0, 330, 260).applyMatrix4(m.g.matrixWorld);
      L.front.intensity = 4200 * k;
    });
  }
}
