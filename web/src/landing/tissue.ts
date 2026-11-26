// Materials for the landing heart. Physically based (wet gloss on the surface, velvet on cut faces),
// with the colour worked out per pixel from where the pixel is in the heart:
//
// - the infarct: the LAD's territory (the front wall and front septum, wrapping the apex), through the
//   whole wall in its middle and only the inner wall at its sides, spared near the base, with a
//   mottled border where some cells survived (as in the study's scans);
// - the stain: fresh cut muscle is a dull maroon either way; TTC turns living muscle rose-red, dead
//   muscle stays ivory, and formalin fixes and sharpens the colours;
// - the occlusion: the starved territory turns dusky and moves less;
// - trimming: parts dissolve with a glowing edge.
//
// Colours are sampled from the study's scans (data/infarct/210/210IS109mg.tif and others).

import * as THREE from 'three';

export const SHARED = {
  uTime: { value: 0 },
  uBeatV: { value: 0 },
  uBeatA: { value: 0 },
  uIsch: { value: 0 },
  uStain: { value: 0 },
  uFix: { value: 0 },
  uFrost: { value: 0 },
  uFlow: { value: 1 },
  uBlock: { value: 0 },
  /** How far the infarct has spread: 1 the full infarct, 0 a healthy heart. */
  uReach: { value: 1 },
};
export type Shared = typeof SHARED;

/** A fresh set of the story's uniforms, for a scene that isn't the landing page (Learn's heart). */
export function ownUniforms(): Shared {
  return Object.fromEntries(Object.entries(SHARED).map(([k, v]) => [k, { value: v.value }])) as Shared;
}

const c = (hex: string) => new THREE.Color(hex);

const PALETTE = {
  uSurf: c('#5a1019'),
  uSurfHi: c('#7a1d29'),
  uFat: c('#c4a05c'),
  uCutFresh: c('#64202b'),
  uEndo: c('#5a1822'),
  uLiving: c('#a8434f'),
  uLivingDeep: c('#7c2a37'),
  uLivingHi: c('#c46a72'),
  uPale: c('#e9dbb8'),
  uPaleDeep: c('#d2bc88'),
  uBlush: c('#e8b2a6'),
  uIschCol: c('#5f4c60'),
  uFrostCol: c('#d6e6f0'),
  uEdge: c('#ffe6c8'),
};

const NOISE = /* glsl */ `
float lnHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lnNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lnHash(i), lnHash(i + vec3(1,0,0)), f.x), mix(lnHash(i + vec3(0,1,0)), lnHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lnHash(i + vec3(0,0,1)), lnHash(i + vec3(1,0,1)), f.x), mix(lnHash(i + vec3(0,1,1)), lnHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float lnFbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * lnNoise(p); p = p * 2.02 + 3.1; a *= 0.5; } return s / 0.9375; }
`;

