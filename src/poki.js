// Poki SDK v2 (як AsteroidPlinko2D/src/poki.ts): кожен виклик захищений, поза білдом `build:poki` — no-op.
// Тег SDK вставляє лише tools/build.js --poki. З adblock init() відхиляється, і гра йде без SDK і реклами.
import { PORTAL } from './env.js';

const isPoki = PORTAL === 'poki';
let sdk = null;
const call = (f) => { try { if (sdk) return f(sdk); } catch (e) { console.warn('[poki]', e); } };

if (isPoki) {
  // QA Poki: пробіл і стрілки не скролять сторінку-хост
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault();
  });
}

/** Чекаємо перед завантаженням ассетів; ніколи не кидає. Повислий init не тримає гру довше за 5 с. */
export async function initPoki() {
  const s = window.PokiSDK;
  if (!isPoki || !s) return;
  try {
    const r = await Promise.race([s.init().then(() => 'ok'), new Promise(res => setTimeout(res, 5000, 'late'))]);
    if (r === 'ok') sdk = s;
  } catch (e) { console.warn('[poki] init (adblock?)', e); }
}

/** Перший кадр гри. Рекордер плейтестів пишемо саме з канви гри, а не з найбільшої на екрані. */
export function pokiLoaded(canvas) {
  call(s => s.gameLoadingFinished());
  call(s => s.playtestSetCanvas && s.playtestSetCanvas(canvas));
}

// gameplayStart — лише після першого вводу гравця (вимога Poki)
let touched = false, playing = false;
if (isPoki) for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { touched = true; }, { once: true, capture: true });

/** Викликається щокадру; до SDK доходять лише зміни (Poki не приймає два start чи два stop поспіль). */
export function pokiGameplay(on) {
  if (on && !touched) return;
  if (on === playing) return;
  playing = on;
  call(s => on ? s.gameplayStart() : s.gameplayStop());
}

/** Interstitial у природній паузі. Poki сам дозує показ, тож проміс може завершитись без реклами. Не кидає.
 *  onStart — пауза й mute, повертаємось після проміса. */
export function pokiBreak(onStart) {
  if (!sdk) return Promise.resolve();
  // повислий проміс не має назавжди заблокувати кнопки рівнів (adBusy у main.js); 60 с — з запасом на найдовшу рекламу
  let timer;
  const late = new Promise(res => { timer = setTimeout(() => { console.warn('[poki] commercialBreak timeout'); res(); }, 60000); });
  return Promise.race([Promise.resolve(call(s => s.commercialBreak(onStart))), late])
    .catch(e => console.warn('[poki] commercialBreak', e))
    .finally(() => clearTimeout(timer));
}
