// Точка входу: головний екран, цикл гри, стани, HUD, мінікарта.
import { C } from './config.js';
import { Sim } from './sim.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { loadAssets } from './render/assets.js';
import { View } from './render/view.js';
import { BIKE_SKINS } from './render/bike.js';
import { HERO_SKINS } from './render/assets.js';
import { BUILD } from './env.js';
import { initPoki, pokiLoaded, pokiGameplay, pokiBreak } from './poki.js';
import { Shop } from './shop.js';
import { loadSettings, saveSettings, SettingsPanel } from './settings.js';
import { botInput } from './bot.js';
import { t, setLang, applyDom } from './i18n.js';

const AUTOPLAY = !BUILD && new URLSearchParams(location.search).has('bot');

const $ = (id) => document.getElementById(id);
const audio = new Audio();
const settings = loadSettings();
setLang(settings.lang);
applyDom();

// Прогрес: відкриті рівні, зірки, гаманець монет і куплені скіни (§13). v — версія формату (міграції — тут).
// Невідомі ключі з сейва лишаються (Object.assign), тож новіша версія гри їх не губить.
// Битий сейв не затираємо мовчки: сирий рядок — у lr.progress_bad.
const PROGRESS_V = 1;
function loadProgress() {
  const base = () => ({ v: PROGRESS_V, unlocked: 1, stars: {}, last: 1, wallet: 0, bikes: [], heroes: [] });
  let raw = null, p;
  try { raw = localStorage.getItem('lr.progress'); } catch { }
  try {
    const j = raw ? JSON.parse(raw) : {};
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('not an object');
    p = Object.assign(base(), j);
  } catch {
    try { localStorage.setItem('lr.progress_bad', raw); } catch { }
    p = base();
  }
  p.v = PROGRESS_V;
  if (!Array.isArray(p.bikes)) p.bikes = [];
  if (!Array.isArray(p.heroes)) p.heroes = [];
  for (const [id, c] of Object.entries(C.BIKE_PRICES)) if (!c && !p.bikes.includes(id)) p.bikes.push(id);
  for (const [id, c] of Object.entries(C.HERO_PRICES)) if (!c && !p.heroes.includes(id)) p.heroes.push(id);
  return p;
}
function saveProgress(p) { try { localStorage.setItem('lr.progress', JSON.stringify(p)); } catch { } }
let progress; // читаємо після initPoki (стандарт п. 4)

// Автозниження графіки (як у Мурахах, але покроково). У грі, вкладка видна: FPS < LOW_FPS LOW_SECS с поспіль →
// наступний крок LOW_STEPS поверх налаштувань гравця. Крок пам'ятаємо (lr.gfxLow) — назад не піднімаємо.
// Гравець сам змінив графіку → автозниження вимкнено (-1); «Скинути» в налаштуваннях → знову ввімкнено з нуля.
// ponytail: лише вниз і назавжди; якщо скаржитимуться на «мило» після разового підвисання — додати підйом за стабільних 55+ FPS.
const LOW_FPS = 25, LOW_SECS = 5;
const LOW_STEPS = [
  { dofMode: 'tilt' },                 // bokeh рендерить сцену вдруге
  { shadows: 'medium' },               // без тіней ліхтаря (кубічна — 6 проходів) і фари
  { resScale: 0.75 },
  { shadows: 'off', aa: false },
  { shading: 'simple', bloom: false }, // Lambert замість PBR з лаком
];
const GFX_USER = ['preset', 'resScale', 'shadows', 'aa', 'bloom', 'dofMode', 'shading'];
const AUTO_GFX = !(!BUILD && new URLSearchParams(location.search).has('dev')); // у панелі розробника — не чіпаємо
let gfxLow = 0;
try { gfxLow = Math.max(-1, Math.min(LOW_STEPS.length, parseInt(localStorage.getItem('lr.gfxLow') || '0', 10) || 0)); } catch { }
function setGfxLow(n) { gfxLow = n; try { localStorage.setItem('lr.gfxLow', String(n)); } catch { } }
// налаштування гравця + кроки автозниження → рендер
function applyGfx() {
  const s = { ...settings };
  for (let i = 0; i < gfxLow; i++) Object.assign(s, LOW_STEPS[i]);
  view.applySettings(s);
}
let lowT = 0, lowN = 0, lowAcc = 0;
function watchFps(rawDt, playing) {
  if (!AUTO_GFX || gfxLow < 0 || gfxLow >= LOW_STEPS.length || !playing || document.hidden) { lowT = lowN = lowAcc = 0; return; }
  lowAcc += rawDt; lowN++;
  if (lowAcc < 1) return;
  const fps = lowN / lowAcc; lowAcc = lowN = 0;
  lowT = fps < LOW_FPS ? lowT + 1 : 0;
  if (lowT >= LOW_SECS) { lowT = 0; setGfxLow(gfxLow + 1); applyGfx(); }
}

