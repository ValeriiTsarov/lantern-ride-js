// Завантаження ассетів Kenney (City Kit Suburban, Animated Characters Protagonists).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const CITY = 'public/assets/city/';
const CHAR = 'public/assets/char/';
export const BUILDINGS = 'abcdefghijklmnopqrstu'.split('').map(c => 'building-type-' + c);
const PROPS = ['tree-large', 'tree-small', 'fence-1x3', 'fence-1x4', 'fence-low', 'planter', 'driveway-long', 'path-stones-long', 'path-long'];
export const CHAR_SKINS = ['skaterMaleA', 'skaterFemaleA', 'criminalMaleA', 'cyborgFemaleA'];
// Скіни героя (магазин): текстури Kenney та їхні перефарбовані варіанти (одяг і волосся перефарбовуються, шкіра — ні)
export const HERO_SKINS = [
  { id: 'skaterMaleA', name: 'Скейтер', base: 'skaterMaleA' },
  { id: 'skaterFemaleA', name: 'Скейтерка', base: 'skaterFemaleA' },
  { id: 'criminalMaleA', name: 'Хуліган', base: 'criminalMaleA' },
  { id: 'cyborgFemaleA', name: 'Кіборгиня', base: 'cyborgFemaleA' },
  { id: 'skaterMint', name: "М'ятний скейтер", base: 'skaterMaleA', recolor: { hue: 110, sat: 1.1 } },
  { id: 'skaterViolet', name: 'Фіалкова', base: 'skaterFemaleA', recolor: { hue: 230, sat: 1.2 } },
  { id: 'criminalGold', name: 'Золотий хуліган', base: 'criminalMaleA', recolor: { set: 44, sat: 1.6, minSat: 0.6, maxL: 0.66, greys: true } },
  { id: 'cyborgNeon', name: 'Неонова', base: 'cyborgFemaleA', recolor: { hue: 150, sat: 1.5, light: 1.08 } },
];

// Перефарбування пікселів у HSL; тони шкіри (тепла помаранчева гама середньої насиченості) лишаються
function recolor(d, o) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, ch = mx - mn;
    let h = 0, s = ch === 0 ? 0 : ch / (1 - Math.abs(2 * l - 1));
    if (ch) h = mx === r ? ((g - b) / ch + 6) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
    h *= 60;
    const skin = h >= 8 && h <= 28 && s >= 0.4 && l >= 0.62 && l <= 0.86; // шкіра Kenney: 240/144/112, 240/128/96
    if (skin || (s < 0.08 && !(o.greys && l > 0.35))) continue; // шкіра й сірі/білі/чорні — без змін (greys — фарбувати й світлі сірі)
    h = o.set != null ? o.set : (h + o.hue + 360) % 360;
    s = Math.min(1, Math.max(o.minSat || 0, s * (o.sat || 1)));
    const L = Math.min(o.maxL || 1, l * (o.light || 1));
    const C2 = (1 - Math.abs(2 * L - 1)) * s, X = C2 * (1 - Math.abs((h / 60) % 2 - 1)), m = L - C2 / 2;
    const [R, G, B] = h < 60 ? [C2, X, 0] : h < 120 ? [X, C2, 0] : h < 180 ? [0, C2, X] : h < 240 ? [0, X, C2] : h < 300 ? [X, 0, C2] : [C2, 0, X];
    d[i] = (R + m) * 255; d[i + 1] = (G + m) * 255; d[i + 2] = (B + m) * 255;
  }
}

export async function loadAssets(onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, done, total) => onProgress && onProgress(done / total);
  const gltf = new GLTFLoader(manager);
  const fbx = new FBXLoader(manager);
  const tex = new THREE.TextureLoader(manager);

  const loadTex = (url) => new Promise((res, rej) => tex.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; res(t); }, undefined, rej));
  const models = {};
  const names = [...BUILDINGS, ...PROPS];
  const jobs = names.map(n => gltf.loadAsync(CITY + n + '.glb').then(g => { models[n] = g.scene; }));

  const palettes = {};
  for (const v of ['colormap', 'variation-a', 'variation-b', 'variation-c']) {
    jobs.push(loadTex(CITY + 'Textures/' + v + '.png').then(t => { t.magFilter = THREE.LinearFilter; palettes[v] = t; }));
  }
  const skins = {};
  for (const s of CHAR_SKINS) {
    jobs.push(new Promise((res, rej) => tex.load(CHAR + s + '.png', t => { t.colorSpace = THREE.SRGBColorSpace; skins[s] = t; res(); }, undefined, rej)));
  }
  let character = null;
  jobs.push(fbx.loadAsync(CHAR + 'characterMedium.fbx').then(o => { character = o; }));
  await Promise.all(jobs);
  // idle (≈600 КБ) потрібен лише вітрині меню: після решти, поза менеджером прогресу; idle — проміс кліпу (або null)
  const idle = new FBXLoader().loadAsync(CHAR + 'idle.fbx').then(o => o.animations[0] || null).catch(() => null);

  // перефарбовані скіни героя
  for (const h of HERO_SKINS) {
    if (!h.recolor) continue;
    const base = skins[h.base], src = base.image;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g2 = c.getContext('2d'); g2.drawImage(src, 0, 0);
    const im = g2.getImageData(0, 0, c.width, c.height);
    recolor(im.data, h.recolor);
    g2.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = base.flipY;
    skins[h.id] = t;
  }
  // Маска вікон: у палітрі Kenney скло — світло-блакитна клітинка (x 320–384, y 128–256 з 512).
  const mc = document.createElement('canvas');
  mc.width = mc.height = 512;
  const g = mc.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#fff'; g.fillRect(322, 130, 60, 124);
  const windowMask = new THREE.CanvasTexture(mc);
  windowMask.flipY = false;

  return { models, palettes, windowMask, skins, character, idle };
}
