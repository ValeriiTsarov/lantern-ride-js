// Налаштування (Tab). Гравцю — USER_SCHEMA: графіка, звук, керування. Розробнику (лише не в білді) — SCHEMA:
// шейдери, блум, фокус, кольори, камера, дорога, скіни. Зберігаються в localStorage.
import { BIKE_SKINS } from './render/bike.js';
import { HERO_SKINS } from './render/assets.js';
import { t, LANGS } from './i18n.js';
import { PRESETS, DEFAULT_PRESET } from './presets.js';
import { BUILD } from './env.js';
import { CREDITS } from './credits.js';

export const DEFAULTS = {
  ver: 4, preset: 'high',
  // шейдери
  shading: 'plastic', shadows: 'medium', resScale: 1, aa: true, lanternPower: 1, lightPool: 0.7, ambient: 1.2, moon: 1.1,
  // засвічені будинки
  houseGlow: 0.35, houseLight: 1,
  // блум
  bloom: true, bloomStrength: 0.85, bloomRadius: 0.55, bloomThreshold: 0.82,
  // фокус
  dofMode: 'bokeh', dofAperture: 6, dofMaxBlur: 9, focusOffset: 0, tiltBand: 0.12, tiltNear: 0.5,
  // кольори
  colorPreset: 'soft', exposure: 1.15, contrast: 0.96, saturation: 0.92, temperature: 0.03, tint: 0.04,
  vignette: 0.28, grain: 0.015, lift: '#5a4b80', liftK: 0.5, chroma: 0.0006, eyeColor: '#7fe6f0',
  skyColor: '#3d3b66', grassColor: '#8cc79a', roadColor: '#d2b08a',
  // камера
  camDist: 620, camHeight: 300, camLook: 320, camFov: 44, camLag: 2.5,
  // дорога
  curveWorld: 0.35, fogFar: 4200,
  // темрява й привиди
  darkness: 0.7, darkRadius: 650, fogEyes: 1,
  // скіни
  bikeSkin: 'tangerine', riderSkin: 'skaterMaleA',
  // звук і керування (гравець)
  volMaster: 0.8, volMusic: 0.6, volSfx: 0.8,
  joySens: 1, joyDead: 0.15, keySens: 1,
  showFps: false,
  lang: 'en',
};

export const QUALITY = {
  low: { shading: 'simple', shadows: 'off', resScale: 0.7, aa: false, bloom: true, bloomStrength: 0.7, dofMode: 'tilt' },
  medium: { shading: 'toon', shadows: 'medium', resScale: 0.85, aa: false, bloom: true, dofMode: 'tilt' },
  high: { shading: 'plastic', shadows: 'medium', resScale: 1, aa: true, bloom: true, dofMode: 'bokeh' },
  ultra: { shading: 'plastic', shadows: 'high', resScale: 1, aa: true, bloom: true, dofMode: 'bokeh' },
};

export const COLOR_PRESETS = {
  soft: { exposure: 1.15, contrast: 0.96, saturation: 0.92, temperature: 0.03, tint: 0.04, vignette: 0.28, lift: '#5a4b80', liftK: 0.5, grain: 0.015, chroma: 0.0006, skyColor: '#3d3b66', grassColor: '#8cc79a', roadColor: '#d2b08a' },
  pastel: { exposure: 1.3, contrast: 0.9, saturation: 0.85, temperature: 0.08, tint: 0.1, vignette: 0.2, lift: '#7a6aa0', liftK: 0.55, grain: 0.0, chroma: 0.0, skyColor: '#5a5288', grassColor: '#a6d6b0', roadColor: '#e2c49e' },
  dusk: { exposure: 1.2, contrast: 1.08, saturation: 1.15, temperature: -0.1, tint: 0.08, vignette: 0.5, lift: '#2a1850', liftK: 0.45, grain: 0.03 },
  toybox: { exposure: 1.25, contrast: 1.02, saturation: 1.35, temperature: 0.05, tint: 0.0, vignette: 0.3, lift: '#3a2a60', liftK: 0.35, grain: 0.0 },
  moonlight: { exposure: 1.0, contrast: 1.15, saturation: 0.85, temperature: -0.45, tint: -0.05, vignette: 0.55, lift: '#10204a', liftK: 0.5, grain: 0.03 },
  halloween: { exposure: 1.1, contrast: 1.18, saturation: 1.3, temperature: 0.3, tint: 0.2, vignette: 0.6, lift: '#3a1040', liftK: 0.5, grain: 0.04 },
  noir: { exposure: 1.05, contrast: 1.3, saturation: 0.0, temperature: 0, tint: 0, vignette: 0.65, lift: '#000000', liftK: 0, grain: 0.07 },
};

