// Милий привид: тіло-«простирадло» з хвилястим подолом, очі світяться в темряві (блум).
import * as THREE from 'three';
import { curvePatch } from './materials.js';

let bodyGeo = null;
function ghostGeometry() {
  if (bodyGeo) return bodyGeo;
  const pts = [];
  // поділ → боки → купол (радіус 1 на подолі)
  const side = [[1.0, 0.0], [0.97, 0.12], [0.9, 0.35], [0.86, 0.6], [0.84, 0.9], [0.83, 1.15]];
  for (const [r, y] of side) pts.push(new THREE.Vector2(r, y));
  for (let i = 1; i <= 14; i++) {
    const a = (i / 14) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.max(0.001, 0.83 * Math.cos(a)), 1.15 + 0.9 * Math.sin(a)));
  }
  bodyGeo = new THREE.LatheGeometry(pts, 48);
  bodyGeo.computeVertexNormals();
  return bodyGeo;
}

export function makeGhostBodyMaterial(opts = {}) {
  const uniforms = { uTime: { value: 0 }, uRim: { value: new THREE.Color(opts.rim ?? 0xffd8f0) }, uRimK: { value: 0.45 }, uInner: { value: new THREE.Color(opts.inner ?? 0xffa3c0) } };
  const m = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0xffffff, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35,
    sheen: 1, sheenColor: new THREE.Color(0xffd0e0), sheenRoughness: 0.4,
    emissive: opts.emissive ?? 0x4a4058, transparent: true, side: THREE.DoubleSide, depthWrite: true,
  });
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    curvePatch(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float ang = atan(position.z, position.x);
      float hem = 1.0 - smoothstep(0.0, 0.45, position.y);
      float wave = sin(ang * 6.0 + uTime * 4.0);
      transformed.y += wave * 0.09 * hem;
      transformed.xz *= 1.0 + (0.05 * wave + 0.06) * hem;
      transformed.xz *= 1.0 + 0.025 * sin(uTime * 2.3 + position.y * 2.0);
    `);
    sh.fragmentShader = 'uniform vec3 uRim; uniform float uRimK; uniform vec3 uInner;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n if(!gl_FrontFacing) diffuseColor.rgb *= uInner;')
      .replace('#include <opaque_fragment>', `
        float fr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
        outgoingLight += uRim * fr * uRimK;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ghostBody';
  return m;
}

const eyeGeo = new THREE.SphereGeometry(1, 20, 14);

export class Ghost {
  constructor({ scale = 17, eyeColor = 0x9ff3ff, body = {}, eyeScale = 1 } = {}) {
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.bodyMat = makeGhostBodyMaterial(body);
    this.body = new THREE.Mesh(ghostGeometry(), this.bodyMat);
    this.body.castShadow = true;
    this.inner.add(this.body);
    this.eyeColor = new THREE.Color(eyeColor);
    this.eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x140a16, roughness: 0.12, clearcoat: 1, emissive: this.eyeColor, emissiveIntensity: 4, transparent: true, fog: false });
    this.eyeMat.defines = { NO_DARK: '' }; // очі світять крізь туман і темряву
    this.shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const es = eyeScale;
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, this.eyeMat);
      e.scale.set(0.16 * es, 0.23 * es, 0.09);
      e.position.set(0.31 * s, 1.5, 0.74);
      e.rotation.y = s * 0.38;
      e.rotation.x = -0.15;
      this.inner.add(e);
      const sh = new THREE.Mesh(eyeGeo, this.shineMat);
      sh.scale.set(0.045 * es, 0.055 * es, 0.03);
      sh.position.set(0.31 * s + 0.05 * es, 1.58, 0.82);
      this.inner.add(sh);
    }
    const nose = new THREE.Mesh(eyeGeo, this.eyeMat);
    nose.scale.set(0.075, 0.075, 0.05);
    nose.position.set(0, 1.27, 0.81);
    this.inner.add(nose);
    this.inner.scale.setScalar(scale);
    this.baseScale = scale;
    this.phase = Math.random() * 10;
    this.light = 1;
    this.alpha = 1;
  }

  setEyeColor(c) { this.eyeColor.set(c); this.eyeMat.emissive.copy(this.eyeColor); }

  // light: 0 — у темряві (видно лише очі), 1 — у світлі
  update(t, light, alpha = 1) {
    this.light = light;
    const ph = t + this.phase;
    this.bodyMat.userData.uniforms.uTime.value = ph;
    this.bodyMat.opacity = Math.min(1, light * 1.15) * alpha;
    this.bodyMat.visible = this.bodyMat.opacity > 0.01;
    this.eyeMat.emissiveIntensity = Math.pow(1 - light, 1.5) * 5 * alpha;
    this.eyeMat.opacity = alpha;
    this.shineMat.opacity = light * 0.95 * alpha;
    this.inner.position.y = Math.sin(ph * 2.6) * 0.18 * this.baseScale;
    this.inner.rotation.z = Math.sin(ph * 1.7) * 0.08;
  }

  dispose() { this.bodyMat.dispose(); this.eyeMat.dispose(); this.shineMat.dispose(); }
}