/** The heart's shape (heart3d/model.ts, lvOuter and lvInner) and the LAD territory, in GLSL. */
const HEART = /* glsl */ `
const float LN_H = 2.0;
float lnLvOuter(float t, float a) {
  float u = min(t / 0.8, 1.0);
  return 0.78 * pow(max(1.0 - (1.0 - u) * (1.0 - u), 0.0), 0.55) * (1.0 - 0.1 * smoothstep(0.8, 1.0, t)) * (1.0 + 0.04 * cos(2.0 * a));
}
float lnLvInner(float t, float a) { return max(0.0, lnLvOuter(t, a) - 0.25 - 0.04 * t); }
float lnWrap(float x) { return mod(x + 3.14159265, 6.2831853) - 3.14159265; }
/** 0 in the middle of the LAD's territory, 1 at its edge; the territory wraps the whole apex. */
float lnAcross(float t, float a, vec3 p, float rough) {
  float w = mix(3.4, 0.82, smoothstep(0.05, 0.36, t));
  return abs(lnWrap(a - 1.3)) / w + (lnFbm(p * 4.0) - 0.5) * rough;
}
/** How dead the muscle is here, 0 → 1. */
float lnDead(vec3 p) {
  float t = clamp(p.y / LN_H, 0.0, 1.0);
  float a = atan(p.z, p.x);
  float r = length(p.xz);
  float ro = lnLvOuter(t, a), ri = lnLvInner(t, a);
  if (r > ro + 0.02) return 0.0; // the right ventricle, fed by the right coronary: spared
  float d = clamp((r - ri) / max(ro - ri, 0.001), 0.0, 1.0); // 0 at the cavity, 1 at the surface
  float across = lnAcross(t, a, p, 0.4);
  float k = clamp(1.0 - across * across, 0.0, 1.0);
  float reach = (0.28 + 0.78 * pow(k, 0.55)) * (1.0 - smoothstep(0.58, 0.86, t)) * smoothstep(1.08, 0.86, across);
  reach = (reach + (lnFbm(p * 11.0 + 5.0) - 0.5) * 0.34) * uReach;
  float e = reach - d;
  float dead = smoothstep(-0.025, 0.025, e);
  // The border is mottled: islands of surviving muscle in the dead zone and pale specks beside it.
  float near = 1.0 - smoothstep(0.0, 0.2, abs(e));
  float isl = smoothstep(0.56, 0.72, lnFbm(p * 17.0 + 1.7)) * near;
  return mix(dead, 1.0 - dead, isl * 0.8) * smoothstep(0.0, 0.08, uReach);
}
/** The starved territory as seen on the surface while the artery is tied. */
float lnTerritory(vec3 p) {
  float t = clamp(p.y / LN_H, 0.0, 1.0);
  float a = atan(p.z, p.x);
  float across = lnAcross(t, a, p, 0.25);
  return smoothstep(1.0, 0.72, across) * (1.0 - smoothstep(0.74, 0.94, t)) * step(length(p.xz), lnLvOuter(t, a) + 0.035);
}
`;

const UNIFORMS_GLSL = /* glsl */ `
uniform float uTime, uBeatV, uBeatA, uIsch, uStain, uFix, uFrost, uDissolve, uPulseAmt, uReach;
uniform vec3 uPulseCentre;
`;

function shared(u: Record<string, THREE.IUniform>, extra: Record<string, THREE.IUniform>, own: Shared = SHARED) {
  Object.assign(u, own, extra);
}

/** The ventricles' muscle: every slice, and the trimmed base. */
export function tissueMaterial(dissolve: THREE.IUniform = { value: 0 }, own: Shared = SHARED) {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.38,
    sheen: 0.45,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#e9a3a3'),
    envMapIntensity: 0.45,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (shader) => {
    shared(shader.uniforms, { ...Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, { value: v }])), uDissolve: dissolve }, own);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aKind;
varying vec3 vLocal;
varying float vKind;
${UNIFORMS_GLSL}
${NOISE}
${HEART}`,
      )
      .replace(
        '#include <begin_vertex>',
        `vLocal = position;