const opt = (v, label) => ({ v, label });
export const SCHEMA = [
  { tab: 'Шейдери', items: [
    { key: 'preset', label: 'Якість', type: 'select', options: [opt('low', 'Низька'), opt('medium', 'Середня'), opt('high', 'Висока'), opt('ultra', 'Ультра')] },
    { key: 'shading', label: 'Матеріали', type: 'select', options: [opt('plastic', 'Пластик (PBR + лак)'), opt('toon', 'Мультяшні (toon)'), opt('simple', 'Прості (швидко)')] },
    { key: 'shadows', label: 'Тіні', type: 'select', options: [opt('off', 'Вимк.'), opt('medium', 'Місяць'), opt('high', 'Місяць + ліхтар')] },
    { key: 'resScale', label: 'Роздільність', type: 'range', min: 0.5, max: 1, step: 0.05 },
    { key: 'aa', label: 'Згладжування (SMAA)', type: 'check' },
    { key: 'lanternPower', label: 'Сила ліхтаря', type: 'range', min: 0.3, max: 2.5, step: 0.05 },
    { key: 'lightPool', label: 'Промінь фари', type: 'range', min: 0, max: 1.5, step: 0.05 },
    { key: 'ambient', label: 'Небо (сутінки)', type: 'range', min: 0.1, max: 2.5, step: 0.05 },
    { key: 'moon', label: 'Місяць', type: 'range', min: 0, max: 2.5, step: 0.05 },
    { key: 'houseGlow', label: 'Підсвітка фасадів будинків', type: 'range', min: 0, max: 1.5, step: 0.05 },
    { key: 'houseLight', label: 'Світло від будинків', type: 'range', min: 0, max: 3, step: 0.05 },
  ] },
  { tab: 'Блум', items: [
    { key: 'bloom', label: 'Блум', type: 'check' },
    { key: 'bloomStrength', label: 'Сила', type: 'range', min: 0, max: 3, step: 0.05 },
    { key: 'bloomRadius', label: 'Радіус', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'bloomThreshold', label: 'Поріг', type: 'range', min: 0, max: 1.5, step: 0.01 },
    { key: 'eyeColor', label: 'Колір очей привидів', type: 'color' },
  ] },
  { tab: 'Фокус', items: [
    { key: 'dofMode', label: 'Розмиття', type: 'select', options: [opt('off', 'Вимк.'), opt('bokeh', 'Боке (за глибиною)'), opt('tilt', 'Tilt-shift (мініатюра)')] },
    { key: 'focusOffset', label: 'Зсув фокуса', type: 'range', min: -300, max: 300, step: 5 },
    { key: 'dofAperture', label: 'Діафрагма (боке)', type: 'range', min: 0, max: 30, step: 0.5 },
    { key: 'dofMaxBlur', label: 'Макс. розмиття', type: 'range', min: 0, max: 25, step: 0.5 },
    { key: 'tiltBand', label: 'Смуга різкості (tilt)', type: 'range', min: 0, max: 0.5, step: 0.01 },
    { key: 'tiltNear', label: 'Розмиття знизу (tilt)', type: 'range', min: 0, max: 1, step: 0.05 },
  ] },
  { tab: 'Кольори', items: [
    { key: 'colorPreset', label: 'Пресет', type: 'select', options: [opt('soft', "М'які сутінки"), opt('pastel', 'Пастель'), opt('dusk', 'Пізній вечір'), opt('toybox', 'Іграшкова коробка'), opt('moonlight', 'Місячне світло'), opt('halloween', 'Гелловін'), opt('noir', 'Нуар')] },
    { key: 'skyColor', label: 'Колір неба', type: 'color' },
    { key: 'grassColor', label: 'Колір трави', type: 'color' },
    { key: 'roadColor', label: 'Колір дороги', type: 'color' },
    { key: 'darkness', label: 'Темрява навколо героя', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'darkRadius', label: 'Радіус видимості', type: 'range', min: 250, max: 2000, step: 10 },
    { key: 'fogEyes', label: 'Очі в тумані', type: 'range', min: 0, max: 3, step: 0.1 },
    { key: 'exposure', label: 'Експозиція', type: 'range', min: 0.4, max: 2.5, step: 0.01 },
    { key: 'contrast', label: 'Контраст', type: 'range', min: 0.6, max: 1.6, step: 0.01 },
    { key: 'saturation', label: 'Насиченість', type: 'range', min: 0, max: 2, step: 0.01 },
    { key: 'temperature', label: 'Температура', type: 'range', min: -1, max: 1, step: 0.01 },
    { key: 'tint', label: 'Відтінок', type: 'range', min: -1, max: 1, step: 0.01 },
    { key: 'lift', label: 'Колір тіней', type: 'color' },
    { key: 'liftK', label: 'Сила кольору тіней', type: 'range', min: 0, max: 1.5, step: 0.01 },
    { key: 'vignette', label: 'Віньєтка', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'grain', label: 'Зерно', type: 'range', min: 0, max: 0.15, step: 0.005 },
    { key: 'chroma', label: 'Хроматична аберація', type: 'range', min: 0, max: 0.006, step: 0.0002 },
  ] },
  { tab: 'Камера', items: [
    { key: 'camDist', label: 'Відстань позаду', type: 'range', min: 250, max: 1400, step: 10 },
    { key: 'camHeight', label: 'Висота', type: 'range', min: 80, max: 900, step: 10 },
    { key: 'camLook', label: 'Дивитися вперед на', type: 'range', min: 0, max: 900, step: 10 },
    { key: 'camFov', label: 'Кут огляду (FOV)', type: 'range', min: 25, max: 80, step: 1 },
    { key: 'camLag', label: 'Швидкість повороту', type: 'range', min: 0.5, max: 8, step: 0.1 },
  ] },
  { tab: 'Дорога', items: [
    { key: 'curveWorld', label: 'Curved World', type: 'range', min: 0, max: 1.5, step: 0.01 },
    { key: 'fogFar', label: 'Дальність туману', type: 'range', min: 1500, max: 8000, step: 100 },
  ] },
  { tab: 'Скіни', items: [
    { key: 'bikeSkin', label: 'Велосипед', type: 'swatches', options: BIKE_SKINS.map(s => ({ v: s.id, label: s.name, colors: [s.frame, s.tire, s.seat] })) },
    { key: 'riderSkin', label: 'Вершник', type: 'select', options: HERO_SKINS.map(h => opt(h.id, h.name)) },
  ] },
];

