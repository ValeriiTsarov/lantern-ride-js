// Іграшковий велосипед (процедурний, за референсом) зі скінами, дитина-вершник (Kenney) і фара на кермі.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BIKE_SKINS = [
  { id: 'tangerine', name: 'Мандарин', frame: 0xffa21f, tire: 0x4a8fe0, rim: 0xffd27a, seat: 0xff6a2b, grip: 0xff6a2b, lamp: 0xffc94a },
  { id: 'mint', name: "М'ята", frame: 0x5fd8b2, tire: 0x2e3a55, rim: 0xe9fff7, seat: 0xff7aa8, grip: 0xff7aa8, lamp: 0xffffff },
  { id: 'bubblegum', name: 'Жуйка', frame: 0xff7cc8, tire: 0x7a5cff, rim: 0xffe9f6, seat: 0xfff0a0, grip: 0xfff0a0, lamp: 0xa6f0ff },
  { id: 'midnight', name: 'Опівніч', frame: 0x3a3f72, tire: 0x1a1c2c, rim: 0x5cf0ff, seat: 0xffcf4a, grip: 0xffcf4a, lamp: 0x5cf0ff, glow: 0x5cf0ff },
  { id: 'lemon', name: 'Лимон', frame: 0xffe24a, tire: 0xff5a5a, rim: 0xffffff, seat: 0x5a7dff, grip: 0x5a7dff, lamp: 0xffffff },
  { id: 'spooky', name: 'Гарбуз', frame: 0xff7a1a, tire: 0x2b1838, rim: 0x9b5cff, seat: 0x2b1838, grip: 0x9b5cff, lamp: 0xb6ff5c, glow: 0xb6ff5c },
  { id: 'ghost', name: 'Привид', frame: 0xf3eef8, tire: 0xbfb0ff, rim: 0xffc6dc, seat: 0xffb3cf, grip: 0xbfb0ff, lamp: 0xfff1c0 },
];

function cyl(a, b, r, mat, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

const _pq = new THREE.Quaternion(), _d = new THREE.Quaternion(), _e = new THREE.Euler();

// groups: Map(spec → [mesh]) — запікає локальні трансформи мешів і зливає геометрію в один меш на матеріал
function mergeInto(parent, groups, L, cast) {
  for (const [sp, list] of groups) {
    const geos = list.map(m => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
    const mesh = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], null);
    if (geos.length > 1) geos.forEach(g => g.dispose());
    list.forEach(m => m.geometry.dispose());
    L.apply(mesh, sp); mesh.castShadow = cast(sp);
    parent.add(mesh);
  }
}

export class BikeView {
  constructor(lib, assets) {
    this.lib = lib;
    this.assets = assets;
    this.root = new THREE.Group();       // позиція у світі
    this.lean = new THREE.Group();       // нахил у повороті
    this.root.add(this.lean);
    this.wheels = [];
    this.skin = BIKE_SKINS[0];
    this.parts = new THREE.Group();
    this.lean.add(this.parts);
    this.lean.scale.setScalar(1.3);
    this.buildBike(this.skin);
    this.buildRider('skaterMaleA');
    this.buildLantern();
    this.spin = 0;
  }

  mats(s) {
    const L = this.lib;
    return {
      frame: L.plastic(s.frame, { rough: 0.32, clear: 0.9 }),
      tire: L.plastic(s.tire, { rough: 0.55, clear: 0.3 }),
      rim: L.plastic(s.rim, { rough: 0.3, clear: 0.8 }),
      seat: L.plastic(s.seat, { rough: 0.45, clear: 0.5 }),
      grip: L.plastic(s.grip, { rough: 0.5, clear: 0.4 }),
      lamp: L.plastic(s.lamp, { emissive: s.lamp, emissiveIntensity: 1.6, rough: 0.2, clear: 1 }),
      dark: L.plastic(0x3b3448, { rough: 0.5 }),
      glow: s.glow ? L.plastic(s.glow, { emissive: s.glow, emissiveIntensity: 1.3 }) : null,
    };
  }

