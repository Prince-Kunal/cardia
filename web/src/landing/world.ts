// The landing page's 3D world, as plain functions the scene component drives: build it once
// (createWorld), move it to a moment of the story every frame (stepWorld), size it (resizeWorld) and
// free it (disposeWorld). One heart: it beats, its LAD is tied and released, it is removed, trimmed,
// chilled, sliced by a matrix of blades, stained in a TTC bath, and looked at closer and closer.
// Everything follows the story's timeline (story.ts); only the heartbeat, the blood pulses and the
// liquid move with time, and those stop under reduced motion.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { H, buildHeart, taperedTube } from '../heart3d/model';
import { loadRealHeart } from '../heart3d/realHeart';
import { CUTS, SLICES, buildBase, buildSlabs, cavityPoint, onEpicardium, rvWallPoint, wallPoint } from './geometry';
import { DARK_STAGE } from './stage';
import { beat, seg, stateAt } from './story';
import { SHARED, bathMaterial, microscopeMaterial, organMaterial, realHeartMaterial, tissueMaterial, vesselMaterial } from './tissue';

/** The page's label elements, moved to where their points are on screen. */
export interface LabelRefs {
  slices: (HTMLElement | null)[];
  parts: Record<string, HTMLElement | null>;
}

const HALF = new THREE.Vector3(0, H / 2, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
/** The slices face us apex side up, the front of the heart at the top, the right ventricle on the left. */
const FACED = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
/** The yaw that turns the LAD towards the camera. */
const SHOW_LAD = -0.52;
/** Where the real heart sits in the heart frame (apex at y = 0, base at y = H, front towards +z):
 *  scaled, its long axis stood upright, its ventricles over the slices'. Tuned by eye against them. */
function realAlignment(): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(0.14, 1.655, -0.12),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, THREE.MathUtils.degToRad(-12))),
    new THREE.Vector3(2.15, 2.15, 2.15),
  );
}
/** The slices' size while they are still the heart, matched to the real heart's; they settle back to
 *  their own size as they come apart. */
const FIT = 0.94;

/** The slice the camera goes to: the middle of the ventricles, where the infarct is widest. */
const FOCUS = 3;

/** Where each slice lies once laid out: two rows of three, apex to base, left to right. */
function gridPosition(i: number): THREE.Vector3 {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return new THREE.Vector3((col - 1) * 1.5, row === 0 ? 0.78 : -0.78, 0);
}

type Key = { u: number; pos: [number, number, number]; look: [number, number, number] };

function cameraKeys(border: THREE.Vector3): Key[] {
  const f = gridPosition(FOCUS);
  return [
    { u: 0, pos: [0, 0.6, 9.2], look: [0, 0.5, 0] },
    { u: 0.9, pos: [0.1, 0.6, 8.2], look: [0, 0.45, 0] },
    { u: 1.35, pos: [0.25, 0.7, 4.9], look: [0.05, 0.35, 0] },
    { u: 1.95, pos: [0.3, 0.6, 5.0], look: [0.05, 0.3, 0] },
    { u: 2.6, pos: [0, 0.6, 7.4], look: [0, 0.35, 0] },
    { u: 3.4, pos: [0, 0.7, 7.0], look: [0, 0.2, 0] },
    { u: 3.9, pos: [0, 1.55, 6.0], look: [0, 0, 0] },
    { u: 4.3, pos: [0, 2.0, 5.3], look: [0, -0.05, 0] },
    { u: 4.62, pos: [0, 1.2, 6.8], look: [0, 0, 0] },
    { u: 5.0, pos: [0, 0, 7.4], look: [0, 0, 0] },
    { u: 5.98, pos: [0, 0, 7.1], look: [0, 0, 0] },
    { u: 6.55, pos: [f.x, f.y, 3.3], look: [f.x, f.y, 0] },
    { u: 7.0, pos: [f.x, f.y, 3.1], look: [f.x, f.y, 0] },
    { u: 7.42, pos: [border.x, border.y, 0.75], look: [border.x, border.y, 0] },
    { u: 8.2, pos: [border.x, border.y, 0.55], look: [border.x, border.y, 0] },
  ];
}

