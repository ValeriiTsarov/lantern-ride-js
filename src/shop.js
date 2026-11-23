// §13 Магазин скінів: монети з гаманця → велосипеди й герої. Клік на картку — приміряти на вітрині меню,
// кнопка — купити або обрати. Закрили, не обравши, — вітрина повертається до вибраного скіна.
import { C } from './config.js';
import { BIKE_SKINS } from './render/bike.js';
import { HERO_SKINS } from './render/assets.js';
import { t } from './i18n.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Shop {
  // ctx: { progress, settings, view, audio, save(), onChange() }
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.tab = 'bikes';
    this.sel = null;
    this.thumbs = {};
  }

  open() { this.sel = null; this.render(); }
  close() { const { view, settings } = this.ctx; if (view) view.setSkins(settings); }

  items() {
    const { progress, settings } = this.ctx;
    if (this.tab === 'bikes') return BIKE_SKINS.map(s => ({
      id: s.id, name: t('bike.' + s.id), price: C.BIKE_PRICES[s.id] ?? 0, own: progress.bikes.includes(s.id), on: settings.bikeSkin === s.id,
      thumb: `<i style="background:linear-gradient(135deg, ${hex(s.frame)} 0 50%, ${hex(s.tire)} 50% 80%, ${hex(s.seat)} 80%)"></i>`,
    }));
    return HERO_SKINS.map(h => ({
      id: h.id, name: t('hero.' + h.id), price: C.HERO_PRICES[h.id] ?? 0, own: progress.heroes.includes(h.id), on: settings.riderSkin === h.id,
      thumb: `<i style="background:url(${this.heroThumb(h.id)}) center/cover"></i>`,
    }));
  }

  // мініатюра героя — сама текстура-палітра скіна
  heroThumb(id) {
    if (this.thumbs[id]) return this.thumbs[id];
    const t = this.ctx.view.assets.skins[id];
    const img = t && t.image;
    if (!img) return '';
    const c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d').drawImage(img, 0, 0, 64, 64);
    return (this.thumbs[id] = c.toDataURL());
  }

  preview(it) {
    const { view, settings } = this.ctx;
    this.sel = it.id;
    view.setSkins({ ...settings, [this.tab === 'bikes' ? 'bikeSkin' : 'riderSkin']: it.id });
    this.render();
  }

  act(it) {
    const { progress, settings, audio } = this.ctx;
    const list = this.tab === 'bikes' ? progress.bikes : progress.heroes;
    if (!it.own) {
      if (progress.wallet < it.price) { audio.play('hiss'); this.flash = it.id; this.render(); return; }
      progress.wallet -= it.price;
      list.push(it.id);
      audio.play('house');
    } else audio.play('click');
    settings[this.tab === 'bikes' ? 'bikeSkin' : 'riderSkin'] = it.id;
    this.ctx.save();
    this.ctx.view.setSkins(settings);
    this.sel = it.id;
    this.ctx.onChange();
    this.render();
  }

  render() {
    const r = this.root, { progress } = this.ctx;
    r.innerHTML = '';
    const head = document.createElement('div'); head.className = 'gfx-head';
    head.innerHTML = `<b>${t('shop.title')}</b><span class="hint"></span><span class="wallet">🪙 ${progress.wallet}</span>`;
    const x = document.createElement('button'); x.className = 'gfx-x'; x.textContent = '✕';
    x.onclick = () => this.onClose && this.onClose();
    head.appendChild(x);
    const tabs = document.createElement('div'); tabs.className = 'gfx-tabs';
    for (const [id, label] of [['bikes', t('shop.bikes')], ['heroes', t('shop.heroes')]]) {
      const b = document.createElement('button'); b.textContent = label; if (id === this.tab) b.className = 'on';
      b.onclick = () => { this.tab = id; this.sel = null; this.close(); this.render(); };
      tabs.appendChild(b);
    }
    const body = document.createElement('div'); body.className = 'gfx-body shop-grid';
    for (const it of this.items()) {
      const card = document.createElement('div');
      card.className = 'shop-card' + (it.on ? ' on' : '') + (it.id === this.sel ? ' sel' : '') + (it.own ? '' : ' locked');
      card.innerHTML = `${it.thumb}<b>${it.name}</b>`;
      card.onclick = () => this.preview(it);
      const btn = document.createElement('button');
      const poor = !it.own && progress.wallet < it.price;
      btn.className = 'shop-btn' + (it.on ? ' on' : poor ? ' poor' : it.own ? '' : ' buy') + (this.flash === it.id ? ' shake' : '');
      btn.textContent = it.on ? t('shop.selected') : it.own ? t('shop.choose') : `🪙 ${it.price}`;
      btn.disabled = it.on;
      btn.onclick = (e) => { e.stopPropagation(); this.act(it); };
      card.appendChild(btn);
      body.appendChild(card);
    }
    this.flash = null;
    const foot = document.createElement('div'); foot.className = 'gfx-foot shop-foot';
    foot.textContent = t('shop.foot');
    r.append(head, tabs, body, foot);
  }
}