let view, sim, input, panel, shop, banked = 0;
let acc = 0, last = performance.now(), slowmo = 0, hitstop = 0;
let paused = false, gfxOpen = false, modal = null, menu = false, waitInput = false;
let hintT = 0, crackleT = 0, tutT = 0, loseDelay = -1, seenCrash = false;

async function boot() {
  await initPoki();
  progress = loadProgress();
  const assets = await loadAssets(p => { $('lprog').style.width = Math.round(p * 100) + '%'; });
  view = new View($('c'), assets);
  input = new Input($('touch'), $('joy'), $('knob'));
  applyGfx();
  addEventListener('resize', () => view.resize());
  // скіни з налаштувань мають бути куплені
  if (!progress.bikes.includes(settings.bikeSkin)) settings.bikeSkin = progress.bikes[0];
  if (!progress.heroes.includes(settings.riderSkin)) settings.riderSkin = progress.heroes[0];
  view.setSkins(settings);
  panel = new SettingsPanel($('gfx'), settings, (s, key) => {
    if (key === 'lang' || key === '*') setLanguage(s.lang);
    if (key === '*') setGfxLow(0); else if (GFX_USER.includes(key) && gfxLow >= 0) setGfxLow(-1);
    applyGfx(); applyUser(s); updateSkinName(); }, { dev: !BUILD && new URLSearchParams(location.search).has('dev') });
  panel.onClose = () => toggleGfx(false);
  applyUser(settings);
  shop = new Shop($('shop'), { progress, settings, view, audio, save: () => { saveProgress(progress); saveSettings(settings); }, onChange: () => { updateSkinName(); updateWallet(); } });
  shop.onClose = () => toggleShop(false);
  wireUi();
  // одразу в рівень (стандарт п. 6): останній відкритий, стоїмо з пальцем-підказкою до першого вводу
  startLevel(Math.min(progress.last || progress.unlocked, progress.unlocked));
  waitInput = !AUTOPLAY;
  tutT = Math.max(tutT, 1);
  $('loading').style.opacity = 0;
  setTimeout(() => $('loading').remove(), 600);
  requestAnimationFrame(frame);
  pokiLoaded($('c'));
}

// Interstitial порталу між рівнями (не після смерті): пауза вже є — гравець у модалці; глушимо звук.
let adBusy = false;
function adThen(fn) {
  if (adBusy) return;
  adBusy = true;
  pokiBreak(() => audio.setAdMute(true)).then(() => { audio.setAdMute(false); adBusy = false; fn(); });
}

// Мова: статичний HTML, панелі, назви скінів
function setLanguage(l) {
  setLang(l); applyDom();
  if (panel) panel.render();
  if (shop && shopOpen) shop.render();
  updateSkinName();
}

// Монети забігу — у гаманець (після рівня, виходу в меню, перезапуску)
function bank() {
  if (!sim) return;
  const d = sim.coins - banked;
  if (d > 0) { progress.wallet += d; banked = sim.coins; saveProgress(progress); updateWallet(); }
}
function updateWallet() { $('wallet').textContent = progress.wallet; }

// Налаштування гравця: звук, керування, FPS
function applyUser(s) {
  audio.setVolume({ master: s.volMaster, music: s.volMusic, sfx: s.volSfx });
  if (input) Object.assign(input.cfg, { joySens: s.joySens, joyDead: s.joyDead, keySens: s.keySens });
  $('fps').style.display = s.showFps || !BUILD ? '' : 'none';
}

function loadLevel(level) {
  bank();
  banked = 0;
  progress.last = level; saveProgress(progress);
  sim = new Sim(level);
  view.newLevel(sim);
  acc = 0; slowmo = 0; hitstop = 0; loseDelay = -1;
  buildHouses();
  updateHud(true);
}

function startLevel(level) {
  loadLevel(level);
  showMenu(false);
  closeModals();
  tutT = level === 1 ? 6 : 0;
  hint(level === 1 ? t('hint.level1') : t('hint.level', { n: level }), 2.5);
}

