// Бібліотека матеріалів зі «шейдерними» режимами: plastic / toon / simple. Cel-shading прибрано назавжди (2026-11-21).
import * as THREE from 'three';

// Curved World: усе, що далі від камери, опускається донизу (y -= k·d²). Патч для всіх вбудованих
// матеріалів одразу (і тіней), тож геометрія й тіні згинаються однаково. Центр згину — головна камера.
export const CURVE = { k: { value: 0 }, o: { value: new THREE.Vector3() } };
// Темрява навколо героя: далі за радіус r усе темнішає на amount. Матеріал з define NO_DARK (очі привидів) — не темніє.
// emis — частка власного світіння (вікна), що світить крізь темряву (головне меню)
export const DARK = { amount: { value: 0 }, r: { value: 700 }, o: { value: new THREE.Vector3() }, emis: { value: 0 } };
// Підсвітка фасадів засвічених будинків (матеріали з define SELF_LIT)
export const HOUSE_GLOW = { value: 0.35 };
function houseGlowPatch(sh) {
  sh.fragmentShader = 'uniform float uHouseGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    #ifdef SELF_LIT
      totalEmissiveRadiance += diffuseColor.rgb * uHouseGlow * vec3( 1.0, 0.72, 0.45 );
    #endif`);
  sh.uniforms.uHouseGlow = HOUSE_GLOW;
}
export function curvePatch(sh) {
  if (!sh.vertexShader.includes('#include <project_vertex>')) return;
  houseGlowPatch(sh);
  sh.uniforms.uCurveK = CURVE.k; sh.uniforms.uCurveO = CURVE.o;
  if (sh.fragmentShader.includes('#include <fog_fragment>')) {
    sh.uniforms.uDarkK = DARK.amount; sh.uniforms.uDarkR = DARK.r; sh.uniforms.uDarkO = DARK.o; sh.uniforms.uDarkE = DARK.emis;
    const emis = sh.fragmentShader.includes('totalEmissiveRadiance') ? 'gl_FragColor.rgb += totalEmissiveRadiance * uDarkE * dkK;' : '';
    sh.fragmentShader = 'uniform float uDarkK, uDarkR, uDarkE; uniform vec3 uDarkO; varying vec3 vCwW;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
    #ifndef NO_DARK
      float dkD = length(vCwW.xz - uDarkO.xz);
      float dkK = uDarkK * smoothstep(uDarkR * 0.35, uDarkR * 1.5, dkD);
      gl_FragColor.rgb *= 1.0 - dkK;
      ${emis}
    #endif`);
  }
  sh.vertexShader = 'uniform float uCurveK; uniform vec3 uCurveO; varying vec3 vCwW;\n' + sh.vertexShader.replace('#include <project_vertex>', `
    vec4 mvPosition = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      mvPosition = batchingMatrix * mvPosition;
    #endif
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    vec4 cwPos = modelMatrix * mvPosition;
    vec2 cwD = cwPos.xz - uCurveO.xz;
    vCwW = cwPos.xyz;
    cwPos.y -= uCurveK * dot(cwD, cwD);
    mvPosition = viewMatrix * cwPos;
    gl_Position = projectionMatrix * mvPosition;`);
}
THREE.Material.prototype.onBeforeCompile = curvePatch;

export class MatLib {
  constructor() {
    this.mode = 'plastic';
    this.cache = new Map(); // spec -> {mode: material}
    this.specs = new Map(); // key -> spec
    const g = new Uint8Array([60, 140, 210, 255]);
    this.toonGrad = new THREE.DataTexture(g, 4, 1, THREE.RedFormat);
    this.toonGrad.minFilter = this.toonGrad.magFilter = THREE.NearestFilter;
    this.toonGrad.needsUpdate = true;
  }

  // spec: {color, map, rough, clear, emissive, emissiveIntensity, emissiveMap, metal, side, transparent, opacity, sheen}
  spec(key, s) {
    let sp = this.specs.get(key);
    if (!sp) { sp = { key, ...s }; this.specs.set(key, sp); }
    return sp;
  }
  plastic(color, extra = {}) {
    const c = typeof color === 'number' ? color.toString(16) : String(color);
    return this.spec('pl:' + c + ':' + JSON.stringify(extra), { color, ...extra });
  }

  build(sp, mode) {
    const common = {
      color: sp.color ?? 0xffffff, map: sp.map || null,
      emissive: sp.emissive ?? 0x000000, emissiveIntensity: sp.emissiveIntensity ?? 1, emissiveMap: sp.emissiveMap || null,
      side: sp.side ?? THREE.FrontSide, transparent: !!sp.transparent, opacity: sp.opacity ?? 1,
      vertexColors: !!sp.vertexColors,
    };
    let m;
    if (mode === 'toon') m = new THREE.MeshToonMaterial({ ...common, gradientMap: this.toonGrad });
    else if (mode === 'simple') m = new THREE.MeshLambertMaterial(common);
    else m = new THREE.MeshPhysicalMaterial({
      ...common, roughness: sp.rough ?? 0.42, metalness: sp.metal ?? 0,
      clearcoat: sp.clear ?? 0.55, clearcoatRoughness: sp.clearRough ?? 0.22,
      sheen: sp.sheen ?? 0, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5,
    });
    if (sp.depthWrite === false) m.depthWrite = false;
    if (sp.selfLit) m.defines = { SELF_LIT: '' };
    return m;
  }

  get(sp) {
    let e = this.cache.get(sp);
    if (!e) { e = {}; this.cache.set(sp, e); }
    if (!e[this.mode]) e[this.mode] = this.build(sp, this.mode);
    return e[this.mode];
  }

  apply(mesh, sp) {
    mesh.userData.mat = sp;
    mesh.material = this.get(sp);
    return mesh;
  }

  // змінити колір матеріалу в усіх режимах (кольори світу з налаштувань)
  setColor(sp, color) {
    sp.color = color;
    const e = this.cache.get(sp);
    if (e) for (const m of Object.values(e)) m.color.set(color);
  }

  setMode(mode, root) {
    this.mode = mode;
    root.traverse(o => { if (o.isMesh && o.userData.mat) o.material = this.get(o.userData.mat); });
  }
}

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

export function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, stops) {
  return canvasTex(size, size, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    if (stops) for (const [o, c] of stops) gr.addColorStop(o, c);
    else { gr.addColorStop(0, inner); gr.addColorStop(1, outer); }
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