function sampleKeys(keys: Key[], u: number, pos: THREE.Vector3, look: THREE.Vector3) {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].u) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = seg(u, a.u, b.u);
  pos.set(...a.pos).lerp(new THREE.Vector3(...b.pos), t);
  look.set(...a.look).lerp(new THREE.Vector3(...b.look), t);
}

const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

function createHeart() {
  const { curves, geometries: g } = buildHeart();
  const trimDissolve = { value: 0 };
  const coronaryDissolve = { value: 0 };

  // The parts trimmed away before slicing: the base of the ventricles, the atria, the vessels.
  const trimmed = new THREE.Group();
  const add = (geo: THREE.BufferGeometry | THREE.BufferGeometry[], mat: THREE.Material) =>
    (Array.isArray(geo) ? geo : [geo]).forEach((x) => trimmed.add(new THREE.Mesh(x, mat)));
  add(buildBase(), tissueMaterial(trimDissolve));
  const raCentre = new THREE.Vector3(-0.7, 2.18, 0.02);
  const laCentre = new THREE.Vector3(0.3, 2.18, -0.42);
  add([g.ra, g.rightAuricle], organMaterial('#7d2a3f', trimDissolve, { pulseCentre: raCentre, pulse: 1, atrial: true }));
  add([g.la, g.leftAuricle], organMaterial('#8c2f3c', trimDissolve, { pulseCentre: laCentre, pulse: 1, atrial: true }));
  add(g.aorta, organMaterial('#b8434d', trimDissolve, { pulse: 1, gloss: 0.9 }));
  add([...g.trunk, g.svc, g.ivc, ...g.veins], organMaterial('#3e4a8a', trimDissolve, { pulse: 0.6, gloss: 0.9 }));
  add(g.base, organMaterial('#6d1f2a', trimDissolve));

  // The coronary arteries, with blood running down them; the LAD stops past the tie.
  const coronaries = new THREE.Group();
  const lad = taperedTube(curves.lad, 0.024, 0.009, 96, 12);
  const LIGATURE_AT = 0.16;
  coronaries.add(new THREE.Mesh(lad, vesselMaterial(coronaryDissolve, { blockAt: LIGATURE_AT, pulses: 4 })));
  const plain = vesselMaterial(coronaryDissolve, { pulses: 3 });
  for (const c of curves.diagonals) coronaries.add(new THREE.Mesh(taperedTube(c, 0.014, 0.006, 32, 8), vesselMaterial(coronaryDissolve, { blockAt: 0, pulses: 2 })));
  // The right coronary and its branches run over the right ventricle, drawn on this heart's surface.
  const onRv = (pts: number[][]) => new THREE.CatmullRomCurve3(pts.map(([d, t]) => onEpicardium(d, t)), false, 'centripetal');
  const rca = onRv([[100, 0.985], [130, 0.975], [160, 0.965], [190, 0.955], [220, 0.95], [238, 0.94]]);
  const acuteMarginal = onRv([[165, 0.96], [168, 0.75], [172, 0.55], [176, 0.38]]);
  const pda = onRv([[238, 0.94], [240, 0.75], [242, 0.5], [240, 0.3]]);
  for (const c of [curves.lcx, rca]) coronaries.add(new THREE.Mesh(taperedTube(c, 0.02, 0.014, 64, 10), plain));
  for (const c of [curves.marginal, acuteMarginal, pda]) coronaries.add(new THREE.Mesh(taperedTube(c, 0.013, 0.006, 32, 8), plain));
  coronaries.add(new THREE.Mesh(taperedTube(curves.leftMain, 0.026, 0.024, 16, 10), plain));

  // The tie: a loop of blue suture round the LAD, a knot, two short ends.
  const ligature = new THREE.Group();
  const at = curves.lad.getPointAt(LIGATURE_AT);
  const tangent = curves.lad.getTangentAt(LIGATURE_AT);
  const suture = new THREE.MeshPhysicalMaterial({ color: '#3552d6', emissive: '#2a44c8', emissiveIntensity: 0.6, roughness: 0.3, clearcoat: 1, transparent: true, opacity: 0 });
  const loop = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 12, 48), suture);
  loop.quaternion.setFromUnitVectors(Z, tangent);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), suture);
  const outward = at.clone().setY(0).normalize();
  knot.position.copy(outward.clone().multiplyScalar(0.05));
  const ends = [0.6, -0.6].map((s) => {
    const end = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          outward.clone().multiplyScalar(0.05),
          outward.clone().multiplyScalar(0.14).add(new THREE.Vector3(0, 0.05 * s, 0.04 * s)),
          outward.clone().multiplyScalar(0.22).add(new THREE.Vector3(0.02 * s, 0.1 * s, 0.09 * s)),
        ]),
        16,
        0.009,
        6,
      ),
      suture,
    );
    return end;
  });
  ligature.position.copy(at);
  ligature.add(loop, knot, ...ends);

  // The slices, apex first.
  const slabs = buildSlabs().map((s) => {
    const mesh = new THREE.Mesh(s.geometry, tissueMaterial());
    mesh.position.copy(s.centre).multiplyScalar(-1);
    const pivot = new THREE.Group();
    pivot.add(mesh);
    return { ...s, mesh, pivot };
  });

  return { trimmed, coronaries, ligature, loop, suture, slabs, trimDissolve, coronaryDissolve, ligatureAt: at.clone() };
}