function showMenu(on) {
  menu = on;
  document.body.classList.toggle('menu', on);
  $('menu').classList.toggle('on', on);
  if (on) { closeModals(); hint(''); updateSkinName(); updateWallet(); } else toggleShop(false);
}

function cycleSkin(d) {
  const own = BIKE_SKINS.filter(s => progress.bikes.includes(s.id));
  const i = own.findIndex(s => s.id === settings.bikeSkin);
  const n = own[(i + d + own.length) % own.length];
  settings.bikeSkin = n.id;
  saveSettings(settings);
  view.setSkins(settings);
  updateSkinName();
  audio.play('click');
  if (panel && gfxOpen) panel.render();
}
function updateSkinName() {
  const s = BIKE_SKINS.find(k => k.id === settings.bikeSkin) || BIKE_SKINS[0];
  $('skName').textContent = t('bike.' + s.id);
}

function hint(text, dur = 2.5) {
  const h = $('hint');
  if (!text) { h.classList.remove('on'); return; }
  h.textContent = text; h.classList.add('on'); hintT = dur;
}

function wireUi() {
  const unlock = () => audio.unlock();
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  $('bSound').textContent = audio.muted ? '🔇' : '🔊';
  $('bSound').onclick = () => { audio.unlock(); audio.setMuted(!audio.muted); $('bSound').textContent = audio.muted ? '🔇' : '🔊'; };
  $('bPause').onclick = () => setPause(!paused);
  $('bResume').onclick = () => setPause(false);
  $('bGfx').onclick = () => toggleGfx();
  $('bMenuGfx').onclick = () => toggleGfx();
  $('bLevels').onclick = () => showLevels();
  $('bMenuLevels').onclick = () => showLevels();
  $('bLevelsClose').onclick = () => { closeModals(); if (!menu) setPause(false); };
  $('bContinue').onclick = () => { audio.play('click'); closeModals(); sim.continueFromCheckpoint(); view.clearGhosts(); };
  $('bNext').onclick = () => adThen(() => startLevel(Math.min(sim.level + 1, C.LEVELS)));
  $('bRetry').onclick = () => startLevel(sim.level);
  $('bPlay').onclick = () => { audio.play('click'); startLevel(sim.level); };
  $('bMenu').onclick = () => { loadLevel(sim.level); showMenu(true); };
  $('bWinMenu').onclick = () => adThen(() => { loadLevel(Math.min(progress.unlocked, C.LEVELS)); showMenu(true); });
  $('skPrev').onclick = () => cycleSkin(-1);
  $('skNext').onclick = () => cycleSkin(1);
  $('bShop').onclick = () => { audio.play('click'); toggleShop(); };
  $('bHudShop').onclick = () => { if (modal || sim.state === 'lose' || sim.state === 'win') return; audio.play('click'); toggleShop(); };
  addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.code === 'Escape') e.target.blur(); return; }
    if (e.code === 'Tab') { e.preventDefault(); toggleGfx(); return; }
    if (shopOpen) { if (e.code === 'Escape') toggleShop(false); return; }
    if (menu && !modal && !gfxOpen) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycleSkin(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') cycleSkin(1);
      else if (e.code === 'Enter' || e.code === 'Space') $('bPlay').click();
      return;
    }
    if (e.code === 'Escape') { if (gfxOpen) toggleGfx(false); else if (!menu && (!modal || modal === 'mPause')) setPause(!paused); }
    else if (e.code === 'KeyP') { if (!menu && (!modal || modal === 'mPause')) setPause(!paused); }
    else if (e.code === 'Enter' || e.code === 'Space') {
      if (modal === 'mLose') $('bContinue').click();
      else if (modal === 'mWin') $('bNext').click();
      else if (modal === 'mPause') setPause(false);
    }
  });
  addEventListener('blur', () => { if (!modal && !menu) setPause(true); });
  // прихована вкладка: повна тиша одразу (rAF у фоні стоїть, тож не чекаємо кадру), QA порталів
  document.addEventListener('visibilitychange', () => {
    audio.setHidden(document.hidden);
    if (document.hidden) { bank(); if (!modal && !menu) setPause(true); }
  });
}

function toggleGfx(on = !gfxOpen) {
  gfxOpen = on;
  if (on) toggleShop(false);
  $('gfx').classList.toggle('on', on);
}
let shopOpen = false;
function toggleShop(on = !shopOpen) {
  shopOpen = on;
  // з HUD посеред рівня: гра стоїть (running), монети забігу вже в гаманці
  if (on) { bank(); toggleGfx(false); shop.open(); } else if (shop) shop.close();
  $('shop').classList.toggle('on', on);
}

