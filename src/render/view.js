// Рендер гри: сцена, камера, світло, синхронізація зі станом симуляції.
// Координати симуляції (x, Y траси, дорога lane) переводяться у світ через RoadShape.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { C } from '../config.js';
import { MatLib, radialTex, CURVE, DARK, HOUSE_GLOW } from './materials.js';
import { FogEyes } from './fogeyes.js';
import { Country, yawOf } from './country.js';
import { RoadShape } from '../road.js';
import { Props } from './props.js';
import { BikeView } from './bike.js';
import { Ghost } from './ghost.js';
import { Post } from './post.js';

const MENU_FOV = 36;
const CURVE_K = 8e-5;     // «Curved World» = 1 → на відстані 1000 u земля опускається на 80 u
const SHOW = new THREE.Vector3(-30000, 0, 30000); // вітрина головного екрана — далеко від дороги
const tmp = {};
const _v = new THREE.Vector3(); // спільний результат toV

// Конус фари на землі: віяло з м'якими краями (альфа — у кольорах вершин). Довжина 1, масштаб = довжина променя.
function beamGeometry() {
  const A = 16, N = 9, pos = [], col = [], idx = [];
  for (let r = 0; r <= N; r++) for (let a = 0; a <= A; a++) {
    const t = r / N, u = a / A * 2 - 1, ang = u * C.BEAM_HALF;
    pos.push(Math.sin(ang) * t, 0, -Math.cos(ang) * t);
    const k = Math.pow(1 - t, 1.2) * (1 - Math.pow(Math.abs(u), 4)) * Math.min(1, t * 5);
    col.push(1, 0.9, 0.7, k * 0.6);
  }
  for (let r = 0; r < N; r++) for (let a = 0; a < A; a++) { const i = r * (A + 1) + a; idx.push(i, i + 1, i + A + 1, i + 1, i + A + 2, i + A + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  return geo;
}

// шар 1 = «кидає тінь від ліхтаря»; шар 0 лишається, тож головна камера бачить велосипед як раніше
const tagBike = (b) => b.root.traverse(o => o.layers.enable(1));

// Зорі: прив'язані до камери, без Curved World і туману
function makeStars() {
  const pos = [];
  for (let i = 0; i < 900; i++) {
    const u = Math.random() * Math.PI * 2, v = 0.05 + Math.pow(Math.random(), 0.7) * 1.4, r = 6000;
    pos.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xfff4dc, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 });
  mat.onBeforeCompile = () => { };
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

export class View {
  constructor(canvas, assets) {
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3d3b66);
    this.scene.fog = new THREE.Fog(0x3d3b66, 1400, 4200);
    this.camera = new THREE.PerspectiveCamera(44, 1, 10, 9000);
    this.camera.rotation.order = 'YXZ';
    this.lib = new MatLib();
    this.time = 0;
    this.shake = 0;
    this.ghosts = new Map();
    this.dying = [];
    this.fx = [];
    this.flash = 0; this.hurt = 0;
    this.flareK = 0;
    this.camYaw = null;
    this._bikeV = new THREE.Vector3();

    // Світло: пізній вечір
    this.hemi = new THREE.HemisphereLight(0xb7aef0, 0x4d4466, 1.2);
    this.moon = new THREE.DirectionalLight(0xc8d2ff, 1.1);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -950; sc.right = 950; sc.top = 950; sc.bottom = -950; sc.near = 10; sc.far = 3200;
    this.moon.shadow.bias = -0.0005;
    this.moon.shadow.normalBias = 1.5;
    this.dusk = new THREE.DirectionalLight(0xffb49a, 0.4);
    this.scene.add(this.hemi, this.moon, this.moon.target, this.dusk, this.dusk.target);
    this.lantern = new THREE.PointLight(0xffa850, 0, 400, 1.1);
    this.lantern.shadow.mapSize.set(512, 512);
    this.lantern.shadow.camera.near = 4; this.lantern.shadow.camera.far = 500;
    this.lantern.shadow.bias = -0.002;
    // Кубічна тінь ліхтаря (6 рендерів) — лише від велосипеда з вершником (шар 1, див. tagBike).
    // Three r170 у тіньовому проході перевіряє шари головної камери, не shadow.camera, тож фільтруємо через фрустум.
    const ls = this.lantern.shadow, faceFrustum = ls.getFrustum.bind(ls);
    const bikeOnly = { intersectsObject: o => o.layers.isEnabled(1) && faceFrustum().intersectsObject(o) };
    ls.getFrustum = () => bikeOnly;
    this.scene.add(this.lantern);
    // фара велосипеда: прожектор + видимий конус світла на землі (зона, де згорають привиди)
    this.head = new THREE.SpotLight(0xffe2b0, 0, 600, C.BEAM_HALF * 1.3, 0.55, 1);
    this.head.shadow.mapSize.set(512, 512);
    this.head.shadow.bias = -0.002;
    this.scene.add(this.head, this.head.target);
    this.beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(beamGeometry(), this.beamMat);
    this.beam.renderOrder = 2;
    this.scene.add(this.beam);
    this.stars = makeStars();
    this.scene.add(this.stars);
    this.flareLight = new THREE.PointLight(0xffd6f0, 0, 3000, 0.6);
    this.scene.add(this.flareLight);
    this.flareOrb = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.9).multiplyScalar(8) }));
    this.flareOrb.visible = false;
    this.scene.add(this.flareOrb);
    // коло світла на землі
    this.poolMat = new THREE.MeshBasicMaterial({ map: radialTex(null, null, 256, [[0, 'rgba(255,200,130,0.55)'], [0.55, 'rgba(255,170,90,0.22)'], [0.85, 'rgba(255,150,70,0.06)'], [1, 'rgba(255,140,60,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.renderOrder = 2;
    this.scene.add(this.pool);
    // тінь-переслідувач
    this.shadeGhost = new Ghost({ scale: 120, eyeColor: 0xff3d7a, eyeScale: 1.25, body: { color: 0x1a0f2e, emissive: 0x0a0414, inner: 0x5a2a6a, rim: 0x7a3cff } });
    this.shadeGhost.group.visible = false;
    this.shadeGhost.group.rotation.order = 'YXZ';
    this.shadeFog = new THREE.Mesh(new THREE.PlaneGeometry(1100, 760), new THREE.MeshBasicMaterial({ map: radialTex(null, null, 128, [[0, 'rgba(8,0,18,0.95)'], [0.6, 'rgba(8,0,18,0.6)'], [1, 'rgba(8,0,18,0)']]), transparent: true, depthWrite: false }));
    this.shadeFog.rotation.order = 'YXZ';
    this.shadeFog.rotation.x = -Math.PI / 2;
    this.shadeFog.visible = false;
    this.scene.add(this.shadeGhost.group, this.shadeFog);

    this.fogEyes = new FogEyes(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.puffGeo = new THREE.SphereGeometry(1, 8, 6);
    this.coinFxGeo = new THREE.CylinderGeometry(6, 6, 2, 14);
    this.coinFxMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xffa000, emissiveIntensity: 1.5 });
    this.buildShowroom();
  }

  // світова точка для (x, Y траси) на дорозі lane (за замовчуванням — та, якою їде велосипед).
  // Повертає СПІЛЬНИЙ вектор (без алокацій щокадру): одразу копіювати, не тримати між викликами.
  toV(x, Y, h = 0, lane = this.lane) { this.shape.at(Y, x, lane, tmp); return _v.set(tmp.X, h, -tmp.Y); }
  yawAt(Y, lane = this.lane) { this.shape.at(Y, 0, lane, tmp); return yawOf(tmp.hx, tmp.hy); }
  get lane() { return this.sim ? this.sim.lane : 'main'; }

  newLevel(sim) {
    this.sim = sim;
    // Props один на всю гру: кеш геометрій і матеріалів живе між рівнями, а не тече з кожним новим
    if (!this.props) { this.props = new Props(this.lib, this); this.scene.add(this.props.group); }
    this.buildWorld();
    if (!this.bike) { this.bike = new BikeView(this.lib, this.assets); this.scene.add(this.bike.root); tagBike(this.bike); }
    this.clearGhosts();
    this.camYaw = null;
    this.lib.setMode(this.lib.mode, this.scene);
  }

  // дорога й пейзаж рівня
  buildWorld() {
    const s = this.settings;
    if (this.world) { this.scene.remove(this.world.group); this.world.group.traverse(o => { if (o.geometry && !o.isInstancedMesh) o.geometry.dispose(); }); }
    this.shape = new RoadShape(this.sim.route, C.ROAD_CURVE, C.ROAD_WAVE);
    this.world = new Country(this.lib, this.assets, this.sim.route, this.shape, s);
    for (let i = 0; i < this.sim.lit; i++) this.world.lightHouse(this.sim.houses[i].id);
    this.world.lightUpTo(this.sim.bikeWY);
    this.scene.add(this.world.group);
    this.lib.setMode(this.lib.mode, this.world.group);
    if (this.props) this.props.clear();
  }

  clearGhosts() {
    for (const [, g] of this.ghosts) { this.scene.remove(g.group); g.dispose(); }
    this.ghosts.clear();
    for (const d of this.dying) { this.scene.remove(d.g.group); d.g.dispose(); }
    this.dying = [];
  }

  applySettings(s) {
    this.settings = s;
    if (this.lib.mode !== s.shading) this.lib.setMode(s.shading, this.scene);
    const shadowsOn = s.shadows !== 'off';
    // Місяць з нульовою силою (new2: moon 0) — вимкнений зовсім: без тіньового проходу і без рахунку у шейдерах.
    // Кількість світел/тіней Three сам відстежує й перекомпілює шейдери; змінюється лише тут, не щокадру.
    // Ракета й ліхтарі хуторів лишаються visible: вони гаснуть/спалахують у грі, а зміна числа світел = ривок.
    this.moon.visible = s.moon > 0.01;
    this.moon.castShadow = shadowsOn && this.moon.visible;
    // Тіні ліхтаря й фари. Зниження high → medium (автозниження, крок 2) не прибирає їх із шейдерів (це перекомпіляція
    // всіх програм, ~3 с ривка), а гасить: intensity 0 і без оновлення карти — тіньових проходів нема.
    const hi = s.shadows === 'high';
    for (const l of [this.lantern, this.head]) {
      if (hi || !shadowsOn || !l.castShadow) l.castShadow = hi;
      l.shadow.intensity = hi ? 1 : 0; l.shadow.autoUpdate = hi;
    }
    const ms = hi ? 2048 : 1024;
    if (this.moon.shadow.mapSize.x !== ms) { this.moon.shadow.mapSize.set(ms, ms); if (this.moon.shadow.map) { this.moon.shadow.map.dispose(); this.moon.shadow.map = null; } }
    // shadowMap.enabled Three не помічає сам — лише тоді перекомпілюємо матеріали (раніше — на кожен applySettings)
    if (this.renderer.shadowMap.enabled !== shadowsOn) {
      this.renderer.shadowMap.enabled = shadowsOn;
      this.scene.traverse(o => { if (o.material) { const ms2 = Array.isArray(o.material) ? o.material : [o.material]; ms2.forEach(m => m.needsUpdate = true); } });
    }
    this.post.apply(s);
    this.setSkins(s);
    for (const [, g] of this.ghosts) g.setEyeColor(s.eyeColor);
    this.fogEyes.setColor(s.eyeColor);
    DARK.r.value = s.darkRadius;
    HOUSE_GLOW.value = s.houseGlow;
    this.hemi.intensity = s.ambient;
    this.moon.intensity = s.moon;
    this.scene.background.set(s.skyColor);
    this.scene.fog.color.set(s.skyColor);
    this.scene.fog.near = s.fogFar * 0.3; this.scene.fog.far = s.fogFar;
    this.hemi.color.set(s.skyColor).lerp(new THREE.Color(0xffffff), 0.55);
    if (this.world) this.world.setColors(s);
    this.resize();
  }

  setSkins(s) {
    for (const b of [this.bike, this.show && this.show.bike]) {
      if (!b) continue;
      b.setSkin(s.bikeSkin); b.setRiderSkin(s.riderSkin);
      this.lib.setMode(this.lib.mode, b.root);
      tagBike(b); // скін перебудовує меші
    }
    if (this.show) this.setKidSkin(s.riderSkin);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w < 2 || h < 2) return; // прихована вкладка: не створюємо буфери нульового розміру
    const cap = matchMedia('(pointer: coarse)').matches ? 1.5 : 2; // телефони: 3× DPR не тягнуть
    const pr = Math.min(window.devicePixelRatio || 1, cap) * (this.settings ? this.settings.resScale : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // привид у конусі фари світиться (і згорає)
  ghostLight(sim, w) {
    if (sim.flare.active) return 1;
    return sim.inBeam(w.x, w.y, C.WISP_R) ? 0.6 + 0.4 * Math.min(1, w.burn / sim.burnT) : 0.15;
  }

  updateCurve() {
    CURVE.k.value = (this.settings.curveWorld || 0) * CURVE_K;
    CURVE.o.value.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
  }

  onEvent(e, sim) {
    switch (e.type) {
      case 'wispKill': this.killGhost(e.id, e.x, e.y, sim, true); break;
      case 'wispHit': this.killGhost(e.id, e.x, e.y, sim, false); this.hurt = 1; this.shake = Math.max(this.shake, C.SHAKE_MS / 1000); break;
      case 'wispFade': this.fadeGhost(e.id); break;
      case 'shadeHit': this.hurt = 1; this.shake = 0.25; break;
      case 'crash': this.shake = 0.3; this.hurt = 0.8; break;
      case 'checkpoint': this.flash = 0.85; this.world.lightHouse(e.house); break;
      case 'flare': this.flash = 1; this.flareK = 1; break;
      case 'coin': this.coinFx(e.x, e.y, sim, 1, 0); break;
      case 'oil': this.puff(e.x, e.y, 10, 0x7affb0, 10); break;
    }
  }

  killGhost(id, x, y, sim, reward) {
    const g = this.ghosts.get(id);
    if (g) { this.ghosts.delete(id); this.dying.push({ g, t: 0, dur: reward ? 0.32 : 0.25, grow: reward ? 1.6 : 0.3 }); }
    this.puff(x, y, reward ? 14 : 8, reward ? 0xf6f0ff : 0xff6a9a, 26);
    if (reward) this.coinFx(x, y, sim, 3, 0.05);
  }
  fadeGhost(id) {
    const g = this.ghosts.get(id);
    if (g) { this.ghosts.delete(id); this.dying.push({ g, t: 0, dur: 0.6, grow: 0.9 }); }
  }

  puff(x, y, n, color, h) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true });
    mat.userData.n = n; // dispose, коли згасне остання частинка
    const p0 = this.toV(x, y, h);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.puffGeo, mat);
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
      m.position.copy(p0);
      m.scale.setScalar(2 + Math.random() * 3);
      this.scene.add(m);
      this.fx.push({ m, vx: Math.cos(a) * s, vY: Math.sin(a) * s, vh: 30 + Math.random() * 60, t: 0, dur: 0.45 + Math.random() * 0.2, kind: 'puff', mat });
    }
  }

  coinFx(x, y, sim, n, delay) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.coinFxGeo, this.coinFxMat);
      m.position.copy(this.toV(x + (i - 1) * 8, y, 20));
      this.scene.add(m);
      this.fx.push({ m, t: -delay * i, dur: 0.45, kind: 'coin', x0: x + (i - 1) * 8, y0: y });
    }
  }

  // ---------- Вітрина головного екрана: дитина стоїть поруч із велосипедом ----------
  buildShowroom() {
    const L = this.lib, A = this.assets, g = new THREE.Group();
    g.position.copy(SHOW);
    const show = { g, t: 0 };
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(700, 64), null);
    lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.5; lawn.receiveShadow = true;
    L.apply(lawn, L.spec('showLawn', { color: 0x5fb877, rough: 0.7, clear: 0.15, sheen: 0.4 }));
    const walk = new THREE.Mesh(new THREE.BoxGeometry(900, 4, 70), null);
    walk.position.set(0, 2, 30); walk.receiveShadow = true;
    L.apply(walk, L.plastic(0xb9b3c9, { rough: 0.6, clear: 0.3 }));
    const road = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), null);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.2, 200); road.receiveShadow = true;
    L.apply(road, L.plastic(0x4a4a5e, { rough: 0.55, clear: 0.35 }));
    g.add(lawn, walk, road);
    const KS = 145;
    const house = A.models['building-type-d'].clone(); house.scale.setScalar(KS * 1.3);
    house.position.set(-20, 0, -230);
    const sp = L.spec('house:variation-a:true', { map: A.palettes['variation-a'], emissiveMap: A.windowMask, emissive: 0xffb860, emissiveIntensity: 2.4, rough: 0.42, clear: 0.65 });
    house.traverse(o => { if (o.isMesh) { L.apply(o, sp); o.castShadow = true; o.receiveShadow = true; } });
    g.add(house);
    const propSp = L.spec('prop:colormap', { map: A.palettes.colormap, rough: 0.45, clear: 0.5 });
    const prop = (name, s, x, z, ry = 0) => {
      const m = A.models[name].clone(); m.scale.setScalar(KS * s); m.position.set(x, 0, z); m.rotation.y = ry;
      m.traverse(o => { if (o.isMesh) { L.apply(o, propSp); o.castShadow = true; o.receiveShadow = true; } });
      g.add(m); return m;
    };
    prop('tree-large', 1.2, -230, -60, 1); prop('tree-small', 1, 210, -90, 2); prop('tree-large', 1.4, 330, -260, 3);
    prop('fence-1x4', 0.9, 120, -8); prop('fence-1x3', 0.9, -140, -8); prop('planter', 0.8, 60, -40);
    // вуличний ліхтар, що нависає над героєм і велосипедом: конус теплого світла згори, навколо — темрява
    const poleMat = L.plastic(0x5a5470, { rough: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 180, 8), null);
    pole.position.set(-110, 90, 40); L.apply(pole, poleMat); pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 104, 6), null);
    arm.rotation.z = Math.PI / 2; arm.position.set(-60, 176, 40); L.apply(arm, poleMat);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(13, 12, 16, 1, true), null);
    hood.position.set(-10, 172, 44); L.apply(hood, poleMat);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffe3a0, emissive: 0xffb050, emissiveIntensity: 6 }));
    bulb.position.set(-10, 165, 44);
    g.add(pole, arm, hood, bulb);
    const lampLight = new THREE.SpotLight(0xffc98a, 0, 520, 0.5, 0.8, 1.1);
    lampLight.position.set(-10, 162, 44);
    lampLight.target.position.set(-8, 0, 48);
    lampLight.castShadow = true;
    lampLight.shadow.mapSize.set(1024, 1024);
    lampLight.shadow.bias = -0.0015;
    lampLight.shadow.camera.near = 20; lampLight.shadow.camera.far = 400;
    g.add(lampLight, lampLight.target);
    show.lampLight = lampLight;
    // тепла пляма світла на землі під ліхтарем
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTex(null, null, 256, [[0, 'rgba(255,205,140,0.5)'], [0.5, 'rgba(255,175,95,0.2)'], [1, 'rgba(255,150,70,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(-8, 4.5, 48); pool.scale.setScalar(260); pool.renderOrder = 2;
    g.add(pool);
    // м'яке світло спереду (з боку камери) — щоб герой не тонув у темряві
    const fill = new THREE.PointLight(0xb8b0ff, 0, 900, 1.3);
    fill.position.set(60, 90, 330);
    g.add(fill);
    show.fill = fill;
    // світло з вікон будинку: тепле заливне на подвір'я + сяйво на траві
    const win = new THREE.PointLight(0xffb45c, 0, 700, 1.2);
    win.position.set(-20, 70, -120);
    g.add(win);
    show.win = win;
    const winPool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTex(null, null, 256, [[0, 'rgba(255,180,90,0.42)'], [0.55, 'rgba(255,160,70,0.14)'], [1, 'rgba(255,140,60,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    winPool.rotation.x = -Math.PI / 2; winPool.position.set(-20, 1.2, -110); winPool.scale.set(520, 300, 1); winPool.renderOrder = 2;
    g.add(winPool);
    // велосипед на підніжці
    const bike = new BikeView(L, A);
    bike.noRider = true;
    if (bike.rider) bike.rider.visible = false;
    bike.root.position.set(22, 4, 48);
    bike.root.rotation.y = -Math.PI / 2 + 0.35;
    bike.lean.rotation.z = 0.12;
    g.add(bike.root);
    show.bike = bike;
    // дитина
    show.kidMat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.35 });
    if (A.character) {
      const kid = SkeletonUtils.clone(A.character);
      kid.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.material = show.kidMat; o.castShadow = true; o.frustumCulled = false; } });
      kid.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(kid);
      kid.scale.setScalar(62 / (box.max.y - box.min.y || 1));
      kid.position.set(-40, 4, 52);
      kid.rotation.y = 0.35;
      g.add(kid);
      show.kid = kid;
      // анімація idle вантажиться ліниво (потрібна лише меню): A.idle — проміс
      Promise.resolve(A.idle).then(clip => { if (clip) { show.mixer = new THREE.AnimationMixer(kid); show.mixer.clipAction(clip).play(); } });
    }
    this.scene.add(g);
    this.show = show;
  }

  setKidSkin(name) {
    const t = this.assets.skins[name] || Object.values(this.assets.skins)[0];
    if (this.show.kidMat.map !== t) { this.show.kidMat.map = t; this.show.kidMat.needsUpdate = true; }
  }

  updateMenu(dtReal) {
    const dt = Math.min(dtReal, 0.05);
    this.time += dt;
    const S = this.show;
    S.g.visible = true;
    this.menuDark = true;
    S.t += dt;
    if (S.mixer) S.mixer.update(dt);
    const b = S.bike;
    for (const w of b.wheels) w.rotation.x = 0;
    if (b.rider) b.rider.visible = false;
    b.glassMat.opacity = 1;
    S.g.updateMatrixWorld(true);
    S.lampLight.intensity = 600;
    S.fill.intensity = 22;
    S.win.intensity = 260;
    // темрява: світло тримається біля героя, далі — ніч
    const s0 = this.settings;
    DARK.o.value.copy(SHOW).add(new THREE.Vector3(-5, 0, 45));
    DARK.r.value = 105;
    this.moon.intensity = s0.moon * 0.22;
    this.dusk.intensity = 0.06;
    this.scene.background.set(s0.skyColor).multiplyScalar(0.32);
    this.scene.fog.color.copy(this.scene.background);
    // камера: 3/4 спереду, легке погойдування
    const tgt = SHOW.clone().add(new THREE.Vector3(-6, 30, 48));
    const yaw = 0.32 + Math.sin(S.t * 0.35) * 0.12;
    if (this.camera.fov !== MENU_FOV) { this.camera.fov = MENU_FOV; this.camera.updateProjectionMatrix(); }
    const d = Math.max(215, 95 / (Math.tan(THREE.MathUtils.degToRad(MENU_FOV / 2)) * this.camera.aspect));
    this.camera.position.set(tgt.x + Math.sin(yaw) * d, tgt.y + 44, tgt.z + Math.cos(yaw) * d);
    this.camera.lookAt(tgt);
    this.camera.updateMatrixWorld();
    this.post.focusDist = this.camera.position.distanceTo(tgt);
    const proj = tgt.clone().project(this.camera);
    this.post.focusScreenY = proj.y * 0.5 + 0.5;
    const lp = b.glass.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 6, 0));
    this.lantern.position.copy(lp);
    this.lantern.intensity = 45 * this.settings.lanternPower;
    this.lantern.distance = 300;
    this.pool.visible = false;
    this.moon.position.set(SHOW.x - 420, 900, SHOW.z + 500);
    this.moon.target.position.copy(SHOW);
    this.dusk.position.set(SHOW.x + 300, 250, SHOW.z - 2000); this.dusk.target.position.copy(SHOW);
    this.flareLight.intensity = 0; this.flareOrb.visible = false;
    if (this.bike) this.bike.root.visible = false;
    this.head.intensity = 0; this.beam.visible = false;
    this.shadeGhost.group.visible = this.shadeFog.visible = false;
    DARK.amount.value = 0.95;
    DARK.emis.value = 1;
    this.fogEyes.update(dt, 0, 0, (x, Y, h) => this.toV(x, Y, h), this.camera);
    this.updateCurve();
    CURVE.k.value = 0; // у меню світ пласкій: з вигином герой і велосипед «висять» над своїми тінями
    this.hemi.intensity = this.settings.ambient * 0.18;
    const gu = this.post.grade.uniforms;
    gu.flash.value = 0; gu.hurt.value = 0;
    this.post.frame(this.time);
  }

  update(sim, dtReal) {
    const dt = Math.min(dtReal, 0.05);
    this.time += dt;
    const s = this.settings;
    const b = sim.bike, by = sim.bikeWY;
    // мерехтіння при низькій оливі
    this.flickerK = sim.oil < C.FLICKER_BELOW && sim.oil > 0 ? 1 + C.FLICKER_AMP * Math.sin(this.time * C.FLICKER_HZ * Math.PI * 2) * (0.6 + 0.4 * Math.sin(this.time * 37)) : 1;
    const R = sim.lightR * this.flickerK;

    // камера: позаду й над героєм; курс плавно наздоганяє напрям дороги трохи попереду
    const yawT = this.yawAt(by + s.camLook * 0.6);
    if (this.camYaw == null) this.camYaw = yawT;
    let dy = yawT - this.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.camYaw += dy * (1 - Math.exp(-dt * s.camLag));
    const yaw = this.camYaw;
    const g = this.toV(b.x * 0.35, by);
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake -= dt; sx = (Math.random() - 0.5) * 10; sy = (Math.random() - 0.5) * 10; }
    this.camera.position.set(g.x + Math.sin(yaw) * s.camDist + Math.cos(yaw) * sx, s.camHeight + sy, g.z + Math.cos(yaw) * s.camDist - Math.sin(yaw) * sx);
    this.camera.lookAt(this.toV(b.x * 0.35, by + s.camLook, 0));
    if (this.camera.fov !== s.camFov) { this.camera.fov = s.camFov; this.camera.updateProjectionMatrix(); }
    const bikeV = this._bikeV.copy(this.toV(b.x, by, 20));
    if (this.debugCam) { // огляд зблизька для налагодження: __lr.view.debugCam = {d: 120, yaw: 0.6}
      const dc = this.debugCam, tgt = dc.at ? new THREE.Vector3(dc.at[0], dc.at[1], dc.at[2]) : dc.wisp != null && sim.wisps[dc.wisp] ? this.toV(sim.wisps[dc.wisp].x, sim.wisps[dc.wisp].y, 30) : bikeV;
      this.camera.position.set(tgt.x + Math.sin(dc.yaw) * dc.d, tgt.y + dc.d * 0.6, tgt.z + Math.cos(dc.yaw) * dc.d);
      this.camera.lookAt(tgt);
    }
    this.camera.updateMatrixWorld();
    this.updateCurve();
    this.post.focusDist = this.camera.position.distanceTo(bikeV);
    const proj = bikeV.clone().project(this.camera);
    this.post.focusScreenY = proj.y * 0.5 + 0.5;

    // місяць слідує за велосипедом
    const fwd = this.toV(0, by + 200);
    this.moon.position.set(fwd.x - 420, 900, fwd.z + 500);
    this.moon.target.position.copy(fwd);
    this.dusk.position.set(fwd.x + 300, 250, fwd.z - 2000); this.dusk.target.position.copy(fwd);

    this.world.lightK = s.houseLight;
    { const p = this.shape.at(by, b.x, this.lane, tmp); this.world.update(dt, p.X, p.Y); }
    this.world.lightUpTo(by);
    this.props.sync(sim, this.time, by - 600, by + 3000);

    // велосипед і фара
    this.bike.root.visible = !(sim.invuln > 0 && Math.floor(this.time * 16) % 2 === 0);
    const glow = sim.oil > 0 ? (0.35 + 0.65 * sim.oil / 100) * this.flickerK : (sim.flare.active ? 0.15 : 0);
    this.bike.update(dt, b.x, by, b.vx, sim.state === 'lose' ? 0 : sim.speed, glow, (x, Y, h) => this.toV(x, Y, h), this.yawAt(by) - sim.phi);
    const L = sim.lantern;
    this.head.position.copy(this.toV(L.x, L.y, 26));
    this.head.target.position.copy(this.toV(L.x + L.dx * R, L.y + L.dy * R, 0));
    this.head.intensity = R > 0 ? s.lanternPower * 900 * this.flickerK : 0;
    this.head.distance = R * 1.7 + 80;
    this.beam.visible = R > 0;
    this.beam.position.copy(this.toV(L.x, L.y, 1.8));
    this.beam.rotation.y = this.yawAt(L.y) - L.a;
    this.beam.scale.setScalar(Math.max(1, R));
    this.beamMat.opacity = s.lightPool * this.flickerK;
    this.lantern.position.copy(this.toV(L.x, L.y, 40));
    this.lantern.intensity = R > 0 ? 40 * s.lanternPower : 0;
    this.lantern.distance = 220;
    this.pool.visible = false;
    // вітрина меню поза меню схована: її світла й тінь ліхтаря не рахуються в грі
    this.show.g.visible = false;
    // повернути нічне небо й темряву гри після меню
    if (this.menuDark !== false) {
      this.menuDark = false;
      DARK.r.value = s.darkRadius; DARK.emis.value = 0;
      this.moon.intensity = s.moon; this.dusk.intensity = 0.4;
      this.scene.background.set(s.skyColor); this.scene.fog.color.set(s.skyColor);
    }

    // ракета
    if (sim.flare.active) this.flareK = Math.min(1, this.flareK + dt * 4);
    else this.flareK = Math.max(0, this.flareK - dt * 1.5);
    this.flareLight.position.copy(this.toV(b.x, by + 200, 700));
    this.flareLight.intensity = this.flareK * 140;
    this.flareOrb.visible = sim.flare.active;
    if (sim.flare.active) {
      const k = 1 - sim.flare.t / C.FLARE_T;
      this.flareOrb.position.copy(this.toV(b.x * 0.3 + Math.sin(this.time * 3) * 20, by + 560, 260 - k * 120));
      this.flareOrb.scale.setScalar(1 + Math.sin(this.time * 30) * 0.15);
    }
    this.hemi.intensity = s.ambient * (1 + this.flareK * 1.6);
    // темрява навколо героя (ракета її розганяє) і очі в тумані
    DARK.o.value.copy(bikeV);
    DARK.amount.value = s.darkness * (1 - this.flareK);
    this.fogEyes.update(dt, s.fogEyes, by, (x, Y, h) => this.toV(x, Y, h), this.camera);

    // привиди
    const live = this._live || (this._live = new Set());
    live.clear();
    for (const w of sim.wisps) {
      live.add(w.id);
      let gh = this.ghosts.get(w.id);
      if (!gh) {
        gh = new Ghost({ eyeColor: s.eyeColor });
        gh.age = 0;
        gh.group.rotation.order = 'YXZ';
        this.ghosts.set(w.id, gh);
        this.scene.add(gh.group);
      }
      gh.age += dt;
      gh.group.position.copy(this.toV(w.x, w.y, 14));
      const toBike = Math.atan2(b.x - w.x, -(sim.bikeWY - w.y));
      gh.group.rotation.y = this.yawAt(w.y) + THREE.MathUtils.lerp(toBike, 0, 0.25);
      gh.group.rotation.x = 0.25;
      const appear = Math.min(1, gh.age / 0.35);
      const fade = Math.min(1, w.life / 0.8);
      gh.group.scale.setScalar(0.4 + 0.6 * appear);
      gh.update(this.time, this.ghostLight(sim, w), appear * fade);
    }
    for (const [id] of this.ghosts) if (!live.has(id)) this.fadeGhost(id);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const k = d.t / d.dur;
      d.g.group.scale.setScalar(1 + (d.grow - 1) * k);
      d.g.update(this.time, Math.max(d.g.light, 1 - k), 1 - k);
      if (k >= 1) { this.scene.remove(d.g.group); d.g.dispose(); this.dying.splice(i, 1); }
    }
    // Тінь
    const sh = sim.shade;
    const showShade = !!sh || sim.shadeWarn >= 0;
    this.shadeGhost.group.visible = this.shadeFog.visible = showShade;
    if (showShade) {
      const top = sh ? sh.top : sim.scroll - 120 + (1 - sim.shadeWarn / C.SHADE_WARN_T) * 100;
      const sy2 = top - 2.05 * 125;
      // лежить «обличчям до неба», купол спереду: верхній край купола = top
      this.shadeGhost.group.position.copy(this.toV(b.x * 0.4, sy2, 45));
      this.shadeGhost.group.rotation.set(-Math.PI / 2 + 0.25, this.yawAt(sy2), 0);
      this.shadeGhost.update(this.time, 0.9, sh ? 1 : 0.55);
      this.shadeGhost.inner.position.y = 0;
      this.shadeGhost.inner.scale.set(150, 125, 70);
      this.shadeFog.position.copy(this.toV(0, top - 260, 3));
      this.shadeFog.rotation.y = this.yawAt(top - 260);
    }
    // ефекти
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t < 0) continue;
      const k = f.t / f.dur;
      if (f.kind === 'puff') {
        f.m.position.x += f.vx * dt; f.m.position.z -= f.vY * dt; f.m.position.y += f.vh * dt;
        f.mat.opacity = 1 - k;
      } else {
        const e = k * k;
        const p = this.toV(f.x0 + (b.x - f.x0) * e, f.y0 + (sim.bikeWY - f.y0) * e, 20 + Math.sin(k * Math.PI) * 50);
        f.m.position.copy(p);
        f.m.rotation.x = Math.PI / 2; f.m.rotation.z = f.t * 20;
      }
      if (k >= 1) { this.scene.remove(f.m); this.fx.splice(i, 1); if (f.mat && --f.mat.userData.n <= 0) f.mat.dispose(); }
    }
    // пост
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.hurt = Math.max(0, this.hurt - dt * 3);
    const gu = this.post.grade.uniforms;
    gu.flash.value = this.flash * 0.35;
    gu.hurt.value = this.hurt;
    this.post.frame(this.time);
  }
}