function createBlades() {
  const steel = new THREE.MeshPhysicalMaterial({ color: '#c9ccd6', metalness: 1, roughness: 0.18, transparent: true, opacity: 0, envMapIntensity: 1.4 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.6), transparent: true, opacity: 0, toneMapped: false });
  const blades = CUTS.slice(1, -1).map(() => {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.8, 2.2), steel);
    plate.position.y = 0.9;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 2.2), glow);
    g.add(plate, edge);
    return g;
  });
  return { blades, steel, glow };
}

export type World = ReturnType<typeof createWorld>;

export function createWorld(gl: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera) {
  const heart = createHeart();
  const { blades, steel, glow } = createBlades();
  const bath = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.3), bathMaterial());
  const micro = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), microscopeMaterial());
  micro.renderOrder = 10;
  micro.frustumCulled = false;

  // Light the room for reflections. No bloom: edges stay crisp.
  const pmrem = new THREE.PMREMGenerator(gl);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.4;
  scene.background = new THREE.Color(DARK_STAGE);
  scene.fog = new THREE.Fog(DARK_STAGE, 10, 24);
  // Studio light, no colour: a soft key from the upper left, a faint fill, a white rim for the edge.
  const lights = [new THREE.AmbientLight('#ffffff', 0.16), new THREE.DirectionalLight('#fff6ee', 2.3), new THREE.DirectionalLight('#f3f4f6', 0.6), new THREE.DirectionalLight('#ffffff', 1.3)];
  lights[1].position.set(-3.5, 4.5, 5);
  lights[2].position.set(5, 0.5, 3);
  lights[3].position.set(1.5, 3.5, -5);
  // The heart frame: the real heart and the suture ride on it.
  const frame = new THREE.Group();
  frame.add(heart.ligature);
  const real = { mesh: null as THREE.Mesh | null, trim: { value: 0 }, vanish: { value: 0 }, gone: false };
  const objects: THREE.Object3D[] = [...lights, frame, heart.trimmed, heart.coronaries, ...heart.slabs.map((s) => s.pivot), ...blades, bath, micro];
  scene.add(...objects);

  // The real heart arrives a moment later; until then (or if it can't load) the drawn heart stands in.
  loadRealHeart('realistic')
    .then((loaded) => {
      if (real.gone) return;
      const align = realAlignment();
      const mesh = new THREE.Mesh(loaded.geometry, realHeartMaterial(loaded.material as THREE.MeshStandardMaterial, align, real.trim, real.vanish));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(align);
      mesh.userData.sharedGeometry = true;
      // Tie the suture on the real surface: cast in from outside, over the drawn LAD.
      const probe = new THREE.Mesh(loaded.geometry);
      probe.matrixAutoUpdate = false;
      probe.matrix.copy(align);
      probe.updateMatrixWorld(true);
      const out = heart.ligatureAt.clone().setY(0).normalize();
      const ray = new THREE.Raycaster(heart.ligatureAt.clone().addScaledVector(out, 3), out.clone().negate());
      const hit = ray.intersectObject(probe, false)[0];
      if (hit) heart.ligature.position.copy(hit.point).addScaledVector(out, 0.012);
      frame.add(mesh);
      real.mesh = mesh;
    })
    .catch(() => undefined);


  // The point on the focus slice where the infarct meets living muscle, for the closest shot.
  const focus = heart.slabs[FOCUS];
  const border = gridPosition(FOCUS).add(wallPoint(CUTS[FOCUS], 30, 0.62).sub(focus.centre).multiplyScalar(0.7).applyQuaternion(FACED));
  const t = CUTS[FOCUS];
  const partAnchors: Record<string, THREE.Vector3> = {
    living: wallPoint(t, -55, 0.5),
    infarct: wallPoint(t, 78, 0.35),
    lv: cavityPoint(t, 'lv'),
    rv: rvWallPoint(t, 160),
    septum: wallPoint(t, 175, 0.5),
  };

  return {
    gl,
    scene,
    cam,
    heart,
    frame,
    real,
    blades,
    steel,
    glow,
    bath,
    micro,
    lights,
    objects,
    environment,
    keys: cameraKeys(border),
    partAnchors,
    size: { width: 1, height: 1 },
    /** Frame time, smoothed: if the computer struggles, the canvas drops to a lower resolution. */
    perf: { frame: 1 / 60, slow: 0, dpr: Math.min(1.5, window.devicePixelRatio || 1) },
    tmp: {
      u: 0,
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      camLook: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      qYaw: new THREE.Quaternion(),
      qLie: new THREE.Quaternion(),
      v: new THREE.Vector3(),
      w: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      time: 0,
      first: true,
    },
  };
}

