// §12 Звук: ефекти — синтез WebAudio, музика — mp3-трек. Гучність: загальна, музика, ефекти.
const PLAYLIST = ['halloween-music', 'haunted-halloween', 'halloween-background'].map(n => 'public/assets/music/' + n + '.mp3');

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.8 };
    this.duck = 1;
    try { this.muted = localStorage.getItem('lr.muted') === '1'; } catch { }
  }
  unlock() {
    if (this.hidden) return;
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); if (this.track && this.track.paused) this.track.play().catch(() => { }); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
    this.applyVolume();
    this.startMusic();
  }
  // гучність з налаштувань: master / music / sfx у [0, 1]
  setVolume(v) { Object.assign(this.vol, v); this.applyVolume(); }
  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.silent ? 0 : this.vol.master * 0.75, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
    this.musicGain.gain.setTargetAtTime(this.vol.music * 0.55 * this.duck, t, 0.15);
  }
  // приглушити музику (пауза, меню налаштувань)
  setDuck(on) { const d = on ? 0.35 : 1; if (d !== this.duck) { this.duck = d; this.applyVolume(); } }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('lr.muted', m ? '1' : '0'); } catch { }
    this.applyVolume();
  }
  // Один mute, три причини: muted — вибір гравця (lr.muted), adMute — реклама порталу, hidden — вкладка у фоні.
  get silent() { return this.muted || this.adMute || this.hidden; }
  setAdMute(m) { this.adMute = m; this.applyVolume(); }
  // вкладка у фоні: не лише gain 0 (його застосовує наступний кадр, а rAF у фоні стоїть), а зупинка контексту й треку
  setHidden(h) {
    this.hidden = h;
    this.applyVolume();
    if (!this.ctx) return;
    if (h) { this.ctx.suspend().catch(() => { }); if (this.track) this.track.pause(); }
    else { this.ctx.resume().catch(() => { }); if (this.track && this.track.paused) this.track.play().catch(() => { }); }
  }
  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { vol = 0.3, freq = 1200, q = 1, delay = 0, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t);
  }
  play(name) {
    switch (name) {
      case 'poof': this.noise(0.18, { freq: 900, vol: 0.35 }); this.tone(880, 0.12, { vol: 0.12, delay: 0.05 }); this.tone(1320, 0.15, { vol: 0.1, delay: 0.1 }); break;
      case 'coin': this.tone(1500, 0.08, { type: 'square', vol: 0.05 }); this.tone(2000, 0.1, { type: 'square', vol: 0.04, delay: 0.05 }); break;
      case 'hiss': this.noise(0.4, { freq: 4000, q: 0.5, vol: 0.3, type: 'highpass' }); this.tone(300, 0.4, { slide: -200, vol: 0.12 }); break;
      case 'crash': this.noise(0.3, { freq: 200, vol: 0.6, type: 'lowpass' }); this.tone(1800, 0.5, { type: 'triangle', vol: 0.12, delay: 0.1 }); this.tone(1800, 0.5, { type: 'triangle', vol: 0.1, delay: 0.25 }); break;
      case 'glug': for (let i = 0; i < 3; i++) this.tone(260 + i * 60, 0.09, { slide: 200, vol: 0.18, delay: i * 0.07 }); break;
      case 'crackle': this.noise(0.05, { freq: 3000, vol: 0.12 }); break;
      case 'flare': this.tone(600, 0.6, { slide: 1600, type: 'sawtooth', vol: 0.08 }); this.noise(0.8, { freq: 1500, vol: 0.4, delay: 0.5 }); break;
      case 'house': this.noise(0.03, { freq: 2500, vol: 0.4 }); [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.2, { type: 'triangle', vol: 0.09, delay: 0.05 + i * 0.03, attack: 0.03 })); break;
      case 'shade': this.tone(55, 1.6, { type: 'sawtooth', vol: 0.18, slide: 30, attack: 1.2 }); this.tone(58, 1.6, { type: 'sine', vol: 0.25, attack: 1.2 }); break;
      case 'escape': this.tone(660, 0.15, { vol: 0.12 }); this.tone(990, 0.2, { vol: 0.12, delay: 0.1 }); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.12, delay: i * 0.12 })); break;
      case 'lose': [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.12, delay: i * 0.15 })); break;
      case 'click': this.tone(900, 0.04, { vol: 0.08 }); break;
    }
  }
  // Саундтрек: три треки з ref/ по черзі, по колу (починаємо з випадкового)
  startMusic() {
    const el = new window.Audio();
    el.preload = 'auto';
    this.track = el;
    let i = Math.floor(Math.random() * PLAYLIST.length);
    const next = () => { el.src = PLAYLIST[i++ % PLAYLIST.length]; el.play().catch(() => { }); };
    el.addEventListener('ended', next);
    try { this.ctx.createMediaElementSource(el).connect(this.musicGain); } catch { el.volume = this.vol.music; }
    next();
  }
}