vKind = aKind;
vec3 transformed = position;
{
  // Systole: the ventricles squeeze, shorten towards the apex and twist; starved muscle barely moves.
  float tt = clamp(position.y / LN_H, 0.0, 1.0);
  float hypo = uIsch * lnTerritory(position);
  float sq = uBeatV * (1.0 - 0.9 * hypo);
  transformed.xz *= 1.0 - 0.06 * sq * (0.55 + 0.45 * tt);
  transformed.y -= 0.07 * uBeatV * tt;
  float tw = 0.07 * uBeatV * (tt - 0.4);
  transformed.xz = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * transformed.xz;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocal;
varying float vKind;
${UNIFORMS_GLSL}
uniform vec3 uSurf, uSurfHi, uFat, uCutFresh, uEndo, uLiving, uLivingDeep, uLivingHi, uPale, uPaleDeep, uBlush, uIschCol, uFrostCol, uEdge;
${NOISE}
${HEART}`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
vec3 tEmit = vec3(0.0);
float tGloss = 1.0;
{
  vec3 p = vLocal;
  float outer = 1.0 - step(0.25, vKind);
  float cut = step(0.75, vKind);
  float t = clamp(p.y / LN_H, 0.0, 1.0);
  float a = atan(p.z, p.x);
  float r = length(p.xz);
  float n = lnFbm(p * 6.0);
  // Muscle fibres run round the wall: streaks stretched along the circumference.
  float fib = lnNoise(vec3(a * 26.0, r * 85.0, t * 10.0));

  // Fresh: glossy dark red outside (fat in the grooves), dull maroon where cut, darker inside.
  vec3 surf = mix(uSurf, uSurfHi, smoothstep(0.45, 0.85, n));
  float groove = exp(-pow(lnWrap(a - 1.047) / 0.07, 2.0)) + exp(-pow(lnWrap(a - 4.19) / 0.07, 2.0));
  float fat = smoothstep(0.92, 0.985, t) * smoothstep(0.5, 0.72, lnFbm(p * 9.0 + 2.0)) * 0.45 + groove * 0.0;
  surf = mix(surf, uFat * (0.85 + 0.3 * n), fat * outer);
  vec3 fresh = mix(mix(uEndo, uCutFresh * (0.88 + 0.24 * fib), cut), surf, outer);

  // Stained: rose-red where alive, ivory where dead, blushing at the border.
  float bloom = 0.0;
  vec3 col = fresh;
  if (uStain > 0.0) {
    float dead = lnDead(p);
    vec3 living = mix(uLivingDeep, uLiving, smoothstep(0.2, 0.75, n));
    living = mix(living, uLivingHi, smoothstep(0.62, 0.9, lnFbm(p * 14.0 + 9.0)) * 0.6);
    living *= 0.9 + 0.2 * fib * cut;
    vec3 pale = mix(uPale, uPaleDeep, smoothstep(0.35, 0.95, lnFbm(p * 5.0 + 4.0)) * 0.8);
    pale = mix(pale, uBlush, smoothstep(0.55, 0.8, lnFbm(p * 8.0 + 11.0)) * 0.45);
    pale *= 0.95 + 0.08 * fib * cut;
    vec3 stained = mix(living, pale, dead);
    // The colour blooms in blotches from the surfaces, the way TTC soaks in.
    bloom = smoothstep(n - 0.16, n + 0.05, uStain * 1.25 - 0.1);
    col = mix(fresh, stained, bloom);
  }
  // Formalin: firmer colours, a little lighter.
  col = mix(col, clamp(col * 1.06 + vec3(0.012), 0.0, 1.0), uFix);

  // Occlusion: the starved surface turns dusky.
  float isch = 0.0;
  if (uIsch > 0.0) {
    // Starved muscle: dusky, bluish and dull, mottled where the last blood pools.
    isch = uIsch * lnTerritory(p) * outer;
    vec3 dusky = uIschCol * (0.75 + 0.5 * lnFbm(p * 10.0 + 3.0));
    col = mix(col, dusky, isch);
  }
  // Chilled: a frost that catches the light.
  if (uFrost > 0.0) {
    float fr = uFrost * (0.35 + 0.65 * lnFbm(p * 22.0));
    col = mix(col, uFrostCol, fr * 0.32);
    tEmit += uFrostCol * uFrost * smoothstep(0.93, 0.98, lnNoise(p * 90.0)) * 0.12;
  }

  // Trimmed parts dissolve, with a glowing edge.
  if (uDissolve > 0.0) {
    float dn = lnFbm(p * 3.2 + 7.0) - (uDissolve * 1.15 - 0.08);
    if (dn < 0.0) discard;
    tEmit += uEdge * (1.0 - smoothstep(0.0, 0.04, dn)) * 1.4;
  }
  diffuseColor.rgb = col;
  // Cut faces are matte and velvety; the outer surface is wet.
  tGloss = mix(1.0, 0.18, cut) * mix(1.0, 0.7, bloom * uFix) * (1.0 - 0.5 * isch);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(0.82, roughnessFactor, tGloss);`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
material.clearcoat *= tGloss;
material.sheenColor *= mix(0.35, 0.8, 1.0 - tGloss);
material.specularColor *= mix(0.25, 1.0, tGloss);
material.specularColorBlended *= mix(0.25, 1.0, tGloss);
material.specularF90 *= mix(0.35, 1.0, tGloss);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += tEmit;`,
      );
  };
  m.customProgramCacheKey = () => 'cardia-tissue';
  return m;
}

/** Atria and great vessels: one colour with a little texture, an optional pulse, and dissolve. */
export function organMaterial(
  colour: string,
  dissolve: THREE.IUniform,
  { pulseCentre = new THREE.Vector3(), pulse = 0, atrial = false, gloss = 0.7 } = {},
) {
  const m = new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.4,
    clearcoat: gloss,
    clearcoatRoughness: 0.3,
    sheen: 0.4,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ffd0d0'),
    envMapIntensity: 0.6,
  });
  m.onBeforeCompile = (shader) => {
    shared(shader.uniforms, { uDissolve: dissolve, uPulseCentre: { value: pulseCentre }, uPulseAmt: { value: pulse }, uEdge: { value: PALETTE.uEdge } });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocal;
${UNIFORMS_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `vLocal = position;
vec3 transformed = position;
${atrial ? 'transformed += (position - uPulseCentre) * (-0.09 * uBeatA * uPulseAmt);' : 'transformed += normal * (0.014 * uBeatV * uPulseAmt);'}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocal;
${UNIFORMS_GLSL}
uniform vec3 uEdge;
${NOISE}`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse * (0.86 + 0.28 * lnFbm(vLocal * 7.0)), opacity );
vec3 tEmit = vec3(0.0);
if (uDissolve > 0.0) {
  float dn = lnFbm(vLocal * 3.2 + 7.0) - (uDissolve * 1.15 - 0.08);
  if (dn < 0.0) discard;
  tEmit += uEdge * (1.0 - smoothstep(0.0, 0.04, dn)) * 1.4;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += tEmit;`,
      );
  };
  m.customProgramCacheKey = () => `cardia-organ-${atrial ? 'a' : 'v'}`;
  return m;
}