const DARK_SURROUND = new THREE.Color(0.025, 0.015, 0.02);

/** Paint the room the story happens in: the stage colour the page's look gives (landing.css --stage).
 *  A light stage is paper (the lab notebook look): more ambient light so the heart's shadow side does
 *  not read as a hole, the bath drawn as a tint instead of light, and the eyepiece set on paper. */
export function paintStage(w: World, colour: string): void {
  const c = new THREE.Color(colour);
  const paper = c.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
  w.scene.background = c;
  (w.scene.fog as THREE.Fog).color.copy(c);
  w.lights[0].intensity = paper ? 0.32 : 0.16;
  const bath = w.bath.material as THREE.ShaderMaterial;
  bath.uniforms.uPaper.value = paper ? 1 : 0;
  const blending = paper ? THREE.NormalBlending : THREE.AdditiveBlending;
  if (bath.blending !== blending) {
    bath.blending = blending;
    bath.needsUpdate = true;
  }
  // The shader writes this colour as it is, so give it the page's sRGB values.
  const micro = (w.micro.material as THREE.ShaderMaterial).uniforms.uSurround.value as THREE.Color;
  if (paper) c.getRGB(micro, THREE.SRGBColorSpace);
  else micro.copy(DARK_SURROUND);
}

export function resizeWorld(w: World, width: number, height: number): void {
  w.size = { width, height };
  w.gl.setPixelRatio(w.perf.dpr);
  w.gl.setSize(width, height, false);
}

export function disposeWorld(w: World): void {
  w.real.gone = true;
  w.scene.remove(...w.objects);
  w.environment.dispose();
  for (const o of w.objects)
    o.traverse((x) => {
      if (x instanceof THREE.Mesh) {
        // The real heart's geometry is shared with Learn: keep it.
        if (!x.userData.sharedGeometry) x.geometry.dispose();
        (Array.isArray(x.material) ? x.material : [x.material]).forEach((m) => m.dispose());
      }
    });
}

