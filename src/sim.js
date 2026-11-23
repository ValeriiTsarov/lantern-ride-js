// Симуляція гри: фіксований крок, детермінована (§15). Без рендеру, працює і в node (бот).
// Рух — уздовж проселкової дороги: Y — пройдена відстань, x — зсув праворуч від осі своєї дороги (lane).
// На розвилці гравець обирає дорогу смугою; відгалуження завжди повертається на основну трасу.
// Повороти: дорога вигинається, а велосипед за інерцією тримає свій курс (phi — кут до дороги), тож його
// відносить назовні повороту — гравець сам «входить» у поворот, кермуючи до внутрішнього краю.
import { C } from './config.js';
import { makeRng } from './rng.js';
import { circleRect, isFree } from './levelgen.js';
import { makeRoute, laneHeading } from './road.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export class Sim {
  constructor(level = 1) {
    this.level = level;
    this.route = makeRoute(level);
    const lk = Math.min(1, (level - 1) / Math.max(1, C.LEVELS - 1));
    this.burnT = C.BURN_T_MIN + (C.BURN_T_MAX - C.BURN_T_MIN) * lk ** C.BURN_POW;
    this.totalCoins = this.route.coins.length;
    this.coinStar = Math.ceil(this.route.mainCoins * C.COIN_STAR_FRAC);
    this.coinsTaken = new Set();
    this.coins = 0;
    this.lit = 0;           // засвічені будинки
    this.choice = {};       // розвилка → 'main' | 'branch'
    this.cpY = 0;
    this.flareEverUsed = false;
    this.continues = 0;
    this.events = [];
    this.time = 0;
    this.seenWisp = false;
    this.seenShade = false;
    this.seenFork = false;
    this.enter(true);
  }

  // кривина дороги, якою їде велосипед: dψ/dY, рад на u
  curvature(Y) {
    const r = this.route, L = this.lane;
    return (laneHeading(r, L, Y + 10, C.ROAD_CURVE, C.ROAD_WAVE) - laneHeading(r, L, Y - 10, C.ROAD_CURVE, C.ROAD_WAVE)) / 20;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  get houses() { return this.route.houses; }
  get nextHouse() { return this.houses[this.lit]; }

  // Старт рівня або продовження від останнього будинку
  enter(fresh) {
    const cp = this.cpY;
    for (const f of this.route.forks) if (f.Y0 >= cp) delete this.choice[f.id];
    for (const c of this.route.cans) if (c.y > cp) c.taken = false;
    this.lane = 'main';
    this.scroll = cp - C.BIKE_START_Y;
    this.bike = { x: 0, y: C.BIKE_START_Y, vx: 0, vy: 0, tx: 0, ty: C.BIKE_START_Y };
    this.lantern = { th: 0, a: 0, w: 0, x: 0, y: 0, dx: 0, dy: 1 };
    this.phi = 0;           // курс велосипеда відносно дороги (+ — праворуч)
    this.hitObs = new Set(); // перешкоди, у які вже влетіли (кожна б'є один раз)
    this.oil = 100;
    this.flare = { available: true, active: false, t: 0 };
    this.flareCan = null;
    this.wisps = [];
    this.invuln = fresh ? 0 : C.INVULN_AFTER;
    this.state = 'ride';
    this.cpT = 0;
    this.sectionRuntime();
    this.updateLantern(0);
  }

  get houseQ() { return Math.min(3, Math.floor(this.lit / this.houses.length * 4)); }

  // Новий відтинок між будинками: Тінь і темп Вогників
  sectionRuntime() {
    this.shade = null;
    this.shadeWarn = -1;
    this.shadeQueue = (C.SHADE_AT[this.houseQ] || []).slice();
    this.spawnT = C.I_START * C.SEG_MULT[this.houseQ] * 0.5;
    this.rng = makeRng(this.level * 1000 + this.lit * 7 + 777 + this.continues * 31);
  }

  get bikeWY() { return this.scroll + this.bike.y; }
  get fork() { return this.lane === 'main' ? null : this.route.forks.find(f => f.id === this.lane); }
  get pendingFork() { const by = this.bikeWY; return this.route.forks.find(f => !(f.id in this.choice) && f.Y0 > by - C.DECIDE_GAP); }
  get progress() {
    const h = this.nextHouse;
    return h ? clamp((this.bikeWY - this.cpY) / Math.max(1, h.Y - this.cpY), 0, 1) : 1;
  }
  get speed() {
    const t = clamp((this.bike.y - C.Y_SLOW) / (C.Y_FAST - C.Y_SLOW), 0, 1);
    return C.V_MIN + (C.V_MAX - C.V_MIN) * t;
  }
  // довжина променя фари
  get lightR() { return this.oil <= 0 ? 0 : C.BEAM_MIN + (C.BEAM_MAX - C.BEAM_MIN) * this.oil / 100; }
  get levelProgress() { return clamp(this.bikeWY / this.route.len, 0, 1); }
  // до якого Y відомо, якою дорогою їде велосипед
  get knownEnd() { const f = this.pendingFork; return f ? f.Y0 : this.route.len; }
  get cans() { return this.route.cans.filter(c => c.lane === this.lane || c.lane === 'main'); }

  // перешкоди на дорозі велосипеда (для зіткнень і бота)
  laneObstacles(y0, y1) { return this.route.obstacles.filter(o => o.lane === this.lane && o.y1 > y0 && o.y0 < y1); }
  // усе, що видно (для рендеру): обидві дороги розвилки. Щокадру, тож без нових масивів: out перевикористовується
  visibleObstacles(y0, y1, out = []) {
    out.length = 0;
    for (const o of this.route.obstacles) if (o.y1 > y0 && o.y0 < y1) out.push(o);
    return out;
  }
  visibleCoins(y0, y1, out = []) {
    out.length = 0;
    for (const c of this.route.coins) if (!this.coinsTaken.has(c.id) && c.y > y0 && c.y < y1) out.push(c);
    return out;
  }

  // §4.3 фара: повертається за кермом (бічна швидкість) з пружиною
  updateLantern(dt) {
    const b = this.bike, L = this.lantern;
    const tt = C.AIM_MAX * clamp(b.vx / C.VX_SWING, -1, 1);
    L.w += (C.SPRING * (tt - L.th) - C.DAMP * L.w) * dt;
    L.th += L.w * dt;
    L.a = L.th + this.phi; // фара дивиться туди, куди їде велосипед
    L.dx = Math.sin(L.a); L.dy = Math.cos(L.a);
    L.x = b.x + C.HEAD_Y * L.dx;
    L.y = this.bikeWY + C.HEAD_Y * L.dy;
  }
  // чи потрапляє коло (x, y, r) у конус фари
  inBeam(x, y, r) {
    const R = this.lightR, L = this.lantern;
    if (R <= 0) return false;
    const dx = x - L.x, dy = y - L.y, d = Math.hypot(dx, dy);
    if (d > R + r) return false;
    if (d < r + 6) return true;
    const a = Math.acos(clamp((dx * L.dx + dy * L.dy) / d, -1, 1));
    return a <= C.BEAM_HALF + Math.asin(Math.min(1, r / d));
  }

  killWispsOnScreen(reason) {
    for (const w of this.wisps) {
      this.coins += C.WISP_COINS;
      this.emit('wispKill', { x: w.x, y: w.y, id: w.id, reason, coins: C.WISP_COINS });
    }
    this.wisps = [];
  }

  // Розвилка: смуга під велосипедом обирає дорогу
  wantsBranch(f, x = this.bike.x) { return f.side * x > C.LANE_T; }
  decide(f) {
    const branch = this.wantsBranch(f);
    this.choice[f.id] = branch ? 'branch' : 'main';
    if (branch) this.lane = f.id;
    this.emit('decide', { fork: f.id, branch });
  }

  checkpoint(h) {
    this.lit++;
    this.cpY = h.Y;
    this.oil = 100;
    this.killWispsOnScreen('house');
    if (this.flare.active) { this.flare.active = false; this.emit('flareEnd'); }
    if (this.shade) { this.emit('shadeGone', { reason: 'house' }); this.shade = null; }
    this.flareCan = null;
    this.emit('checkpoint', { house: h.id, n: this.lit });
    if (h.final) { this.state = 'win'; this.emit('win', this.result()); return; }
    this.state = 'checkpoint';
    this.cpT = C.CP_T;
    this.sectionRuntime();
  }

  // Основний крок. input = {ax, ay} у [−1, 1]
  step(dt, input) {
    if (this.state === 'lose' || this.state === 'win') return;
    this.time += dt;
    const b = this.bike;

    // §4.1 керування: ціль зсувається, велосипед їде до цілі з обмеженою швидкістю
    const ax = clamp(input.ax || 0, -1, 1), ay = clamp(input.ay || 0, -1, 1);
    const xLim = C.SIDEWALK_HALF - C.BIKE_R;
    const kr = 1 - Math.exp(-C.STEER_RESP * dt);
    b.sax = (b.sax || 0) + (ax - (b.sax || 0)) * kr;
    b.say = (b.say || 0) + (ay - (b.say || 0)) * kr;
    b.tx = clamp(b.tx + b.sax * C.KEY_VX * dt, -xLim, xLim);
    b.ty = clamp(b.ty + b.say * C.KEY_VY * dt, C.Y_SLOW, C.Y_FAST);
    // інерція: бажана швидкість до цілі, до неї — з обмеженим прискоренням
    const acc = C.BIKE_ACC * dt;
    b.vx += clamp(clamp((b.tx - b.x) * C.BIKE_K, -C.BIKE_VX_MAX, C.BIKE_VX_MAX) - b.vx, -acc, acc);
    b.vy += clamp(clamp((b.ty - b.y) * C.BIKE_K, -C.BIKE_VY_MAX, C.BIKE_VY_MAX) - b.vy, -acc, acc);
    b.x += b.vx * dt; b.y += b.vy * dt;
    // поворот дороги: курс велосипеда відстає від курсу дороги і зносить його назовні
    const v = this.speed;
    this.phi += (-C.TURN_PUSH * this.curvature(this.bikeWY) * v - C.TURN_GRIP * this.phi) * dt;
    this.phi = clamp(this.phi, -C.PHI_MAX, C.PHI_MAX);
    const drift = v * Math.sin(this.phi) * dt;
    b.x += drift; b.tx = clamp(b.tx + drift, -xLim, xLim);
    // гасимо лише швидкість у бордюр: обнуляти vx до нуля щокроку — і знос назовні не дає розігнатися від краю (заклинювало)
    if (Math.abs(b.x) > xLim) { b.x = clamp(b.x, -xLim, xLim); if (b.vx * b.x > 0) b.vx = 0; }
    if (b.y < C.Y_SLOW || b.y > C.Y_FAST) { b.y = clamp(b.y, C.Y_SLOW, C.Y_FAST); b.vy = 0; }

    // §4.2 швидкість прокрутки
    this.scroll += this.speed * dt;
    const by = this.bikeWY;
    this.updateLantern(dt);
    if (this.invuln > 0) this.invuln -= dt;

    if (this.state === 'checkpoint') {
      this.cpT -= dt;
      if (this.cpT <= 0) this.state = 'ride';
    }
    // розвилка: вибір перед розгалуженням, повернення на основну трасу після злиття
    const pf = this.pendingFork;
    if (pf) {
      if (!this.seenFork && by >= pf.Y0 - C.FORK_HINT) { this.seenFork = true; this.emit('firstFork'); }
      if (by >= pf.Y0 - C.DECIDE_GAP) this.decide(pf);
    }
    const f = this.fork;
    if (f && by >= f.Y1) { this.lane = 'main'; this.emit('merge', { fork: f.id }); }
    // будинок при дорозі
    const h = this.nextHouse;
    if (h && by >= h.Y) { this.checkpoint(h); if (this.state === 'win') return; }

    // §4.4 витік оливи
    const fl = this.flare;
    if (fl.active) {
      fl.t -= dt;
      if (fl.t <= 0) {
        fl.active = false;
        this.emit('flareEnd');
        if (this.oil <= 0) return this.lose('oil');
      }
    } else if (this.state === 'ride' || this.state === 'checkpoint') {
      this.oil -= C.OIL_DRAIN * dt;
    }
    if (this.oil <= 0 && !fl.active) {
      this.oil = 0;
      if (fl.available) this.fireFlare();
      else return this.lose('oil');
    }

    // Перешкоди: удар знімає заряд і відкидає назад, гра триває
    if (this.invuln <= 0) {
      for (const o of this.route.obstacles) { // без filter: це 120 разів на секунду
        if (o.lane !== this.lane || o.y1 <= by - 60 || o.y0 >= by + 60) continue;
        if (this.hitObs.has(o.id) || !circleRect(b.x, by, C.BIKE_R, o)) continue;
        this.hitObs.add(o.id);
        this.oil -= C.HIT_OBSTACLE;
        this.invuln = C.INVULN_AFTER;
        b.ty = Math.max(C.Y_SLOW, b.y - C.OBSTACLE_KNOCK); b.vy = -C.BIKE_VY_MAX;
        this.emit('crash', { x: b.x, y: by, o });
        break;
      }
    }

    // Монети
    for (const c of this.route.coins) {
      if (c.lane !== this.lane || Math.abs(c.y - by) > 30 || this.coinsTaken.has(c.id)) continue;
      if ((c.x - b.x) ** 2 + (c.y - by) ** 2 < (C.BIKE_R + C.COIN_R) ** 2) {
        this.coinsTaken.add(c.id); this.coins++;
        this.emit('coin', { x: c.x, y: c.y, id: c.id, lane: c.lane });
      }
    }
    // Каністри
    const pickR2 = (C.BIKE_R + C.CAN_R) ** 2;
    for (const c of this.route.cans) {
      if (c.taken || c.lane !== this.lane || Math.abs(c.y - by) > 40) continue;
      if ((c.x - b.x) ** 2 + (c.y - by) ** 2 < pickR2) { c.taken = true; this.pickOil(c); }
    }
    if (this.flareCan && !this.flareCan.taken) {
      const c = this.flareCan;
      if ((c.x - b.x) ** 2 + (c.y - by) ** 2 < pickR2) { c.taken = true; this.pickOil(c); }
    }

    this.updateWisps(dt);
    this.updateShade(dt);
  }

  pickOil(c) {
    this.oil = Math.min(100, this.oil + C.OIL_PICKUP);
    this.emit('oil', { x: c.x, y: c.y, id: c.id });
    if (this.state === 'flare') this.state = 'ride';
  }

  fireFlare() {
    const fl = this.flare;
    fl.available = false; fl.active = true; fl.t = C.FLARE_T;
    this.flareEverUsed = true;
    this.state = 'flare';
    this.killWispsOnScreen('flare');
    if (this.shade) { this.emit('shadeGone', { reason: 'flare' }); this.shade = null; }
    this.shadeWarn = -1;
    // Гарантована каністра на вільному місці (лише там, де дорога вже відома)
    const b = this.bike;
    const baseY = Math.max(this.bikeWY + 80, Math.min(this.bikeWY + C.FLARE_DY, this.knownEnd - 60));
    const obs = this.laneObstacles(baseY - 140, baseY + 140);
    let best = null;
    const pad = C.BIKE_R + C.CAN_R + 4;
    for (const ddy of [0, -40, 40, -80, 80]) {
      const y = baseY + ddy;
      for (let k = 0; k <= C.FLARE_DX; k += 10) {
        for (const s of k === 0 ? [1] : [1, -1]) {
          const x = clamp(b.x + s * k, -C.ROAD_HALF + 16, C.ROAD_HALF - 16);
          if (isFree(obs, x, y, pad)) { best = { x, y }; break; }
        }
        if (best) break;
      }
      if (best) break;
    }
    if (!best) best = { x: b.x, y: baseY };
    this.flareCan = { id: 'flare' + this.time.toFixed(3), x: best.x, y: best.y, taken: false };
    this.emit('flare', { can: this.flareCan });
  }

  lose(reason) {
    this.state = 'lose';
    this.loseReason = reason;
    this.emit('lose', { reason });
  }

  continueFromCheckpoint() {
    this.continues++;
    this.enter(false);
    this.emit('continue', { cpY: this.cpY });
  }

  result() {
    const stars = [true, this.coins >= this.coinStar, !this.flareEverUsed];
    return { stars, coins: this.coins, continues: this.continues, need: this.coinStar };
  }

  wispInterval() {
    return lerp(C.I_START, C.I_END, this.progress) * C.SEG_MULT[this.houseQ] * this.route.wispK;
  }

  // §6.1 Вогники: вилітають з полів обабіч, летять на велосипед; у конусі фари згорають за BURN_T
  updateWisps(dt) {
    const b = this.bike, by = this.bikeWY;
    const room = this.knownEnd - 30;
    const canSpawn = !this.flare.active && this.state === 'ride' && by - this.cpY >= C.SAFE_AFTER_CP && room > by + 160;
    if (canSpawn) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = this.wispInterval();
        if (this.wisps.length < C.WISP_MAX) {
          let x, y;
          if (this.rng() < C.WISP_ON_ROAD) { // просто на дорозі попереду
            x = (this.rng() * 2 - 1) * (C.ROAD_HALF - 30);
            y = Math.min(room, by + C.WISP_ROAD_Y0 + C.WISP_ROAD_DY * this.rng());
          } else { // з поля обабіч
            x = (this.rng() < 0.5 ? -1 : 1) * (C.MIN_W / 2 + C.WISP_FIELD_X);
            y = Math.min(room, by + C.WISP_FIELD_Y0 + C.WISP_FIELD_DY * this.rng());
          }
          const w = { id: Math.floor(this.time * 1000) + ':' + Math.floor(this.rng() * 1e6), x, y, a: Math.atan2(by - y, b.x - x), life: C.WISP_LIFE, burn: 0 };
          this.wisps.push(w);
          this.emit('wispSpawn', { id: w.id });
          if (!this.seenWisp) { this.seenWisp = true; this.emit('firstWisp'); }
        }
      }
    }
    const br2 = (C.BIKE_R + C.WISP_R) ** 2;
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      const want = Math.atan2(by - w.y, b.x - w.x);
      let da = want - w.a;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const maxT = C.WISP_TURN * dt;
      w.a += clamp(da, -maxT, maxT);
      const lit = this.inBeam(w.x, w.y, C.WISP_R);
      if (lit) {
        // світло тримає привида: він відступає вперед разом із велосипедом і повільно горить
        w.y += this.speed * C.WISP_HOLD * dt;
        w.burn += dt;
      } else {
        const wv = w.y > by + 40 ? C.WISP_V_FRONT : w.y < by - 10 ? C.WISP_V_BACK : C.WISP_V;
        w.x += Math.cos(w.a) * wv * dt;
        w.y += Math.sin(w.a) * wv * dt;
        w.burn = Math.max(0, w.burn - dt * C.BURN_DECAY);
        w.life -= dt;
      }
      if (w.burn >= this.burnT) {
        this.wisps.splice(i, 1);
        this.coins += C.WISP_COINS;
        this.emit('wispKill', { x: w.x, y: w.y, id: w.id, reason: 'lantern', coins: C.WISP_COINS });
        continue;
      }
      if ((w.x - b.x) ** 2 + (w.y - by) ** 2 < br2) {
        this.wisps.splice(i, 1);
        this.oil -= C.HIT_WISP;
        this.emit('wispHit', { x: w.x, y: w.y, id: w.id });
        continue;
      }
      if (w.life <= 0) { this.wisps.splice(i, 1); this.emit('wispFade', { id: w.id, x: w.x, y: w.y }); }
    }
  }

  updateShade(dt) {
    if (this.flare.active || this.state === 'checkpoint') return;
    const p = this.progress;
    if (this.shadeWarn < 0 && !this.shade && this.shadeQueue.length && p >= this.shadeQueue[0]) {
      this.shadeQueue.shift();
      this.shadeWarn = C.SHADE_WARN_T;
      this.emit('shadeWarn');
      if (!this.seenShade) { this.seenShade = true; this.emit('firstShade'); }
    }
    if (this.shadeWarn >= 0) {
      this.shadeWarn -= dt;
      if (this.shadeWarn < 0) {
        this.shade = { top: this.scroll };
        this.emit('shadeSpawn');
      }
    }
    const s = this.shade;
    if (!s) return;
    s.top += C.SHADE_V * dt;
    if (s.top >= this.bikeWY - C.BIKE_R) {
      this.oil -= C.HIT_SHADE;
      this.shade = null;
      this.emit('shadeHit');
    } else if (s.top < this.scroll - C.SHADE_ESCAPE) {
      this.coins += C.SHADE_COINS;
      this.shade = null;
      this.emit('shadeEscape', { coins: C.SHADE_COINS });
    }
  }
}