// Налаштування для гравця (label — ключі перекладу з src/i18n.js; raw — назви мов без перекладу)
export const USER_SCHEMA = [
  { tab: 'tab.gfx', items: [
    { key: 'lang', label: 'set.lang', type: 'select', raw: true, options: LANGS },
    { key: 'preset', label: 'set.preset', type: 'select', options: [opt('low', 'opt.low'), opt('medium', 'opt.medium'), opt('high', 'opt.high'), opt('ultra', 'opt.ultra')] },
    { key: 'resScale', label: 'set.resScale', type: 'range', min: 0.5, max: 1, step: 0.05, pct: true },
    { key: 'shadows', label: 'set.shadows', type: 'select', options: [opt('off', 'opt.off'), opt('medium', 'opt.shNormal'), opt('high', 'opt.shDetailed')] },
    { key: 'aa', label: 'set.aa', type: 'check' },
    { key: 'bloom', label: 'set.bloom', type: 'check' },
    { key: 'dofMode', label: 'set.dof', type: 'select', options: [opt('off', 'opt.off'), opt('bokeh', 'opt.bokeh'), opt('tilt', 'opt.tilt')] },
    { key: 'showFps', label: 'set.fps', type: 'check' },
  ] },
  { tab: 'tab.sound', items: [
    { key: 'volMaster', label: 'set.volMaster', type: 'range', min: 0, max: 1, step: 0.05, pct: true },
    { key: 'volMusic', label: 'set.volMusic', type: 'range', min: 0, max: 1, step: 0.05, pct: true },
    { key: 'volSfx', label: 'set.volSfx', type: 'range', min: 0, max: 1, step: 0.05, pct: true },
  ] },
  { tab: 'tab.controls', items: [
    { key: 'joySens', label: 'set.joySens', type: 'range', min: 0.5, max: 2, step: 0.05, pct: true },
    { key: 'joyDead', label: 'set.joyDead', type: 'range', min: 0, max: 0.4, step: 0.01, pct: true },
    { key: 'keySens', label: 'set.keySens', type: 'range', min: 0.1, max: 1, step: 0.05, pct: true },
  ] },
  { tab: 'Credits', credits: true, items: [] }, // англійською в усіх мовах: t() повертає ключ як є
];
const USER_KEYS = USER_SCHEMA.flatMap(s => s.items.map(i => i.key)).filter(k => k !== 'lang');