function setPause(p) {
  if (menu) return;
  if (sim && (sim.state === 'lose' || sim.state === 'win')) return;
  paused = p;
  if (p) showModal('mPause'); else closeModals();
}
function showModal(id) { closeModals(); modal = id; $(id).classList.add('on'); }
function closeModals() { for (const m of document.querySelectorAll('.modal')) m.classList.remove('on'); modal = null; if (!gfxOpen) paused = false; }

function showLevels() {
  paused = true;
  const list = $('levelList');
  list.innerHTML = '';
  for (let l = 1; l <= C.LEVELS; l++) {
    const b = document.createElement('button');
    const st = progress.stars[l] || [false, false, false];
    b.innerHTML = `${l}<small>${st.map(s => s ? '★' : '☆').join('')}</small>`;
    b.disabled = l > progress.unlocked;
    b.onclick = () => adThen(() => startLevel(l));
    list.appendChild(b);
  }
  showModal('mLevels');
}

function onEvent(e) {
  view.onEvent(e, sim);
  switch (e.type) {
    case 'wispKill': if (e.reason === 'lantern') { hitstop = C.HITSTOP_MS / 1000; } audio.play('poof'); bumpCoins(); break;
    case 'wispHit': audio.play('hiss'); break;
    case 'shadeHit': audio.play('hiss'); break;
    case 'coin': audio.play('coin'); bumpCoins(); break;
    case 'oil': audio.play('glug'); break; // підібрали батарейку
    case 'flare': audio.play('flare'); hint(t('hint.flare'), 2); break;
    case 'checkpoint': audio.play('house'); slowmo = C.SLOWMO_T; audio.bright = true; if (sim.state !== 'win') hint(t('hint.house', { n: e.n, total: sim.houses.length }), 2); break;
    case 'firstFork': hint(t('hint.fork'), 3.5); break;
    case 'shadeWarn': audio.play('shade'); hint(t('hint.shade'), 2.5); break;
    case 'shadeEscape': audio.play('escape'); bumpCoins(); hint(t('hint.escape', { n: C.SHADE_COINS }), 1.2); break;
    case 'firstWisp': hint(t('hint.wisp'), 3.5); break;
    case 'crash': audio.play('crash'); hitstop = C.HITSTOP_MS / 1000; if (!seenCrash) { seenCrash = true; hint(t('hint.crash', { n: C.HIT_OBSTACLE }), 2); } break;
    case 'lose': loseDelay = 0.7; audio.play('lose'); break;
    case 'win': onWin(e); break;
  }
}

function onWin(r) {
  audio.play('win');
  const l = sim.level;
  const prev = progress.stars[l] || [false, false, false];
  progress.stars[l] = prev.map((v, i) => v || r.stars[i]);
  progress.unlocked = Math.max(progress.unlocked, Math.min(C.LEVELS, l + 1));
  saveProgress(progress);
  const got = sim.coins - banked;
  bank();
  const spans = $('winStars').children;
  r.stars.forEach((s, i) => { spans[i].className = s ? 'on' : ''; spans[i].style.animationDelay = (0.2 + i * 0.25) + 's'; });
  $('winText').innerHTML = t('win.coins', { coins: r.coins, need: r.need }) + (r.stars[2] ? '' : `<br><small>${t('win.star3')}</small>`) +
    `<br><small>${t('win.wallet', { got, wallet: progress.wallet })}</small>`;
  $('bNext').style.display = l < C.LEVELS ? '' : 'none';
  setTimeout(() => showModal('mWin'), 900);
}