/** A coronary artery: blood pulses run down it; past a tie (uBlock at uBlockU) they stop. */
export function vesselMaterial(dissolve: THREE.IUniform, { blockAt = -1, pulses = 3, speed = 0.85 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#6e1420',
    roughness: 0.35,
    clearcoat: 0.9,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.7,
  });
  m.onBeforeCompile = (shader) => {
    shared(shader.uniforms, {
      uDissolve: dissolve,
      uBlockU: { value: blockAt },
      uPulses: { value: pulses },
      uSpeed: { value: speed },
      uGlow: { value: new THREE.Color('#ff4d5e') },
      uEdge: { value: PALETTE.uEdge },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocal;
varying float vAlong;
${UNIFORMS_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `vLocal = position;
vAlong = uv.x;
vec3 transformed = position + normal * (0.006 * uBeatV);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocal;
varying float vAlong;
${UNIFORMS_GLSL}
uniform float uFlow, uBlock, uBlockU, uPulses, uSpeed;
uniform vec3 uGlow, uEdge;
${NOISE}`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
vec3 tEmit = vec3(0.0);
{
  float open = uBlockU < 0.0 ? 1.0 : 1.0 - uBlock * smoothstep(uBlockU - 0.004, uBlockU + 0.004, vAlong);
  float s = fract(vAlong * uPulses - uTime * uSpeed);
  float pulse = smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.04, 0.32, s));
  tEmit += uGlow * pulse * open * uFlow * 0.8;
  // Blood stops past the tie: the artery goes dark.
  diffuseColor.rgb *= mix(0.45, 1.0, open);
  if (uDissolve > 0.0) {
    float dn = lnFbm(vLocal * 3.2 + 7.0) - (uDissolve * 1.15 - 0.08);
    if (dn < 0.0) discard;
    tEmit += uEdge * (1.0 - smoothstep(0.0, 0.04, dn)) * 1.4;
  }
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += tEmit;`,
      );
  };
  m.customProgramCacheKey = () => 'cardia-vessel';
  return m;
}

/** The TTC bath: a clear liquid in front of the slices, with a fine meniscus. */
export function bathMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uLevel: { value: -0.1 }, uTime: SHARED.uTime, uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
varying vec2 vUv;
uniform float uLevel, uTime, uAlpha;
void main() {
  float wave = 0.006 * sin(vUv.x * 38.0 + uTime * 2.0) + 0.004 * sin(vUv.x * 71.0 - uTime * 3.1);
  float y = vUv.y - (uLevel + wave);
  float below = 1.0 - smoothstep(-0.004, 0.004, y);
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.1, vUv.y);
  float meniscus = (1.0 - smoothstep(0.0, 0.004, abs(y))) * 0.6 + (1.0 - smoothstep(0.0, 0.03, abs(y))) * 0.15;
  vec3 col = vec3(1.0, 0.97, 0.92) * 0.035 * below + vec3(1.0) * meniscus * 0.6;
  float a = (below * 0.08 + meniscus * 0.5) * edge;
  gl_FragColor = vec4(col * a * uAlpha, 1.0);
}`,
  });
}