// lr.gfx зберігає лише те, що відрізняється від DEFAULTS: нова версія пресета DEFAULT_PRESET доходить до всіх,
// хто цей ключ не змінював. До ver 4 зберігалося все підряд — графіку з таких сейвів скидаємо на пресет.
export function loadSettings() {
  let s = { ...DEFAULTS }, saved = {};
  try { saved = JSON.parse(localStorage.getItem('lr.gfx') || '{}') || {}; } catch { }
  if ((saved.ver || 1) < 4) for (const k of GFX_KEYS) delete saved[k];
  Object.assign(s, saved, { ver: DEFAULTS.ver });
  return s;
}
export function saveSettings(s) {
  const out = { ver: DEFAULTS.ver };
  for (const k of Object.keys(s)) if (s[k] !== DEFAULTS[k]) out[k] = s[k];
  try { localStorage.setItem('lr.gfx', JSON.stringify(out)); } catch { }
}

// Пресети графіки: усе, крім скінів, мови, звуку й керування. Живуть у src/presets.js (файл проєкту):
// dev-сервер переписує його при кожному збереженні/видаленні; той самий пресет з тією ж назвою перезаписується.
const PKEY = 'lr.presets';
const KEEP = ['bikeSkin', 'riderSkin', 'ver', 'lang', 'volMaster', 'volMusic', 'volSfx', 'joySens', 'joyDead', 'keySens', 'showFps'];
const GFX_KEYS = Object.keys(DEFAULTS).filter(k => !KEEP.includes(k));
// графіка за замовчуванням = пресет DEFAULT_PRESET (зайві/старі ключі, як-от cel-shading, ігноруються)
if (PRESETS[DEFAULT_PRESET]) for (const k of GFX_KEYS) if (k in PRESETS[DEFAULT_PRESET]) DEFAULTS[k] = PRESETS[DEFAULT_PRESET][k];
const presets = JSON.parse(JSON.stringify(PRESETS));
export function loadPresets() { return JSON.parse(JSON.stringify(presets)); }
function savePresets(p) {
  for (const k of Object.keys(presets)) delete presets[k];
  Object.assign(presets, p);
  if (BUILD) return Promise.resolve(false);
  return fetch('/api/presets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(presets) })
    .then(r => { if (!r.ok) throw new Error(r.status); return true; })
    .catch(e => { console.warn('пресети не записано у файл (запущено не через node server.js?)', e); return false; });
}
// старі пресети з localStorage браузера (до файлу) один раз переносимо у файл; файл має пріоритет
if (!BUILD) {
  try {
    const old = JSON.parse(localStorage.getItem(PKEY) || '{}');
    const add = Object.keys(old).filter(n => !(n in presets));
    if (add.length) { const p = loadPresets(); for (const n of add) p[n] = old[n]; savePresets(p).then(ok => { if (ok) localStorage.removeItem(PKEY); }); }
    else if (Object.keys(old).length) localStorage.removeItem(PKEY);
  } catch { }
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class SettingsPanel {
  // opts.dev — дозволити перемикання на панель розробника
  constructor(root, settings, onChange, opts = {}) {
    this.root = root; this.s = settings; this.onChange = onChange;
    this.tab = 0; this.allowDev = !!opts.dev; this.dev = false;
    this.render();
  }
  set(key, v) {
    this.s[key] = v;
    if (key === 'preset') Object.assign(this.s, QUALITY[v]);
    if (key === 'colorPreset') Object.assign(this.s, COLOR_PRESETS[v]);
    saveSettings(this.s);
    this.onChange(this.s, key);
    if (key === 'preset' || key === 'colorPreset') this.render();
  }
  render() {
    const r = this.root;
    r.innerHTML = '';
    const head = document.createElement('div'); head.className = 'gfx-head';
    const schema = this.dev ? SCHEMA : USER_SCHEMA;
    const L = (s) => (this.dev ? s : t(s)); // панель розробника — лише українською
    if (this.tab >= schema.length) this.tab = 0;
    head.innerHTML = '<b>' + (this.dev ? 'Розробник' : t('set.title')) + '</b><span class="hint">' + (this.dev ? 'Tab — закрити' : t('set.closeHint')) + '</span>';
    if (this.allowDev) {
      const dv = document.createElement('button'); dv.className = 'gfx-x'; dv.textContent = this.dev ? '👤' : '🛠';
      dv.title = this.dev ? 'Налаштування гравця' : 'Панель розробника';
      dv.onclick = () => { this.dev = !this.dev; this.tab = 0; this.render(); };
      head.appendChild(dv);
    }
    const close = document.createElement('button'); close.className = 'gfx-x'; close.textContent = '✕';
    close.onclick = () => this.onClose && this.onClose();
    head.appendChild(close);
    r.appendChild(head);
    const tabs = document.createElement('div'); tabs.className = 'gfx-tabs';
    schema.forEach((sec, i) => {
      const b = document.createElement('button'); b.textContent = L(sec.tab); if (i === this.tab) b.className = 'on';
      b.onclick = () => { this.tab = i; this.render(); };
      tabs.appendChild(b);
    });
    r.appendChild(tabs);
    const body = document.createElement('div'); body.className = 'gfx-body';
    if (schema[this.tab].credits) {
      const c = document.createElement('div'); c.className = 'credits'; c.textContent = CREDITS;
      body.appendChild(c);
    }
    for (const it of schema[this.tab].items) {
      const row = document.createElement('label'); row.className = 'gfx-row';
      const name = document.createElement('span'); name.textContent = L(it.label); row.appendChild(name);
      const val = this.s[it.key];
      let ctl;
      if (it.type === 'select') {
        ctl = document.createElement('select');
        for (const o of it.options) { const op = document.createElement('option'); op.value = o.v; op.textContent = it.raw ? o.label : L(o.label); if (o.v === val) op.selected = true; ctl.appendChild(op); }
        ctl.onchange = () => this.set(it.key, ctl.value);
      } else if (it.type === 'check') {
        ctl = document.createElement('input'); ctl.type = 'checkbox'; ctl.checked = !!val;
        ctl.onchange = () => this.set(it.key, ctl.checked);
      } else if (it.type === 'color') {
        ctl = document.createElement('input'); ctl.type = 'color'; ctl.value = val;
        ctl.oninput = () => this.set(it.key, ctl.value);
      } else if (it.type === 'range') {
        ctl = document.createElement('div'); ctl.className = 'gfx-range';
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = it.min; inp.max = it.max; inp.step = it.step; inp.value = val;
        const out = document.createElement('output');
        const fmt = () => { const v = +inp.value; out.textContent = it.pct ? Math.round(v * 100) + '%' : v.toFixed(it.step < 0.01 ? 4 : 2).replace(/\.?0+$/, '') || '0'; };
        fmt();
        inp.oninput = () => { fmt(); this.set(it.key, +inp.value); };
        ctl.append(inp, out);
      } else if (it.type === 'swatches') {
        ctl = document.createElement('div'); ctl.className = 'gfx-swatches';
        for (const o of it.options) {
          const b = document.createElement('button'); b.type = 'button'; b.title = o.label;
          b.className = 'sw' + (o.v === val ? ' on' : '');
          b.innerHTML = `<i style="background:linear-gradient(135deg, ${hex(o.colors[0])} 0 50%, ${hex(o.colors[1])} 50% 80%, ${hex(o.colors[2])} 80%)"></i><small>${o.label}</small>`;
          b.onclick = (e) => { e.preventDefault(); this.set(it.key, o.v); this.render(); };
          ctl.appendChild(b);
        }
        row.classList.add('wide');
      }
      row.appendChild(ctl);
      body.appendChild(row);
    }
    r.appendChild(body);
    const foot = document.createElement('div'); foot.className = 'gfx-foot';
    if (!this.dev) {
      const reset = document.createElement('button'); reset.textContent = t('set.reset');
      reset.onclick = () => {
        for (const k of [...USER_KEYS, ...GFX_KEYS]) this.s[k] = DEFAULTS[k];
        saveSettings(this.s); this.onChange(this.s, '*'); this.render();
      };
      foot.appendChild(reset);
      r.appendChild(foot);
      return;
    }
    const presets = loadPresets();
    const names = Object.keys(presets);
    const prow = document.createElement('div'); prow.className = 'gfx-presets';
    if (this.naming) {
      const inp = document.createElement('input'); inp.placeholder = 'Назва пресета'; inp.maxLength = 24;
      inp.value = this.naming === true ? '' : this.naming;
      const ok = document.createElement('button'); ok.textContent = 'Зберегти'; ok.className = 'primary';
      const cancel = document.createElement('button'); cancel.textContent = '✕';
      const commit = () => {
        const n = inp.value.trim();
        if (!n) { inp.focus(); return; }
        const p = loadPresets(); p[n] = {}; for (const k of GFX_KEYS) p[n][k] = this.s[k];
        savePresets(p); this.current = n; this.naming = false; this.render();
      };
      ok.onclick = commit; cancel.onclick = () => { this.naming = false; this.render(); };
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') { this.naming = false; this.render(); } };
      prow.append(inp, ok, cancel);
      setTimeout(() => inp.focus(), 0);
    } else {
      const sel = document.createElement('select');
      const o0 = document.createElement('option'); o0.value = ''; o0.textContent = names.length ? 'Мої пресети…' : 'Збережених пресетів нема'; sel.appendChild(o0);
      for (const n of names) { const o = document.createElement('option'); o.value = n; o.textContent = n; if (n === this.current) o.selected = true; sel.appendChild(o); }
      sel.disabled = !names.length;
      sel.onchange = () => {
        const p = loadPresets()[sel.value];
        if (!p) return;
        Object.assign(this.s, p); this.current = sel.value;
        saveSettings(this.s); this.onChange(this.s, '*'); this.render();
      };
      const del = document.createElement('button'); del.textContent = '🗑'; del.title = 'Видалити вибраний пресет';
      del.disabled = !this.current || !presets[this.current];
      del.onclick = () => { const p = loadPresets(); delete p[this.current]; savePresets(p); this.current = null; this.render(); };
      prow.append(sel, del);
    }
    foot.appendChild(prow);
    const brow = document.createElement('div'); brow.className = 'row';
    const save = document.createElement('button'); save.textContent = '💾 Зберегти пресет'; save.className = 'primary';
    save.onclick = () => { this.naming = this.current || true; this.render(); };
    const reset = document.createElement('button'); reset.textContent = 'Скинути все';
    reset.onclick = () => { for (const k of GFX_KEYS) this.s[k] = DEFAULTS[k]; this.current = null; saveSettings(this.s); this.onChange(this.s, '*'); this.render(); };
    brow.append(save, reset);
    foot.appendChild(brow);
    r.appendChild(foot);
  }
}