  buildBike(skin) {
    this.skin = skin;
    const p = this.parts;
    while (p.children.length) { const c = p.children.pop(); c.traverse(o => o.geometry && o.geometry.dispose()); }
    this.wheels = [];
    const M = this.mats(skin), L = this.lib;
    // Статичні частини збираємо по матеріалах і зливаємо в один меш на матеріал (менше draw calls).
    const stat = new Map();
    const add = (mesh, sp) => { if (!stat.has(sp)) stat.set(sp, []); stat.get(sp).push(mesh); return mesh; };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const R = 8.5, zf = -15, zr = 14;
    // колеса: шина + диск + спиці (кожне колесо крутиться — свій вузол, усередині злито по матеріалах)
    for (const z of [zf, zr]) {
      const w = new THREE.Group();
      w.position.set(0, R, z);
      const wm = new Map(), wadd = (mesh, sp) => { if (!wm.has(sp)) wm.set(sp, []); wm.get(sp).push(mesh); };
      const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 2, 2.6, 12, 28), null);
      tire.rotation.y = Math.PI / 2;
      wadd(tire, M.tire);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R - 3.6, R - 3.6, 1.6, 22), null);
      disc.rotation.z = Math.PI / 2;
      wadd(disc, M.rim);
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2 * (R - 4), 1.2), null);
        sp.rotation.x = i * Math.PI / 3;
        wadd(sp, M.tire);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.4, 12), null);
      hub.rotation.z = Math.PI / 2; wadd(hub, M.frame);
      mergeInto(w, wm, L, sp => sp === M.tire);
      p.add(w);
      this.wheels.push(w);
      // крило
      const fender = new THREE.Mesh(new THREE.TorusGeometry(R + 0.6, 1.3, 6, 16, Math.PI * 0.75), null);
      fender.rotation.y = Math.PI / 2;
      fender.rotation.x = z < 0 ? 0.2 : 0.35;
      fender.position.set(0, R, z);
      fender.scale.set(1, 1, 1.9);
      add(fender, M.frame);
    }
    // рама: вигнута верхня труба
    const top = new THREE.CatmullRomCurve3([V(0, R, zr), V(0, 17, 8), V(0, 18.5, -2), V(0, 21, -11)]);
    add(new THREE.Mesh(new THREE.TubeGeometry(top, 20, 2.1, 10), null), M.frame);
    add(cyl(V(0, R + 1, 1), V(0, 22, 6), 1.8, null), M.frame);     // підсідельна
    add(cyl(V(0, R, 1), V(0, R, zr), 1.4, null), M.frame);          // ланцюгова
    add(cyl(V(0, 21, -11), V(0, R, zf), 1.9, null), M.frame);       // вилка
    add(cyl(V(0, 20, -11), V(0, 29, -13), 1.6, null), M.frame);     // винос керма
    // кермо
    const bar = new THREE.CatmullRomCurve3([V(-9, 31, -9), V(-5, 29.5, -12.5), V(5, 29.5, -12.5), V(9, 31, -9)]);
    add(new THREE.Mesh(new THREE.TubeGeometry(bar, 14, 1.1, 8), null), M.rim);
    for (const s of [-1, 1]) {
      const gr = cyl(V(9 * s, 31, -9), V(10.5 * s, 31.6, -5.5), 1.9, null);
      add(gr, M.grip);
    }
    // сідло
    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(3.6, 6, 6, 12), null);
    seat.rotation.x = Math.PI / 2; seat.scale.set(1.2, 1, 0.55); seat.position.set(0, 23.5, 6.5);
    add(seat, M.seat);
    // фара
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3, 4.5, 16), null);
    lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 23, -14.5);
    add(lamp, M.frame);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(3.1, 16), null);
    lens.position.set(0, 23, -16.8); lens.rotation.y = Math.PI;
    lens.rotation.x = 0; lens.lookAt(0, 23, -30);
    add(lens, M.lamp);
    // шатун і педалі
    this.crank = new THREE.Group();
    this.crank.position.set(0, R, 1);
    const cm = new Map(), cadd = (mesh, sp) => { if (!cm.has(sp)) cm.set(sp, []); cm.get(sp).push(mesh); };
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3, 14), null);
    cr.rotation.z = Math.PI / 2; cadd(cr, M.frame);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.6), null);
      arm.position.set(3 * s, -3 * s, 0); cadd(arm, M.rim);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 3.2), null);
      ped.position.set(5 * s, -6 * s, 0); cadd(ped, M.seat);
    }
    mergeInto(this.crank, cm, L, () => false);
    p.add(this.crank);
    if (M.glow) {
      const strip = new THREE.Mesh(new THREE.TubeGeometry(top, 20, 0.45, 6), null);
      strip.position.x = 2; add(strip, M.glow);
      const strip2 = strip.clone(); strip2.position.x = -2; add(strip2, M.glow);
    }
    mergeInto(p, stat, L, () => true);
    this.headlampColor = skin.lamp;
  }

  buildRider(skinName) {
    const a = this.assets;
    if (this.rider) { this.lean.remove(this.rider); }
    if (!a.character) return;
    const r = SkeletonUtils.clone(a.character);
    const tex = a.skins[skinName] || Object.values(a.skins)[0];
    r.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.material = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5, clearcoat: 0.35 });
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    // масштаб: зріст ≈ 34 u
    r.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(r);
    const h = box.max.y - box.min.y || 1;
    const s = 34 / h;
    r.scale.setScalar(s);
    r.rotation.y = Math.PI; // обличчям уперед (−z)
    r.position.set(0, 0, 0);
    this.rider = r;
    this.bones = {};
    r.traverse(o => { if (o.isBone) this.bones[o.name.toLowerCase()] = o; });
    // орієнтації кісток у просторі персонажа в позі спокою
    r.updateMatrixWorld(true);
    const rootQi = r.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const k in this.bones) {
      const b = this.bones[k];
      b.userData.restCQ = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootQi);
      b.userData.restQ = b.quaternion.clone();
    }
    const hips = this.bones.hips;
    const hp = hips ? hips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 17, 0);
    r.position.set(0, 25 - hp.y, 9);
    this.riderSkin = skinName;
    this.lean.add(r);
    if (this.noRider) r.visible = false;
    this.poseRider(0);
  }

  poseRider(ph) {
    const r = this.rider, B = this.bones;
    if (!r || !B) return;
    // D — поворот у просторі персонажа (персонаж дивиться на +z, ліворуч — +x).
    // Поворот батька в просторі персонажа — добуток локальних кватерніонів до r (без updateMatrixWorld;
    // матриці світу оновить рендер). Тимчасові об'єкти — модульні, без алокацій щокадру.
    const apply = (name, x, y, z) => {
      const b = B[name];
      if (!b) return;
      _pq.identity();
      for (let o = b.parent; o && o !== r; o = o.parent) _pq.premultiply(o.quaternion);
      _d.setFromEuler(_e.set(x, y, z));
      b.quaternion.copy(_pq.invert()).multiply(_d.multiply(b.userData.restCQ));
    };
    const p = Math.sin(ph), c = Math.cos(ph);
    apply('spine', 0.32, 0, 0);
    apply('head', 0.05, 0, 0);
    apply('leftupleg', -1.35 - p * 0.3, 0, 0.12);
    apply('rightupleg', -1.35 + p * 0.3, 0, -0.12);
    apply('leftleg', -0.05 + c * 0.35 + p * 0.1, 0, 0.05);
    apply('rightleg', -0.05 - c * 0.35 - p * 0.1, 0, -0.05);
    apply('leftfoot', -0.1, 0, 0);
    apply('rightfoot', -0.1, 0, 0);
    apply('leftarm', 0.75, -1.25, 0);
    apply('rightarm', 0.75, 1.25, 0);
    apply('leftforearm', 0.65, -1.45, 0);
    apply('rightforearm', 0.65, 1.45, 0);
  }

  // свічення фари на кермі (яскравість — від оливи)
  buildLantern() {
    this.glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.93, 0.72).multiplyScalar(3), transparent: true });
    this.glass = new THREE.Mesh(new THREE.SphereGeometry(2.8, 12, 8), this.glassMat);
    this.glass.position.set(0, 23, -17.2);
    this.glass.scale.z = 0.45;
    this.lean.add(this.glass);
  }

  setSkin(id) {
    const s = BIKE_SKINS.find(k => k.id === id) || BIKE_SKINS[0];
    if (s !== this.skin) this.buildBike(s);
  }
  setRiderSkin(name) { if (name !== this.riderSkin) this.buildRider(name); }

  // pos: світові (x, Y), vx — бічна швидкість; v — швидкість прокрутки
  update(dt, x, Y, vx, v, glow, toV, yaw = 0) {
    this.root.position.copy(toV(x, Y, 0));
    this.root.rotation.y = yaw;
    const leanT = THREE.MathUtils.clamp(-vx / 900, -0.35, 0.35);
    this.lean.rotation.z += (leanT - this.lean.rotation.z) * Math.min(1, dt * 10);
    this.lean.rotation.y = THREE.MathUtils.clamp(-vx / 2400, -0.18, 0.18);
    this.spin += v * dt / 8.5;
    for (const w of this.wheels) w.rotation.x = -this.spin;
    if (this.crank) this.crank.rotation.x = -this.spin * 0.55;
    this.poseRider(this.spin * 0.55);
    this.glassMat.opacity = Math.min(1, 0.15 + glow);
  }
}