/** Under the microscope: elongated heart muscle cells, the living ones packed with red formazan, the
 *  dead ones pale with no nucleus, along a border that follows the cells. Drawn in an eyepiece. */
export function microscopeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uTime: SHARED.uTime, uOpacity: { value: 0 }, uZoom: { value: 0 }, uAspect: { value: 1 } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
varying vec2 vUv;
uniform float uTime, uOpacity, uZoom, uAspect;
vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float vn(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = h2(i).x, b = h2(i + vec2(1, 0)).x, c = h2(i + vec2(0, 1)).x, d = h2(i + vec2(1, 1)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
// Voronoi (after Inigo Quilez): distance to the cell's edge, the cell's id, and the offset to its centre.
vec4 cells(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg, mr; float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)); vec2 o = h2(n + g); vec2 r = g + o - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)); vec2 o = h2(n + g); vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec4(md, h2(n + mg).y, mr);
}
void main() {
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
  float rad = length(uv);
  float zoom = mix(1.0, 0.7, uZoom);
  vec2 p = uv * zoom * 9.0 + vec2(0.04 * sin(uTime * 0.15), 0.03 * cos(uTime * 0.11));
  // Fibres run on a slant; cells are long and thin along them.
  float ang = -0.42; mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 fp = R * p;
  vec2 q = vec2(fp.x * 2.0, fp.y * 7.5);
  q += 0.22 * vec2(sin(q.y * 0.9), sin(q.x * 1.7));
  vec4 v = cells(q);
  float edge = v.x, id = v.y;
  // The infarct's border: dead to the left, living to the right; single cells decide.
  float line = p.x + 0.3 * sin(p.y * 1.4) + 0.12 * sin(p.y * 3.7 + 1.0);
  float deadP = smoothstep(0.5, -0.5, line);
  float dead = step(id, deadP);
  float stri = 0.5 + 0.5 * sin(fp.x * 210.0);
  float gran = smoothstep(0.55, 0.8, vn(q * 15.0 + id * 31.0));
  vec3 living = vec3(0.70, 0.17, 0.24) * (0.88 + 0.12 * stri) - gran * vec3(0.32, 0.10, 0.12);
  vec3 pale = vec3(0.92, 0.86, 0.72) * (0.96 + 0.04 * stri) - vec3(0.05, 0.06, 0.08) * vn(q * 3.0) - vec3(0.06, 0.07, 0.09) * smoothstep(0.7, 0.9, vn(q * 9.0 + 2.0));
  vec3 col = mix(living, pale, dead);
  // Membranes: crisp around living cells, broken and faint around dead ones.
  float mem = 1.0 - smoothstep(0.015, 0.06, edge);
  float broken = step(0.45, vn(q * 4.0 + 3.0));
  col = mix(col, mix(vec3(0.42, 0.08, 0.13), vec3(0.70, 0.60, 0.46), dead), mem * mix(0.85, 0.35 + 0.45 * broken, dead));
  // Nuclei in living cells; dead cells have lost theirs.
  vec2 nc = v.zw * vec2(1.0, 3.6);
  float nuc = (1.0 - smoothstep(0.1, 0.14, length(nc))) * (1.0 - dead);
  col = mix(col, vec3(0.36, 0.12, 0.26), nuc * 0.7);
  // The eyepiece: a bright round field, falling off at its rim.
  float R0 = 0.22;
  float field = 1.0 - smoothstep(R0 - 0.004, R0 + 0.002, rad);
  col *= 1.0 - 3.2 * rad * rad;
  col += vec3(0.35, 0.12, 0.18) * smoothstep(R0 - 0.03, R0, rad) * field;
  vec3 outCol = mix(vec3(0.025, 0.015, 0.02), col, field);
  gl_FragColor = vec4(outCol, uOpacity);
}`,
  });
}

/** The real heart (heart3d/realHeart.ts) as the landing's living heart: its own textures, made wet,
 *  and moved by the story. `align` maps the model into the heart frame used everywhere here (apex at
 *  y = 0, base at y = H, the front towards +z), so the territory, the beat and the trim line up with
 *  the slices. `trim` dissolves the atria and great vessels; `vanish` dissolves everything (when the
 *  blades cut and the stained slices take over). */
export function realHeartMaterial(
  base: THREE.MeshStandardMaterial,
  align: THREE.Matrix4,
  trim: THREE.IUniform = { value: 0 },
  vanish: THREE.IUniform = { value: 0 },
  own: Shared = SHARED,
  /** Learn: tint the model's own labelled regions (heart3d/skinParts.ts) as they are highlighted. */
  parts?: { levels: THREE.IUniform<number[]>; flags: THREE.IUniform<number[]>; colour: THREE.Color },
) {
  const m = new THREE.MeshPhysicalMaterial({
    map: base.map,
    normalMap: base.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: base.roughnessMap,
    metalnessMap: base.metalnessMap,
    roughness: 0.85,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
    sheen: 0.15,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ffb0b0'),
    envMapIntensity: 0.55,
    side: THREE.DoubleSide,
  });
  if (parts) m.defines = { ...m.defines, SKIN_PARTS: '', MAX_PARTS: parts.levels.value.length, MAX_FLAGS: parts.flags.value.length };
  m.onBeforeCompile = (shader) => {
    if (parts) Object.assign(shader.uniforms, { uPartLevel: parts.levels, uFlagLevel: parts.flags, uHl: { value: parts.colour } });
    shared(shader.uniforms, {
      uAlign: { value: align },
      uAlignInv: { value: align.clone().invert() },
      uTrim: trim,
      uVanish: vanish,
      uIschCol: { value: PALETTE.uIschCol },
      uFrostCol: { value: PALETTE.uFrostCol },
      uEdge: { value: PALETTE.uEdge },
      uDissolve: { value: 0 },
    }, own);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat4 uAlign, uAlignInv;
varying vec3 vHeart;
#ifdef SKIN_PARTS
attribute float aPart;
attribute float aFlags;
uniform float uPartLevel[MAX_PARTS];
uniform float uFlagLevel[MAX_FLAGS];
varying float vHl;
#endif
${UNIFORMS_GLSL}
${NOISE}
${HEART}
/** The LAD's territory as seen on the outside: the front of the left ventricle and the apex. */
float lnFront(vec3 p) {
  float t = clamp(p.y / LN_H, 0.0, 1.0);
  float a = atan(p.z, p.x);
  float side = smoothstep(1.35, 0.9, abs(lnWrap(a - 0.45)) + (lnFbm(p * 4.0) - 0.5) * 0.4);
  return max(side, 1.0 - smoothstep(0.16, 0.3, t)) * (1.0 - smoothstep(0.7, 0.9, t));
}`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 hp = (uAlign * vec4(position, 1.0)).xyz;
vHeart = hp;
#ifdef SKIN_PARTS
{
  // How lit this point is, worked out per vertex and blended across triangles, so a highlighted
  // region has soft edges instead of steps.
  int k = int(aPart + 0.5) - 1;
  float h = k >= 0 ? uPartLevel[k] : 0.0;
  for (int i = 0; i < MAX_FLAGS; i++) {
    if (mod(floor(aFlags / exp2(float(i))), 2.0) > 0.5) h = max(h, uFlagLevel[i]);
  }
  vHl = h;
}
#endif
{
  // Systole: atria first, then the ventricles squeeze and shorten; starved muscle barely moves.
  float tt = clamp(hp.y / LN_H, 0.0, 1.2);
  float vent = 1.0 - smoothstep(0.86, 0.98, tt);
  float hypo = uIsch * lnFront(hp);
  float sq = uBeatV * (1.0 - 0.9 * hypo) * vent;
  hp.xz *= 1.0 - 0.055 * sq * (0.55 + 0.45 * tt) - 0.04 * uBeatA * (1.0 - vent);
  hp.y -= 0.07 * uBeatV * min(tt, 0.95);
}
vec3 transformed = (uAlignInv * vec4(hp, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vHeart;
#ifdef SKIN_PARTS
varying float vHl;
uniform vec3 uHl;
#endif
${UNIFORMS_GLSL}
uniform float uTrim, uVanish;
uniform vec3 uIschCol, uFrostCol, uEdge;
${NOISE}
${HEART}
float lnFront(vec3 p) {
  float t = clamp(p.y / LN_H, 0.0, 1.0);
  float a = atan(p.z, p.x);
  float side = smoothstep(1.35, 0.9, abs(lnWrap(a - 0.45)) + (lnFbm(p * 4.0) - 0.5) * 0.4);
  return max(side, 1.0 - smoothstep(0.16, 0.3, t)) * (1.0 - smoothstep(0.7, 0.9, t));
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 p = vHeart;
  float t = p.y / LN_H;
  // The atria and great vessels go first, from the top down to just above the groove.
  float above = smoothstep(0.86, 0.95, t);
  float dn = lnFbm(p * 3.2 + 7.0) - (uTrim * above * 1.15 - 0.08);
  if (uTrim > 0.0 && above > 0.0) {
    if (dn < 0.0) discard;
    totalEmissiveRadiance += uEdge * (1.0 - smoothstep(0.0, 0.04, dn)) * 1.4 * step(0.001, uTrim * above);
  }
  // Then the whole heart, as the blades cut it into the slices.
  if (uVanish > 0.0) {
    float dv = lnFbm(p * 2.6 + 3.0) - (uVanish * 1.15 - 0.08);
    if (dv < 0.0) discard;
    totalEmissiveRadiance += uEdge * (1.0 - smoothstep(0.0, 0.05, dv)) * 1.6;
  }
  // The starved territory: dusky, bluish, dull.
  if (uIsch > 0.0) {
    float isch = uIsch * lnFront(p);
    diffuseColor.rgb = mix(diffuseColor.rgb, uIschCol * (0.7 + 0.6 * lnFbm(p * 10.0 + 3.0)), isch * 0.75);
  }
  // Chilled: frost catching the light.
  if (uFrost > 0.0) {
    diffuseColor.rgb = mix(diffuseColor.rgb, uFrostCol, uFrost * (0.25 + 0.5 * lnFbm(p * 22.0)) * 0.5);
    totalEmissiveRadiance += uFrostCol * uFrost * smoothstep(0.93, 0.98, lnNoise(p * 90.0)) * 0.12;
  }
#ifdef SKIN_PARTS
  // Learn: the highlighted part, in the model's own shape.
  diffuseColor.rgb = mix(diffuseColor.rgb, uHl, 0.42 * vHl);
  totalEmissiveRadiance += uHl * 0.22 * vHl;
#endif
}`,
      );
  };
  m.customProgramCacheKey = () => (parts ? 'cardia-real-heart-parts' : 'cardia-real-heart');
  return m;
}
