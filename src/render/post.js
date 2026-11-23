// Пост-обробка: глибина різкості (Bokeh за глибиною або tilt-shift), блум, кольорокорекція, AA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehShader } from 'three/addons/shaders/BokehShader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Tilt-shift зі смугою різкості навколо фокусної лінії (окремо по X та Y)
const TiltShift = {
  uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, focusY: { value: 0.35 }, band: { value: 0.18 }, amount: { value: 3 }, res: { value: new THREE.Vector2(1, 1) }, nearK: { value: 0.5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 dir; uniform float focusY, band, amount, nearK; uniform vec2 res; varying vec2 vUv;
    void main(){
      float d = vUv.y - focusY;
      float k = d > 0.0 ? smoothstep(band, band + 0.35, d) : smoothstep(band, band + 0.45, -d) * nearK;
      float r = k * amount;
      vec4 sum = vec4(0.0); float wsum = 0.0;
      for (int i = -6; i <= 6; i++) {
        float fi = float(i);
        float w = exp(-fi * fi / 18.0);
        sum += texture2D(tDiffuse, vUv + dir * fi * r / res) * w; wsum += w;
      }
      gl_FragColor = sum / wsum;
    }`,
};

const Grade = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 },
    contrast: { value: 1.08 }, saturation: { value: 1.1 }, temperature: { value: -0.1 }, tint: { value: 0.05 },
    vignette: { value: 0.45 }, grain: { value: 0.035 }, lift: { value: new THREE.Color(0x1a1238) }, liftK: { value: 0.35 },
    hurt: { value: 0 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 0.95, 0.85) }, chroma: { value: 0.0015 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, contrast, saturation, temperature, tint, vignette, grain, liftK, hurt, flash, chroma;
    uniform vec3 lift, flashColor; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*13.0) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * chroma * 4.0).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * chroma * 4.0).b;
      // баланс білого
      col *= vec3(1.0 + temperature * 0.25, 1.0 - tint * 0.15, 1.0 - temperature * 0.25);
      // підйом тіней кольором
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col += lift * liftK * (1.0 - smoothstep(0.0, 0.5, l)) * 0.5;
      col = (col - 0.5) * contrast + 0.5;
      l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      float v = smoothstep(0.85, 0.15, length(c * vec2(1.0, 1.15)));
      col *= mix(1.0, v, vignette);
      col = mix(col, vec3(0.9, 0.1, 0.25), hurt * smoothstep(0.25, 0.75, length(c)) * 0.8);
      col = mix(col, flashColor, flash);
      col += (rnd(vUv) - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

// Боке без другого рендера сцени: глибину бере з DepthTexture головного RenderPass (шейдер BokehShader з
// DEPTH_PACKING 0 читає її .x). Має стояти одразу після RenderPass — тоді readBuffer = кадр сцени.
class DepthBokehPass extends ShaderPass {
  constructor(camera) { super(BokehShader, 'tColor'); this.camera = camera; this.material.defines.DEPTH_PACKING = 0; }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    const u = this.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    u.nearClip.value = this.camera.near; u.farClip.value = this.camera.far;
    super.render(renderer, writeBuffer, readBuffer, dt, mask);
  }
}

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    // кадр сцени пишеться в один із двох буферів composer'а (вони чергуються) — глибина потрібна в обох
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height);
    this.render = new RenderPass(scene, camera);
    this.bokeh = new DepthBokehPass(camera);
    this.tsH = new ShaderPass(TiltShift);
    this.tsV = new ShaderPass(TiltShift);
    this.tsV.uniforms.dir.value.set(0, 1);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.8, 0.5, 0.82);
    this.output = new OutputPass();
    this.grade = new ShaderPass(Grade);
    this.smaa = new SMAAPass(size.x, size.y);
    for (const p of [this.render, this.bokeh, this.tsH, this.tsV, this.bloom, this.output, this.grade, this.smaa]) this.composer.addPass(p);
    this.focusDist = 800;
    this.focusScreenY = 0.35;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const W = w * pr, H = h * pr;
    this.tsH.uniforms.res.value.set(W, H);
    this.tsV.uniforms.res.value.set(W, H);
    this.bokeh.uniforms.aspect.value = w / h;
    this.pr = pr;
    this.smaa.enabled = this.aa && pr < 2; // на щільному екрані SMAA непомітний, а коштує 3 повноекранні проходи
  }

  apply(s) {
    const dof = s.dofMode;
    this.bokeh.enabled = dof === 'bokeh';
    this.tsH.enabled = this.tsV.enabled = dof === 'tilt';
    this.bloom.enabled = s.bloom;
    this.bloom.strength = s.bloomStrength;
    this.bloom.radius = s.bloomRadius;
    this.bloom.threshold = s.bloomThreshold;
    this.aa = s.aa;
    this.smaa.enabled = s.aa && (this.pr || 1) < 2;
    const bu = this.bokeh.uniforms;
    bu.aperture.value = s.dofAperture * 1e-5;
    bu.maxblur.value = s.dofMaxBlur * 0.001;
    for (const p of [this.tsH, this.tsV]) { p.uniforms.amount.value = s.dofMaxBlur * 0.55; p.uniforms.band.value = s.tiltBand; p.uniforms.nearK.value = s.tiltNear; }
    const g = this.grade.uniforms;
    g.contrast.value = s.contrast; g.saturation.value = s.saturation; g.temperature.value = s.temperature; g.tint.value = s.tint;
    g.vignette.value = s.vignette; g.grain.value = s.grain; g.lift.value.set(s.lift); g.liftK.value = s.liftK; g.chroma.value = s.chroma;
    this.renderer.toneMappingExposure = s.exposure;
    this.focusOffset = s.focusOffset;
  }

  frame(t) {
    this.grade.uniforms.time.value = t % 100;
    this.bokeh.uniforms.focus.value = this.focusDist + (this.focusOffset || 0);
    this.tsH.uniforms.focusY.value = this.tsV.uniforms.focusY.value = this.focusScreenY;
    this.composer.render();
  }
}