let coinsShown = -1;
function bumpCoins() { const c = $('coins'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }

function buildHouses() {
  const h = $('houses');
  h.innerHTML = '';
  for (let i = 0; i < sim.houses.length; i++) { const el = document.createElement('i'); el.textContent = '🏠'; h.appendChild(el); }
}

// HUD: елементи шукаємо один раз, у DOM пишемо лише змінене (щокадрові querySelector/classList коштували мс на слабкому CPU)
let H = null;
const hudLast = {};
function setCls(el, key, cls, on) { if (hudLast[key] !== on) { hudLast[key] = on; el.classList.toggle(cls, on); } }
const MAP_EVERY = 0.1; // мінікарта ~10 разів/с: велосипед на ній рухається на пікселі
let mapT = 0;
function updateHud(force, dt = 0) {
  if (!H) {
    const map = $('map');
    H = { oil: $('oil'), oilFill: $('oil').querySelector('.fill'), flare: $('flare'), coinsB: $('coins').querySelector('b'),
      houses: $('houses'), shadeWarn: $('shadeWarn'), map, mapG: map.getContext('2d') };
  }
  if (force) for (const k in hudLast) delete hudLast[k];
  const oil = Math.max(0, sim.oil);
  const ow = Math.round(oil * 10) / 10; // до 0,1 % — смуга однакова, а запис у style рідше
  if (hudLast.oilW !== ow) { hudLast.oilW = ow; H.oilFill.style.width = ow + '%'; }
  setCls(H.oil, 'low', 'low', oil < C.FLICKER_BELOW);
  setCls(H.flare, 'used', 'used', !sim.flare.available);
  if (sim.coins !== coinsShown || force) { coinsShown = sim.coins; H.coinsB.textContent = sim.coins; }
  if (hudLast.lit !== sim.lit) {
    hudLast.lit = sim.lit;
    const hs = H.houses.children, done = sim.lit;
    for (let i = 0; i < hs.length; i++) { hs[i].className = i < done ? 'on' : i === done ? 'next' : ''; }
  }
  setCls(H.shadeWarn, 'swOn', 'on', sim.shadeWarn >= 0);
  setCls(H.shadeWarn, 'swChase', 'chase', !!sim.shade);
  mapT -= dt;
  if (force || mapT <= 0) { mapT = MAP_EVERY; drawMap(); }
}

// Мінікарта: уся дорога (проїхане — золоте), відгалуження, будинки, велосипед
let mapCache = null;
function drawMap() {
  const g = H.mapG, W = H.map.width, pad = 26;
  const shape = view.shape, R = sim.route;
  if (!mapCache || mapCache.shape !== shape) {
    const pt = (Y, lane) => shape.at(Y, 0, lane, {});
    const main = [];
    for (let Y = 0; Y <= R.len + 300; Y += 100) main.push([Y, pt(Y, 'main')]);
    const forks = R.forks.map(f => { const p = []; for (let Y = f.Y0; Y <= f.Y1; Y += 100) p.push(pt(Y, f.id)); return p; });
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [, p] of main) { x0 = Math.min(x0, p.X); x1 = Math.max(x1, p.X); y0 = Math.min(y0, p.Y); y1 = Math.max(y1, p.Y); }
    for (const f of forks) for (const p of f) { x0 = Math.min(x0, p.X); x1 = Math.max(x1, p.X); }
    const k = (W - pad * 2) / Math.max(x1 - x0, y1 - y0);
    const ox = (W - (x1 - x0) * k) / 2, oy = (W - (y1 - y0) * k) / 2;
    const P = (p) => [ox + (p.X - x0) * k, W - (oy + (p.Y - y0) * k)];
    // статичний шар (дороги) — один раз на рівень в окреме полотно
    const bg = document.createElement('canvas'); bg.width = bg.height = W;
    const bgc = bg.getContext('2d'); bgc.lineCap = bgc.lineJoin = 'round';
    const stroke = (c, pts, col, w) => { if (pts.length < 2) return; c.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
    for (const f of forks) stroke(bgc, f, 'rgba(255,215,120,.55)', 4);
    stroke(bgc, main.map(m => m[1]), 'rgba(230,225,255,.42)', 6);
    mapCache = { shape, main, bg, P, houses: R.houses.map(h => pt(h.Y, 'main')) };
  }
  const M = mapCache, by = sim.bikeWY;
  g.clearRect(0, 0, W, W);
  g.drawImage(M.bg, 0, 0);
  g.lineCap = g.lineJoin = 'round';
  // пройдене — золоте, зі світінням
  g.beginPath();
  for (let i = 0; i < M.main.length && M.main[i][0] <= by; i++) { const [x, y] = M.P(M.main[i][1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  // світіння без shadowBlur (він дорогий у canvas 2D): той самий шлях ширшим напівпрозорим штрихом під основним
  g.strokeStyle = 'rgba(255,176,64,.3)'; g.lineWidth = 17; g.stroke();
  g.strokeStyle = 'rgba(255,176,64,.45)'; g.lineWidth = 11; g.stroke();
  g.strokeStyle = '#ffc94a'; g.lineWidth = 7; g.stroke();
  g.font = '22px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  M.houses.forEach((p, i) => { const [x, y] = M.P(p); g.globalAlpha = i < sim.lit ? 1 : 0.4; g.fillText(sim.houses[i].final ? '🏡' : '🏠', x, y - 12); });
  g.globalAlpha = 1;
  const b = view.shape.at(by, sim.bike.x, sim.lane, mapPt);
  const [bx, bY] = M.P(b);
  g.save(); g.translate(bx, bY); g.rotate(Math.atan2(b.hx, b.hy));
  g.fillStyle = '#ff8a3d'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 9); g.lineTo(0, 4); g.lineTo(-9, 9); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
const mapPt = {};

let fpsAcc = 0, fpsN = 0, fpsEl = null, tutEl = null, tutOn = null;
function setTut(on) { if (tutOn !== on) { tutOn = on; (tutEl ||= $('tut')).classList.toggle('on', on); } }
function frame(now) {
  const rawDt = (now - last) / 1000; last = now;
  const dt = Math.min(rawDt, C.FRAME_DT_MAX);
  // FPS — із сирого часу кадру (обрізаний dt не покаже нижче 20)
  fpsAcc += rawDt; fpsN++;
  if (fpsAcc > 0.5) { (fpsEl ||= $('fps')).textContent = Math.round(fpsN / fpsAcc) + ' FPS' + (gfxLow > 0 ? ' · L' + gfxLow : ''); fpsAcc = 0; fpsN = 0; }
  audio.setDuck(!menu && (paused || gfxOpen || shopOpen || !!modal));
  if (menu) {
    pokiGameplay(false);
    view.updateMenu(dt);
    requestAnimationFrame(frame);
    return;
  }
  if (waitInput && input.used) waitInput = false;
  const running = !paused && !gfxOpen && !shopOpen && !modal && !waitInput;
  watchFps(rawDt, running && sim.state !== 'lose' && sim.state !== 'win');
  pokiGameplay(running && sim.state !== 'lose' && sim.state !== 'win');
  if (running && sim.state !== 'lose' && sim.state !== 'win') {
    let sdt = dt;
    if (hitstop > 0) { hitstop -= dt; sdt = 0; }
    if (slowmo > 0) { slowmo -= dt; sdt *= C.SLOWMO_K; }
    acc += sdt;
    const ax = input.axis();
    for (let n = 0; acc >= C.SIM_DT; n++) {
      if (n >= C.SIM_STEPS_MAX) { acc = 0; break; } // кадр не встигає: гра сповільнюється, а не завмирає
      sim.step(C.SIM_DT, AUTOPLAY ? botInput(sim) : ax);
      acc -= C.SIM_DT;
      for (const e of sim.events) onEvent(e);
      sim.events.length = 0;
      if (sim.state === 'lose' || sim.state === 'win') { acc = 0; break; }
    }
    if (sim.oil < C.FLICKER_BELOW && sim.oil > 0) { crackleT -= dt; if (crackleT <= 0) { crackleT = 0.18 + Math.random() * 0.25; audio.play('crackle'); } }
  }
  if (loseDelay >= 0) {
    loseDelay -= dt;
    if (loseDelay < 0) {
      showModal('mLose');
    }
  }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint(''); }
  if (tutT > 0 && !AUTOPLAY) {
    if (input.used) tutT -= dt * 2.5; else tutT = Math.max(tutT, 1);
    setTut(tutT > 0);
  } else setTut(false);
  view.update(sim, running ? dt : 0);
  updateHud(false, dt);
  requestAnimationFrame(frame);
}

// хук налагодження лише в деві: у прод-білді його ганяли скрипти порталу (Petal Pour, CrazyGames)
if (!BUILD) window.__lr = {
  get sim() { return sim; }, get view() { return view; }, get progress() { return progress; }, settings, audio,
  start(l = 1) { startLevel(l); },
  // автозниження графіки: __lr.gfxLow(2) — крок 2, __lr.gfxLow(0) — повна графіка
  gfxLow(n) { setGfxLow(n); applyGfx(); },
  // перемотка для налагодження: __lr.ff(10)
  ff(sec) { for (let t = 0; t < sec && sim.state !== 'win'; t += C.SIM_DT) { sim.step(C.SIM_DT, botInput(sim)); for (const e of sim.events) onEvent(e); sim.events.length = 0; if (sim.state === 'lose') { closeModals(); loseDelay = -1; sim.continueFromCheckpoint(); } } },
};
boot().catch(err => { console.error(err); $('loading').querySelector('p').textContent = t('error') + err.message; });