/** Move the world to where the story is (`target`, in chapters) and draw it. */
export function stepWorld(w: World, { target, dt, reduced, labels }: { target: number; dt: number; reduced: boolean; labels: LabelRefs }): void {
  const { tmp, cam, size } = w;
  // Follow the scroll with a little lag, so the story glides.
  const k = reduced || tmp.first ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 5);
  if (target > 0) tmp.first = false;
  tmp.u += (target - tmp.u) * k;
  const u = tmp.u;
  const s = stateAt(u);
  if (!reduced) tmp.time += Math.min(dt, 0.1);
  const time = tmp.time;
  SHARED.uTime.value = time;

  // The heartbeat.
  const b = beat(time);
  const life = reduced ? 0 : s.life;
  SHARED.uBeatA.value = b.atria * life;
  SHARED.uBeatV.value = b.ventricles * life;
  SHARED.uIsch.value = s.ischaemia;
  SHARED.uStain.value = s.stain;
  SHARED.uFix.value = s.fix;
  SHARED.uFrost.value = s.frost;
  SHARED.uFlow.value = s.flow * (reduced ? 0.6 : 1);
  SHARED.uBlock.value = s.block;
  w.heart.trimDissolve.value = s.trim;
  w.heart.coronaryDissolve.value = s.coronaryTrim;
  const realHeart = w.real.mesh;
  w.heart.trimmed.visible = !realHeart && s.trim < 0.999;
  w.heart.coronaries.visible = !realHeart && s.coronaryTrim < 0.999;
  if (realHeart) {
    w.real.trim.value = s.trim;
    w.real.vanish.value = s.cut;
    realHeart.visible = s.cut < 0.999;
  }
  const fit = realHeart ? FIT + (1 - FIT) * s.separate : 1;
  // With the real heart, the slices wait out of sight until the blades cut it into them.
  const slicesShown = !realHeart || s.cut > 0.001;

  // The heart's pose: spinning, then settling to show the LAD, then lying down, apex to the left.
  const spin = 0.35 * time + u * 1.4;
  const yaw = SHOW_LAD + wrap(spin - SHOW_LAD) * (1 - s.settle);
  tmp.qYaw.setFromAxisAngle(Y, yaw);
  tmp.qLie.setFromAxisAngle(Z, (-Math.PI / 2) * s.lie);
  const heartQ = tmp.q.copy(tmp.qLie).multiply(tmp.qYaw);
  const bob = reduced ? 0 : 0.04 * Math.sin(time * 0.8) * s.life;
  const heartPos = tmp.pos.set(0, bob, 0);

  w.heart.trimmed.quaternion.copy(heartQ);
  w.heart.trimmed.position.copy(HALF).multiplyScalar(-1).applyQuaternion(heartQ).add(heartPos);
  w.heart.trimmed.position.y += s.trim * 0.5;
  w.heart.coronaries.quaternion.copy(heartQ);
  w.heart.coronaries.position.copy(w.heart.trimmed.position);
  w.heart.coronaries.position.y -= s.trim * 0.5;
  w.frame.quaternion.copy(heartQ);
  w.frame.position.copy(w.heart.coronaries.position);
  w.heart.ligature.visible = s.ligature > 0.01;
  w.heart.suture.opacity = s.ligature;
  w.heart.loop.scale.setScalar(0.07 - 0.04 * s.tighten);

  // The slices: together as the heart, then apart along its axis, then laid out facing us.
  tmp.axis.copy(Y).applyQuaternion(heartQ);
  w.heart.slabs.forEach((slab, i) => {
    const p = tmp.v.copy(slab.centre).sub(HALF).multiplyScalar(fit).applyQuaternion(heartQ).add(heartPos);
    p.addScaledVector(tmp.axis, (i - (SLICES - 1) / 2) * 0.3 * s.separate);
    p.lerp(gridPosition(i), s.face);
    slab.pivot.position.copy(p);
    slab.pivot.quaternion.copy(heartQ).slerp(FACED, s.face);
    slab.pivot.scale.setScalar(fit * (1 - 0.3 * s.face));
    slab.pivot.visible = slicesShown;
    // A gentle drift once laid out, so the slices feel suspended.
    if (!reduced && s.face > 0) {
      slab.pivot.position.y += 0.03 * Math.sin(time * 0.7 + i * 1.3) * s.face * (1 - s.zoom);
      slab.pivot.rotateX(0.04 * Math.sin(time * 0.5 + i) * s.face * (1 - s.zoom));
    }
  });

  // The blades: a matrix of them comes down through the heart at the cuts, then lifts away.
  w.steel.opacity = s.bladeShow;
  w.glow.opacity = s.bladeShow;
  w.blades.forEach((blade, k) => {
    blade.visible = s.bladeShow > 0.01;
    const x = (CUTS[k + 1] - 0.5) * H;
    blade.position.set(x, 1.35 - 2.75 * s.blades, 0);
  });

  // The bath rises over the slices, the stain blooms, the bath drains.
  const bm = w.bath.material as THREE.ShaderMaterial;
  bm.uniforms.uLevel.value = -0.05 + 1.12 * s.bath;
  bm.uniforms.uAlpha.value = s.bathShow;
  w.bath.visible = s.bathShow > 0.01;
  w.bath.position.set(0, 0, 0.55);

  // The camera: keyframes along the story; on a wide window the subject sits right of the text.
  sampleKeys(w.keys, u, tmp.camPos, tmp.camLook);
  const portrait = size.width / size.height < 1;
  if (portrait) tmp.camPos.z *= 1.8;
  cam.position.copy(tmp.camPos);
  cam.lookAt(tmp.camLook);
  // Wide: the subject sits right of the text. Tall: it sits in the top half, above the text.
  const shift = portrait ? 0 : 0.19 * (1 - seg(u, 6.9, 7.3) * 0.4);
  const lift = portrait ? 0.27 * (1 - seg(u, 7.85, 8.1)) * seg(u, 0.6, 1) : 0;
  cam.setViewOffset(size.width, size.height, -size.width * shift, size.height * lift, size.width, size.height);
  cam.updateProjectionMatrix();

  // Under the microscope: a plane in front of the camera, covering the view.
  const mm = w.micro.material as THREE.ShaderMaterial;
  mm.uniforms.uOpacity.value = s.micro;
  mm.uniforms.uZoom.value = s.microZoom;
  w.micro.visible = s.micro > 0.002;
  if (w.micro.visible) {
    const d = 0.2;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const wide = h * cam.aspect;
    w.micro.position.copy(cam.position).addScaledVector(cam.getWorldDirection(tmp.w), d);
    w.micro.quaternion.copy(cam.quaternion);
    w.micro.scale.set(wide * 1.6, h * 1.6, 1);
    mm.uniforms.uAspect.value = wide / h;
  }

  // Labels: project their points and move the page's label elements there.
  const L = labels;
  const place = (el: HTMLElement | null, world: THREE.Vector3, opacity: number) => {
    if (!el) return;
    if (opacity < 0.01) {
      el.style.opacity = '0';
      return;
    }
    const p = tmp.w.copy(world).project(cam);
    el.style.transform = `translate(${((p.x + 1) / 2) * size.width}px, ${((1 - p.y) / 2) * size.height}px)`;
    el.style.opacity = String(opacity);
  };
  w.heart.slabs.forEach((slab, i) => {
    place(L.slices[i], tmp.v.copy(slab.pivot.position).add(new THREE.Vector3(0, -0.66, 0)), s.sliceLabels);
  });
  const focus = w.heart.slabs[FOCUS];
  for (const [name, local] of Object.entries(w.partAnchors)) {
    const world = tmp.v.copy(local).sub(focus.centre).multiplyScalar(focus.pivot.scale.x).applyQuaternion(focus.pivot.quaternion).add(focus.pivot.position);
    place(L.parts[name] ?? null, world, s.partLabels);
  }

  const canvas = w.gl.domElement;
  canvas.style.opacity = String(1 - s.fade);
  w.gl.render(w.scene, cam);
  // Struggling (under about 40 frames a second for a while): draw fewer pixels.
  w.perf.frame += (Math.min(dt, 0.1) - w.perf.frame) * 0.05;
  w.perf.slow = w.perf.frame > 1 / 40 ? w.perf.slow + 1 : 0;
  if (w.perf.slow > 90 && w.perf.dpr > 1) {
    w.perf.dpr = Math.max(1, w.perf.dpr - 0.25);
    w.perf.slow = 0;
    resizeWorld(w, size.width, size.height);
  }
  if (import.meta.env.DEV) (window as unknown as { __cardiaFrames: number }).__cardiaFrames = ((window as unknown as { __cardiaFrames?: number }).__cardiaFrames ?? 0) + 1;
}
