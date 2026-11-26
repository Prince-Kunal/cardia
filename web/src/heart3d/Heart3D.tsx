// The 3D heart (PLAN.md §3, §11a item 3): the model from model.ts, driven by the same lesson scenes
// as the 2D diagram (camera, highlighted and hidden parts, labels, x-ray, animation, speed). Loaded
// on its own (React.lazy), so the rest of the app does not carry three.js. HeartView falls back to
// the 2D diagram when there is no WebGL.

import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { slab as tissueSlab } from '../landing/geometry';
import { type Shared, ownUniforms, realHeartMaterial, tissueMaterial } from '../landing/tissue';
import { CREDITS, type RealHeartKind, loadRealHeart } from './realHeart';
import { MAX_FLAGS, MAX_PARTS, labelSkin, partAt, skinLevels } from './skinParts';
import type { Scene } from '../learn/lesson';
import { type Anim, LOOPING, VIEW_NAMES, VIEW_PARTS, shortName, viewOf } from '../heart/parts';
import { captionOf, clamp, ease, reducedMotion, useTimeline } from '../heart/timeline';
import {
  H,
  LABEL_AT,
  LAD_BLOCK,
  SLAB_CUTS,
  SLICE_LABEL_AT,
  SLICE_T,
  buildHeart,
  buildSlice,
  infarctGeometry,
  slabGeometry,
  taperedTube,
} from './model';
import './heart3d.css';

export interface Heart3DProps {
  scene: Scene;
  /** A part to point at now (a part: link under the pointer). */
  focus?: string | null;
  /** Change to play the scene's animation again. */
  replay?: number;
  /** Parts answer clicks (for quizzes on the 3D heart, later). */
  onPartClick?: (id: string) => void;
}

const COLOURS = {
  muscle: '#c45a50',
  atrium: '#a5566c',
  leftAtrium: '#b85c5e',
  poor: '#8fa9dd',
  rich: '#e88f87',
  valve: '#f3e3bd',
  aorta: '#c8423a',
  trunk: '#5d80c9',
  vein: '#5873b8',
  coronary: '#d8372d',
  starved: '#9d8f8b',
  highlight: '#f4b400',
  pale: '#ecdcb8',
  unstained: '#c9a9a3',
  stained: '#b23a4b',
};

// ---------------------------------------------------------------------------------------------
// The real hearts (realHeart.ts) as the visible skin: the realistic heart outside, the cut-open one
// for inside views. Each is placed over the drawn model (whose parts stay, unseen, for pointing,
// clicking and glowing highlights). Tuned by eye against model.ts.

const SKIN_ALIGN: Record<'realistic' | 'interior', THREE.Matrix4> = {
  realistic: new THREE.Matrix4().compose(
    new THREE.Vector3(0.15, 1.76, -0.12),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, THREE.MathUtils.degToRad(-12))),
    new THREE.Vector3(2.25, 2.25, 2.25),
  ),
  interior: new THREE.Matrix4().compose(
    new THREE.Vector3(0, 1.55, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'ZYX')),
    new THREE.Vector3(3.2, 3.2, 3.2),
  ),
};

/** The skin for this view, once loaded (null before, and if it can't load: the drawn heart shows). */
function useSkin(kind: 'realistic' | 'interior' | null, own: Shared): THREE.Mesh | null {
  const [skins, setSkins] = useState<Partial<Record<'realistic' | 'interior', THREE.Mesh>>>({});
  const made = useRef<THREE.Mesh[]>([]);
  useEffect(() => {
    if (!kind || skins[kind]) return;
    let live = true;
    loadRealHeart(kind)
      .then((loaded) => {
        if (!live) return;
        const mesh = makeSkin(loaded, kind, own);
        made.current.push(mesh);
        setSkins((prev) => ({ ...prev, [kind]: mesh }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kind, skins, own]);
  useEffect(() => () => made.current.forEach(disposeSkin), []);
  return kind ? (skins[kind] ?? null) : null;
}

function makeSkin(loaded: THREE.Mesh, kind: 'realistic' | 'interior', own: Shared): THREE.Mesh {
  // Which part each point of the model is, so highlights, pointing and labels use its own shape.
  const { anchors } = labelSkin(loaded.geometry, SKIN_ALIGN[kind], kind);
  const levels = { value: new Array<number>(MAX_PARTS).fill(0) };
  const flags = { value: new Array<number>(MAX_FLAGS).fill(0) };
  const material = realHeartMaterial(loaded.material as THREE.MeshStandardMaterial, SKIN_ALIGN[kind], undefined, undefined, own, {
    levels,
    flags,
    colour: new THREE.Color(COLOURS.highlight),
  });
  const mesh = new THREE.Mesh(loaded.geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(SKIN_ALIGN[kind]);
  mesh.userData = { anchors, levels, flags };
  return mesh;
}

function disposeSkin(mesh: THREE.Mesh): void {
  (mesh.material as THREE.Material).dispose();
}

/** Set the skin's and the slice's story values (outside the components, which only pass them on). */
function setStory(own: Shared, values: Partial<Record<keyof Shared, number>>): void {
  for (const [k, v] of Object.entries(values)) own[k as keyof Shared].value = v;
}

/** Soft studio reflections for the wet surfaces. */
function useRoomEnvironment() {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  useEffect(() => lightRoom(gl, scene), [gl, scene]);
}
function lightRoom(gl: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const pmrem = new THREE.PMREMGenerator(gl);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.5;
  return () => {
    scene.environment = null;
    env.dispose();
  };
}
function RoomEnvironmentLight() {
  useRoomEnvironment();
  return null;
}

/** Parts drawn only by the slice, and the slice cameras. */
const SLICE_CAMERAS = new Set(['short-axis', 'slice', 'ttc']);

type Kind = 'solid' | 'shell' | 'overlay' | 'line';
type Entry = { mat: THREE.Material; ids: string[]; kind: Kind; base: THREE.Color; rim: THREE.IUniform<number> };

/** Over a real skin, a highlighted part is drawn as a glowing outline: strong at its silhouette,
 *  clear in its middle, so the real anatomy shows through. */
function withRim(mat: THREE.Material, rim: THREE.IUniform<number>): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRim;').replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
if (uRim > 0.5) {
  float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
  gl_FragColor.a *= clamp(pow(1.0 - facing, 1.6) * 1.7 + 0.06, 0.0, 1.0);
}`,
    );
  };
  mat.customProgramCacheKey = () => 'cardia-rim';
}
type Registry = Map<string, Entry>;

/** One material per drawn piece, registered so the frame loop can highlight it without a render. */
function useMaterials() {
  const made = useMemo(() => {
    const reg: Registry = new Map();
    // The same key gives the same material (React may run a memo twice in development).
    const make = (key: string, ids: string[], colour: string, kind: Kind = 'solid', extra: THREE.MeshStandardMaterialParameters = {}) => {
      const existing = reg.get(key);
      if (existing) return existing.mat;
      const mat =
        kind === 'line'
          ? new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0 })
          : new THREE.MeshStandardMaterial({
              color: colour,
              roughness: 0.55,
              metalness: 0,
              side: kind === 'solid' && !extra.side ? THREE.FrontSide : THREE.DoubleSide,
              transparent: kind !== 'solid',
              opacity: kind === 'overlay' ? 0 : 1,
              depthWrite: kind !== 'overlay',
              polygonOffset: kind === 'overlay',
              polygonOffsetFactor: -2,
              ...extra,
            });
      const rim = { value: 0 };
      if (kind !== 'line') withRim(mat, rim);
      reg.set(key, { mat, ids, kind, base: new THREE.Color(colour), rim });
      return mat;
    };
    return { reg, make };
  }, []);
  useEffect(() => () => made.reg.forEach((e) => e.mat.dispose()), [made]);
  return made;
}

/** Highlights pulse, x-ray makes the outer walls see-through, overlays show when they matter. */
function Highlighter({
  reg,
  highlighted,
  focus,
  hover,
  xray,
  still,
  speed,
  mode,
  skin,
}: {
  reg: Registry;
  highlighted: Set<string>;
  focus: string | null;
  hover: string | null;
  xray: boolean;
  still: boolean;
  speed: number;
  /** 'real': a real model shows, and highlights tint its own regions (the drawn parts stay unseen).
   *  'slice': drawn bands glow over the stained slice. 'none': the drawn heart as it always was. */
  mode: 'none' | 'slice' | 'real';
  skin: THREE.Mesh | null;
}) {
  const hl = useMemo(() => new THREE.Color(COLOURS.highlight), []);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [highlighted, focus, hover, xray, mode, skin, invalidate]);
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const pulse = still ? 0.6 : 0.45 + 0.3 * Math.sin((time * Math.PI * 2 * speed) / 1.6);
    const fast = still ? 0.8 : 0.55 + 0.35 * Math.sin(time * Math.PI * 2 * 1.25);
    let moving = false;
    if (mode === 'real' && skin) {
      const level = (ids: string[]) =>
        (focus && ids.includes(focus)) || (hover && ids[0] === hover) ? fast : ids.some((id) => highlighted.has(id)) ? pulse : 0;
      moving = skinLevels(level, skin.userData.levels.value, skin.userData.flags.value);
      for (const e of reg.values()) e.mat.visible = false;
      if (moving && !still) invalidate();
      return;
    }
    for (const e of reg.values()) {
      const on = e.ids.some((id) => highlighted.has(id));
      const pointed = (focus && e.ids.includes(focus)) || (hover && e.ids[0] === hover);
      const level = pointed ? fast : on ? pulse : 0;
      if (level) moving = true;
      if (e.mat instanceof THREE.LineBasicMaterial) {
        e.mat.visible = true;
        e.mat.opacity = level ? 1 : 0;
        e.mat.color.copy(level ? hl : e.base);
        continue;
      }
      const m = e.mat as THREE.MeshStandardMaterial;
      if (mode === 'slice') {
        // Over the stained slice, a highlighted band glows; the rest stay unseen. The bands are the
        // slice's own outline, so their shapes match it.
        m.visible = level > 0;
        m.transparent = true;
        m.depthTest = false;
        m.depthWrite = false;
        m.color.copy(hl);
        m.emissive.copy(hl);
        m.emissiveIntensity = 0.6 * level;
        e.rim.value = 0;
        m.opacity = level ? 0.25 + 0.3 * level : 0;
        continue;
      }
      e.rim.value = 0;
      m.visible = true;
      m.depthTest = true;
      m.transparent = e.kind !== 'solid';
      if (e.kind !== 'overlay') m.color.copy(e.base);
      if (e.kind === 'solid') {
        m.opacity = 1;
        m.depthWrite = true;
      }
      m.emissive.copy(hl);
      m.emissiveIntensity = e.kind === 'overlay' ? 0 : level * (e.kind === 'shell' && xray ? 0.25 : 0.6);
      if (e.kind === 'shell') m.opacity = xray ? (level ? 0.24 : 0.13) : 1;
      if (e.kind === 'shell') m.depthWrite = !xray;
      if (e.kind === 'overlay') {
        m.color.copy(hl);
        m.opacity = level ? 0.25 + level * 0.3 : 0;
      }
    }
    if (moving && !still) invalidate();
  });
  return null;
}

// ---------------------------------------------------------------------------------------------
// The camera: lesson views, a smooth move between them, and the learner's own turns.

type Preset = { position: THREE.Vector3; target: THREE.Vector3 };
function presetOf(camera: string): Preset {
  if (SLICE_CAMERAS.has(camera)) return { position: new THREE.Vector3(0, -1.2, 5.2), target: new THREE.Vector3(-0.15, 0, 0) };
  if (camera === 'posterior') return { position: new THREE.Vector3(0, 0.5, -8), target: new THREE.Vector3(0, 0.2, 0) };
  return { position: new THREE.Vector3(0, 0.45, 7.4), target: new THREE.Vector3(0, 0.2, 0) };
}

function CameraRig({
  preset,
  version,
  still,
  controlsRef,
}: {
  preset: Preset;
  version: string;
  still: boolean;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera, invalidate } = useThree();
  const moving = useRef(true);
  useEffect(() => {
    moving.current = true;
    invalidate();
  }, [version, invalidate]);
  useFrame((_, dt) => {
    const c = controlsRef.current;
    if (!moving.current || !c) return;
    const k = still ? 1 : 1 - Math.exp(-dt * 4.5);
    camera.position.lerp(preset.position, k);
    c.target.lerp(preset.target, k);
    c.update();
    if (camera.position.distanceTo(preset.position) < 0.01) moving.current = false;
    invalidate();
  });
  return null;
}

/** Turn, zoom and pan with the mouse or a finger (three.js's orbit controls). */
function Controls({
  controlsRef,
  still,
  onStart,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  still: boolean;
  onStart: () => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const started = useRef(onStart);
  useEffect(() => {
    started.current = onStart;
  });
  useEffect(() => {
    const c = new OrbitControlsImpl(camera, gl.domElement);
    c.enableDamping = !still;
    c.minDistance = 3;
    c.maxDistance = 14;
    const change = () => invalidate();
    const start = () => started.current();
    c.addEventListener('change', change);
    c.addEventListener('start', start);
    controlsRef.current = c;
    return () => {
      c.removeEventListener('change', change);
      c.removeEventListener('start', start);
      c.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, still, invalidate, controlsRef]);
  // Damping needs an update every frame while the heart is still turning.
  useFrame(() => controlsRef.current?.update());
  return null;
}

// ---------------------------------------------------------------------------------------------

export default function Heart3D({ scene, focus = null, replay = 0, onPartClick }: Heart3DProps) {
  const sliceMode = SLICE_CAMERAS.has(scene.camera);
  const anim = (scene.anim as Anim | null) ?? null;
  const still = reducedMotion();
  const once = anim !== null && !LOOPING.includes(anim);
  const t = useTimeline(once, 6 / scene.speed, `${replay}|${scene.camera}|${anim}`);
  const [hover, setHover] = useState<string | null>(null);
  const [turned, setTurned] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const model = useRef<THREE.Group>(null);
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const preset = useMemo(() => presetOf(scene.camera), [scene.camera]);
  const xray = scene.xray || scene.camera === 'section';
  const highlighted = useMemo(() => new Set(scene.highlight), [scene.highlight]);
  const hidden = useMemo(() => new Set(scene.hide), [scene.hide]);
  const { reg, make } = useMaterials();
  const [own] = useState(ownUniforms);
  const skinKind = sliceMode || anim === 'slicing' ? null : xray ? 'interior' : 'realistic';
  const skin = useSkin(skinKind, own);
  const mode = sliceMode ? 'slice' : skin ? 'real' : 'none';

  // Back to the lesson's view when the step changes.
  const [lastCamera, setLastCamera] = useState(scene.camera);
  if (lastCamera !== scene.camera) {
    setLastCamera(scene.camera);
    setTurned(false);
  }

  const view = viewOf(scene.camera);
  const caption = captionOf(view, anim, t);
  const described = scene.highlight.map((p) => shortName(p));
  const label = `3D heart, ${VIEW_NAMES[view].toLowerCase()}.${described.length ? ` Highlighted: ${described.join(', ')}.` : ''}${caption ? ` ${caption}.` : ''}`;

  // Which labels to show (the same rules as the 2D diagram). Over a real model, each label sits on
  // that model's own part.
  const anchors: Record<string, THREE.Vector3> = sliceMode ? SLICE_LABEL_AT : skin ? skin.userData.anchors : LABEL_AT;
  const available = VIEW_PARTS[view].filter((p) => anchors[p] && !hidden.has(p));
  let labelled: string[] =
    scene.labels === 'all'
      ? available.filter((p) => p !== 'lv-anterior-wall' || highlighted.has(p))
      : scene.labels === 'none'
        ? []
        : scene.labels === 'auto'
          ? available.filter((p) => highlighted.has(p))
          : available.filter((p) => (scene.labels as string[]).includes(p));
  for (const extra of [focus, hover]) if (extra && available.includes(extra) && !labelled.includes(extra)) labelled = [...labelled, extra];

  const pointer = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const id = (e.object.userData.part as string | undefined) ?? null;
      setHover(id);
    },
    onPointerOut: () => setHover(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const id = e.object.userData.part as string | undefined;
      if (id && onPartClick) {
        e.stopPropagation();
        onPartClick(id);
      }
    },
  };
  // Over a real model, the pointer reads the part from the model itself: what you point at is what lights up.
  const partUnder = (e: ThreeEvent<PointerEvent | MouseEvent>) => (skin && e.face ? partAt(skin.geometry, e.face.a) : null);
  const skinPointer = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover(partUnder(e));
    },
    onPointerOut: () => setHover(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const id = partUnder(e);
      if (id && onPartClick) {
        e.stopPropagation();
        onPartClick(id);
      }
    },
  };

  return (
    <div className="heart3d">
      <div className="heart3d-canvas" role="img" aria-label={label}>
        <Canvas
          aria-hidden="true"
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: 30, position: preset.position.toArray(), near: 0.1, far: 50 }}
          gl={{ antialias: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <hemisphereLight args={['#fff6f0', '#3b2622', 0.9]} />
          <directionalLight position={[-4, 6, 5]} intensity={2.1} />
          <directionalLight position={[5, 1, 3]} intensity={0.55} />
          <directionalLight position={[0, -3, -5]} intensity={0.4} />
          <RoomEnvironmentLight />
          <Highlighter
            reg={reg}
            highlighted={highlighted}
            focus={focus}
            hover={hover}
            xray={xray && !sliceMode}
            still={still}
            speed={scene.speed}
            mode={mode}
            skin={skin}
          />
          {sliceMode ? (
            <SliceModel
              groupRef={model}
              make={make}
              hidden={hidden}
              anim={anim}
              t={t}
              stained={scene.camera === 'ttc'}
              highlighted={highlighted}
              pointer={pointer}
              own={own}
            />
          ) : (
            <HeartModel
              groupRef={model}
              make={make}
              hidden={hidden}
              anim={anim}
              t={t}
              xray={xray}
              speed={scene.speed}
              still={still}
              pointer={skin ? undefined : pointer}
              skin={skin}
              skinPointer={skinPointer}
              own={own}
            />
          )}
          <LabelProjector ids={labelled} anchors={anchors} group={model} els={labelEls} />
          <Controls controlsRef={controls} still={still} onStart={() => setTurned(true)} />
          <CameraRig preset={preset} version={`${scene.camera}|${resetCount}`} still={still} controlsRef={controls} />
        </Canvas>
        <div className="heart3d-labels" aria-hidden="true">
          {labelled.map((id) => (
            <span
              key={id}
              ref={(el) => {
                if (el) labelEls.current.set(id, el);
                else labelEls.current.delete(id);
              }}
              className={`heart3d-label ${highlighted.has(id) || focus === id ? 'strong' : ''}`}
            >
              {shortName(id)}
            </span>
          ))}
        </div>
      </div>
      {caption && <p className="heart3d-caption">{caption}</p>}
      <div className="heart3d-tools">
        <span className="fine">Drag to turn, scroll to zoom.</span>
        {skin && skinKind && (
          <a className="fine heart3d-credit" href={CREDITS[skinKind as RealHeartKind].url} target="_blank" rel="noreferrer">
            Model: {CREDITS[skinKind as RealHeartKind].author}, CC BY 4.0
          </a>
        )}
        {turned && (
          <button
            type="button"
            className="button small"
            onClick={() => {
              setTurned(false);
              setResetCount((c) => c + 1);
            }}
          >
            Back to lesson view
          </button>
        )}
      </div>
    </div>
  );
}

/** Places the HTML labels over their parts each frame (cheaper and steadier than a React root per label). */
function LabelProjector({
  ids,
  anchors,
  group,
  els,
}: {
  ids: string[];
  anchors: Record<string, THREE.Vector3>;
  group: MutableRefObject<THREE.Group | null>;
  els: MutableRefObject<Map<string, HTMLSpanElement>>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [ids, invalidate]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const g = group.current;
    if (!g) return;
    g.updateWorldMatrix(true, false);
    const placed: { el: HTMLSpanElement; x: number; y: number; w: number; h: number; shown: boolean }[] = [];
    for (const id of ids) {
      const el = els.current.get(id);
      const anchor = anchors[id];
      if (!el || !anchor) continue;
      v.copy(anchor).applyMatrix4(g.matrixWorld).project(camera);
      placed.push({ el, x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, w: el.offsetWidth, h: el.offsetHeight, shown: v.z < 1 });
    }
    // Labels never sit on each other: one that would overlap a label above it moves down below it.
    placed.sort((a, b) => a.y - b.y);
    for (let i = 0; i < placed.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = placed[j];
        const b = placed[i];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2) b.y = a.y + (a.h + b.h) / 2 + 2;
      }
    }
    for (const p of placed) {
      p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
      p.el.style.opacity = p.shown ? '1' : '0';
    }
  });
  return null;
}

type Make = ReturnType<typeof useMaterials>['make'];
type Pointer = {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
};

/** A mesh for one part: `ids[0]` names it (hover, click); the rest also light it up. */
function Piece({
  geometry,
  material,
  ids,
  hidden,
  pointer,
  visible = true,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  ids: string[];
  hidden: Set<string>;
  pointer?: Pointer;
  visible?: boolean;
}) {
  if (hidden.has(ids[0])) return null;
  // Without pointer handlers a piece is left out of picking altogether.
  return (
    <mesh
      geometry={geometry}
      material={material}
      userData={{ part: ids[0] }}
      visible={visible}
      raycast={pointer ? undefined : () => null}
      {...pointer}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// The whole heart

function HeartModel({
  groupRef,
  make,
  hidden,
  anim,
  t,
  xray,
  speed,
  still,
  pointer,
  skin,
  skinPointer,
  own,
}: {
  groupRef: MutableRefObject<THREE.Group | null>;
  make: Make;
  hidden: Set<string>;
  anim: Anim | null;
  t: number;
  xray: boolean;
  speed: number;
  still: boolean;
  /** Absent over a real model: then the model takes the pointer (skinPointer). */
  pointer?: Pointer;
  skin: THREE.Mesh | null;
  skinPointer: Partial<Pointer> & { onPointerMove?: (e: ThreeEvent<PointerEvent>) => void };
  own: Shared;
}) {
  const { curves, geometries: g } = useMemo(() => buildHeart(), []);
  const m = useMemo(
    () => ({
      lv: make('lv', ['lv', 'myocardium', 'epicardium'], COLOURS.muscle, 'shell'),
      rv: make('rv', ['rv', 'myocardium', 'epicardium'], COLOURS.muscle, 'shell'),
      base: make('base', ['base-cap'], COLOURS.muscle, 'shell'),
      baseRing: make('baseRing', ['base'], COLOURS.highlight, 'overlay'),
      septum: make('septum', ['septum', 'myocardium'], COLOURS.muscle, 'solid', { side: THREE.DoubleSide }),
      lvCavity: make('lvCavity', ['lv', 'lv-cavity'], COLOURS.rich, 'solid', { side: THREE.DoubleSide }),
      rvCavity: make('rvCavity', ['rv', 'rv-cavity'], COLOURS.poor, 'solid', { side: THREE.DoubleSide }),
      ra: make('ra', ['ra'], COLOURS.atrium, 'shell'),
      la: make('la', ['la'], COLOURS.leftAtrium, 'shell'),
      raCavity: make('raCavity', ['ra'], COLOURS.poor),
      laCavity: make('laCavity', ['la'], COLOURS.rich),
      auricleR: make('auricleR', ['ra'], COLOURS.atrium),
      auricleL: make('auricleL', ['la'], COLOURS.leftAtrium),
      tricuspid: make('tricuspid', ['tricuspid'], COLOURS.valve),
      mitral: make('mitral', ['mitral'], COLOURS.valve),
      'aortic-valve': make('aortic-valve', ['aortic-valve'], COLOURS.valve),
      'pulmonary-valve': make('pulmonary-valve', ['pulmonary-valve'], COLOURS.valve),
      aorta: make('aorta', ['aorta'], COLOURS.aorta, 'solid', { side: THREE.DoubleSide }),
      trunk: make('trunk', ['pulmonary-trunk'], COLOURS.trunk, 'solid', { side: THREE.DoubleSide }),
      svc: make('svc', ['svc'], COLOURS.vein, 'solid', { side: THREE.DoubleSide }),
      ivc: make('ivc', ['ivc'], COLOURS.vein, 'solid', { side: THREE.DoubleSide }),
      veins: make('veins', ['pulmonary-veins'], COLOURS.aorta, 'solid', { side: THREE.DoubleSide }),
      lad: make('lad', ['lad'], COLOURS.coronary, 'solid', { roughness: 0.35 }),
      lcx: make('lcx', ['lcx'], COLOURS.coronary, 'solid', { roughness: 0.35 }),
      rca: make('rca', ['rca'], COLOURS.coronary, 'solid', { roughness: 0.35 }),
      leftMain: make('leftMain', ['left-main'], COLOURS.coronary, 'solid', { roughness: 0.35 }),
      starved: make('starved', ['lad'], COLOURS.starved, 'solid', { roughness: 0.6 }),
      ladTerritory: make('ladTerritory', ['lad-territory', 'lv-anterior-wall'], COLOURS.highlight, 'overlay'),
      lcxTerritory: make('lcxTerritory', ['lcx-territory'], COLOURS.highlight, 'overlay'),
      rcaTerritory: make('rcaTerritory', ['rca-territory'], COLOURS.highlight, 'overlay'),
      apex: make('apex', ['apex'], COLOURS.muscle),
      slab: make('slab', ['myocardium'], COLOURS.muscle, 'solid', { side: THREE.DoubleSide }),
    }),
    [make],
  );
  const distal = useMemo(() => {
    const pts = Array.from({ length: 24 }, (_, i) => curves.lad.getPointAt(LAD_BLOCK + ((1 - LAD_BLOCK) * i) / 23));
    return [taperedTube(new THREE.CatmullRomCurve3(pts), 0.031, 0.013, 40, 10), ...curves.diagonals.map((c) => taperedTube(c, 0.024, 0.01, 24, 8))];
  }, [curves]);
  const clot = useMemo(() => curves.lad.getPointAt(LAD_BLOCK), [curves]);
  const slabs = useMemo(() => SLAB_CUTS.slice(0, -1).map((t0, i) => slabGeometry(t0, SLAB_CUTS[i + 1])), []);

  // Occlusion: the LAD's territory turns pale (and partly recovers with reperfusion).
  const occluded = anim === 'occlusion' || (anim === 'reperfusion' && t < 0.25);
  const pale = anim === 'occlusion' ? clamp((t - 0.12) / 0.88) : anim === 'reperfusion' ? 1 - 0.55 * clamp((t - 0.25) / 0.6) : 0;

  // Slicing: the ventricles come apart into slices, apex to base.
  const slicing = anim === 'slicing';
  const gap = slicing ? 0.16 * ease(clamp(t * 1.25)) : 0;

  const ventricles = useRef<THREE.Group>(null);
  const atria = useRef<THREE.Group>(null);
  useFrame(({ clock, invalidate }) => {
    if (anim !== 'heartbeat' || still) {
      ventricles.current?.scale.set(1, 1, 1);
      atria.current?.scale.set(1, 1, 1);
      setStory(own, { uBeatA: 0, uBeatV: 0, uIsch: pale, uStain: 0, uReach: 0 });
      return;
    }
    const phase = ((clock.getElapsedTime() * speed) / 0.9) % 1;
    const squeeze = (from: number, peak: number, to: number) =>
      phase < from || phase > to ? 0 : phase < peak ? (phase - from) / (peak - from) : (to - phase) / (to - peak);
    const a = 1 - 0.07 * squeeze(0, 0.15, 0.35);
    const v = 1 - 0.06 * squeeze(0.25, 0.45, 0.7);
    atria.current?.scale.set(a, a, a);
    ventricles.current?.scale.set(v, 1 - (1 - v) * 0.5, v);
    setStory(own, { uBeatA: (1 - a) / 0.07, uBeatV: (1 - v) / 0.06, uIsch: pale, uStain: 0, uReach: 0 });
    invalidate();
  });

  return (
    <group ref={groupRef} rotation={[0.12, -0.26, 0.42]} position={[0.55, -1.45, 0]}>
      {skin && <primitive object={skin} {...skinPointer} />}
      {/* The ventricles, scaled about the base for the heartbeat. */}
      <group position={[0, H, 0]}>
        <group ref={ventricles}>
          <group position={[0, -H, 0]}>
            {!slicing && (
              <>
                <Piece geometry={g.lv} material={m.lv} ids={['lv', 'myocardium', 'epicardium']} hidden={hidden} pointer={pointer} />
                <Piece geometry={g.rv} material={m.rv} ids={['rv', 'myocardium', 'epicardium']} hidden={hidden} pointer={pointer} />
                <Piece geometry={g.septum} material={m.septum} ids={['septum']} hidden={hidden} pointer={pointer} visible={xray} />
                <Piece geometry={g.lvCavity} material={m.lvCavity} ids={['lv-cavity', 'lv']} hidden={hidden} pointer={pointer} visible={xray} />
                <Piece geometry={g.rvCavity} material={m.rvCavity} ids={['rv-cavity', 'rv']} hidden={hidden} pointer={pointer} visible={xray} />
                {/* Territories are see-through layers: they colour the surface but leave the pointer to it. */}
                <Piece geometry={g.ladTerritory} material={m.ladTerritory} ids={['lad-territory', 'lv-anterior-wall']} hidden={hidden} />
                <Piece geometry={g.lcxTerritory} material={m.lcxTerritory} ids={['lcx-territory']} hidden={hidden} />
                <Piece geometry={g.rcaTerritory} material={m.rcaTerritory} ids={['rca-territory']} hidden={hidden} />
                {pale > 0 && !skin && (
                  <mesh geometry={g.ladTerritory} raycast={() => null}>
                    <meshStandardMaterial
                      color={COLOURS.pale}
                      roughness={0.8}
                      transparent
                      opacity={0.9 * pale}
                      depthWrite={false}
                      polygonOffset
                      polygonOffsetFactor={-3}
                    />
                  </mesh>
                )}
                {!hidden.has('lad') &&
                  g.lad.map((geo, i) => <mesh key={i} geometry={geo} material={m.lad} userData={{ part: 'lad' }} {...pointer} />)}
                {occluded && !skin && distal.map((geo, i) => <mesh key={i} geometry={geo} material={m.starved} userData={{ part: 'lad' }} />)}
                {!hidden.has('lcx') &&
                  g.lcx.map((geo, i) => <mesh key={i} geometry={geo} material={m.lcx} userData={{ part: 'lcx' }} {...pointer} />)}
                {!hidden.has('rca') &&
                  g.rca.map((geo, i) => <mesh key={i} geometry={geo} material={m.rca} userData={{ part: 'rca' }} {...pointer} />)}
                {!skin && <mesh geometry={g.leftMain} material={m.leftMain} />}
                {occluded && (
                  <mesh position={clot}>
                    <sphereGeometry args={[0.055, 16, 12]} />
                    <meshStandardMaterial color="#3b1210" roughness={0.4} />
                  </mesh>
                )}
                <mesh position={[0, 0, 0]} material={m.apex} userData={{ part: 'apex' }} {...pointer}>
                  <sphereGeometry args={[0.045, 12, 10]} />
                </mesh>
              </>
            )}
            {slicing &&
              slabs.map((geo, i) => <mesh key={i} geometry={geo} material={m.slab} position={[0, gap * i, 0]} userData={{ part: 'myocardium' }} />)}
          </group>
        </group>
      </group>
      {/* Above the ventricles: atria, valves and great vessels (lifted with the top slice while slicing). */}
      <group position={[0, gap * (slabs.length - 1), 0]}>
        {!skin && <mesh geometry={g.base} material={m.base} />}
        <Piece geometry={g.baseRing} material={m.baseRing} ids={['base']} hidden={hidden} />
        <group position={[0, 2.15, 0]}>
          <group ref={atria}>
            <group position={[0, -2.15, 0]}>
              <Piece geometry={g.ra} material={m.ra} ids={['ra']} hidden={hidden} pointer={pointer} />
              <Piece geometry={g.la} material={m.la} ids={['la']} hidden={hidden} pointer={pointer} />
              <Piece geometry={g.raCavity} material={m.raCavity} ids={['ra']} hidden={hidden} pointer={pointer} visible={xray} />
              <Piece geometry={g.laCavity} material={m.laCavity} ids={['la']} hidden={hidden} pointer={pointer} visible={xray} />
              <Piece geometry={g.rightAuricle} material={m.auricleR} ids={['ra']} hidden={hidden} pointer={pointer} />
              <Piece geometry={g.leftAuricle} material={m.auricleL} ids={['la']} hidden={hidden} pointer={pointer} />
            </group>
          </group>
        </group>
        {(['tricuspid', 'mitral', 'aortic-valve', 'pulmonary-valve'] as const).map((id) => (
          <Piece key={id} geometry={g.valves[id]} material={m[id]} ids={[id]} hidden={hidden} pointer={pointer} visible={xray} />
        ))}
        {!hidden.has('aorta') && g.aorta.map((geo, i) => <mesh key={i} geometry={geo} material={m.aorta} userData={{ part: 'aorta' }} {...pointer} />)}
        {!hidden.has('pulmonary-trunk') &&
          g.trunk.map((geo, i) => <mesh key={i} geometry={geo} material={m.trunk} userData={{ part: 'pulmonary-trunk' }} {...pointer} />)}
        <Piece geometry={g.svc} material={m.svc} ids={['svc']} hidden={hidden} pointer={pointer} />
        <Piece geometry={g.ivc} material={m.ivc} ids={['ivc']} hidden={hidden} pointer={pointer} />
        {!hidden.has('pulmonary-veins') &&
          g.veins.map((geo, i) => <mesh key={i} geometry={geo} material={m.veins} userData={{ part: 'pulmonary-veins' }} {...pointer} />)}
      </group>
      {anim === 'flow' && <Particles paths={FLOW_PATHS} still={still} speed={speed} size={0.035} />}
      {/* Over the real model, the arteries' own highlighted bands carry the flow (these dots follow the drawn ones). */}
      {!skin && (anim === 'coronary-flow' || (anim === 'reperfusion' && !occluded)) && (
        <Particles paths={[curves.lad, curves.lcx, curves.rca, ...curves.diagonals, curves.marginal, curves.acuteMarginal]} still={still} speed={speed} size={0.018} white />
      )}
    </group>
  );
}

/** Blood's path through the heart: oxygen-poor (blue) and oxygen-rich (red). */
const FLOW_PATHS = [
  { colour: '#2f55b0', points: [[-0.78, 3.5, -0.05], [-0.72, 2.6, 0], [-0.7, 2.18, 0.02], [-0.68, 2.0, 0.2], [-0.62, 1.1, 0.55], [-0.3, 1.3, 0.8], [-0.1, 1.9, 0.75], [-0.02, 2.4, 0.62], [0.12, 2.78, 0.3], [0.95, 2.72, -0.02]] },
  { colour: '#2f55b0', points: [[-0.66, 0.9, -0.42], [-0.7, 1.9, -0.16], [-0.7, 2.18, 0.02]] },
  { colour: '#ffffff', points: [[1.2, 2.32, -0.5], [0.3, 2.18, -0.42], [0.24, 2.0, -0.18], [0.08, 0.7, 0], [-0.02, 1.4, 0.1], [-0.05, 1.85, 0.12], [-0.12, 2.5, 0.16], [-0.08, 2.95, 0.05], [0.2, 3.12, -0.12], [0.5, 2.95, -0.38], [0.58, 2.4, -0.6]] },
].map((p) => ({ colour: p.colour, curve: new THREE.CatmullRomCurve3(p.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal') }));

/** Dots moving along paths: blood flow (in the chambers and vessels) or coronary flow. */
function Particles({
  paths,
  still,
  speed,
  size,
  white = false,
}: {
  paths: (THREE.Curve<THREE.Vector3> | { colour: string; curve: THREE.Curve<THREE.Vector3> })[];
  still: boolean;
  speed: number;
  size: number;
  white?: boolean;
}) {
  const per = 18;
  const list = paths.map((p) => ('curve' in p ? p : { colour: '#ffffff', curve: p }));
  const ref = useRef<THREE.InstancedMesh>(null);
  const colours = useMemo(() => {
    const arr = new Float32Array(list.length * per * 3);
    list.forEach((p, i) => {
      const c = new THREE.Color(white ? '#ffffff' : p.colour);
      for (let k = 0; k < per; k++) c.toArray(arr, (i * per + k) * 3);
    });
    return arr;
  }, [list, white]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock, invalidate }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = still ? 0 : clock.getElapsedTime() * speed * 0.18;
    list.forEach((p, i) => {
      for (let k = 0; k < per; k++) {
        const u = (k / per + time) % 1;
        dummy.position.copy(p.curve.getPointAt(u));
        dummy.updateMatrix();
        mesh.setMatrixAt(i * per + k, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (!still) invalidate();
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length * per]} raycast={() => null}>
      <sphereGeometry args={[size, 10, 8]}>
        <instancedBufferAttribute attach="attributes-color" args={[colours, 3]} />
      </sphereGeometry>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------------------------
// One slice, face on, seen from the apex: front at the top, right ventricle on the left.

function SliceModel({
  groupRef,
  make,
  hidden,
  anim,
  t,
  stained,
  highlighted,
  pointer,
  own,
}: {
  groupRef: MutableRefObject<THREE.Group | null>;
  make: Make;
  hidden: Set<string>;
  anim: Anim | null;
  t: number;
  stained: boolean;
  highlighted: Set<string>;
  pointer: Pointer;
  own: Shared;
}) {
  const s = useMemo(() => buildSlice(), []);
  // The slice itself: real-looking tissue, stained by the same shader as the landing page's slices.
  const tissue = useMemo(() => ({ geometry: tissueSlab(SLICE_T, SLICE_T + 0.06, { rvScale: 1, rvWall: 0.07 }), material: tissueMaterial(undefined, own) }), [own]);
  useEffect(
    () => () => {
      tissue.geometry.dispose();
      tissue.material.dispose();
    },
    [tissue],
  );
  const m = useMemo(
    () => ({
      lv: make('s-lv', ['lv', 'myocardium'], COLOURS.stained, 'solid', { side: THREE.DoubleSide }),
      septum: make('s-septum', ['septum', 'myocardium'], COLOURS.stained, 'solid', { side: THREE.DoubleSide }),
      rv: make('s-rv', ['rv', 'myocardium'], COLOURS.stained, 'solid', { side: THREE.DoubleSide }),
      papillary: make('s-pap', ['lv', 'myocardium'], COLOURS.stained, 'solid', { side: THREE.DoubleSide }),
      rim: make('s-rim', ['myocardium'], COLOURS.stained, 'solid', { side: THREE.DoubleSide }),
      // The cavities are holes: they show only when highlighted or pointed at.
      lvCavity: make('s-lvc', ['lv-cavity'], COLOURS.highlight, 'overlay'),
      rvCavity: make('s-rvc', ['rv-cavity'], COLOURS.highlight, 'overlay'),
      dead: make('s-dead', ['infarct'], COLOURS.pale, 'solid', { side: THREE.DoubleSide, roughness: 0.8 }),
      front: make('s-front', ['lv-anterior-wall'], COLOURS.highlight, 'overlay'),
      endo: make('s-endo', ['endocardium'], COLOURS.highlight, 'overlay'),
      epi: make('s-epi', ['epicardium'], COLOURS.highlight, 'overlay'),
    }),
    [make],
  );
  // TTC colours living muscle; before it acts, the slice is a dull pink-grey.
  const stain = anim === 'ttc' ? ease(t) : 1;
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => invalidate(), [stain, invalidate]);
  useFrame(() => {
    const c = new THREE.Color(COLOURS.unstained).lerp(new THREE.Color(COLOURS.stained), stain);
    for (const mat of [m.lv, m.septum, m.rv, m.papillary, m.rim]) (mat as THREE.MeshStandardMaterial).color.copy(c);
  });
  const showInfarct =
    !hidden.has('infarct') &&
    (stained || highlighted.has('infarct') || anim === 'wavefront' || anim === 'ttc' || anim === 'reperfusion' || anim === 'occlusion');
  const reach = anim === 'wavefront' || anim === 'occlusion' ? ease(t) : anim === 'reperfusion' ? 0.45 * ease(t) : 1;
  const step = Math.round(reach * 50) / 50;
  const infarct = useMemo(() => infarctGeometry(step), [step]);
  useEffect(() => () => infarct.dispose(), [infarct]);
  const risk = anim === 'wavefront' || anim === 'occlusion' || anim === 'reperfusion';
  useEffect(() => {
    setStory(own, { uStain: stain, uFix: 1, uReach: showInfarct ? reach : 0, uBeatA: 0, uBeatV: 0, uIsch: 0, uFrost: 0 });
    invalidate();
  }, [own, stain, showInfarct, reach, invalidate]);

  return (
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]} scale={0.95}>
      <mesh geometry={tissue.geometry} material={tissue.material} position={[0, -SLICE_T * H, 0]} raycast={() => undefined} />
      <mesh geometry={s.rim} material={m.rim} position={[0, 0.06, 0]} userData={{ part: 'myocardium' }} />
      <Piece geometry={s.lvWall} material={m.lv} ids={['lv', 'myocardium']} hidden={hidden} pointer={pointer} />
      <Piece geometry={s.septum} material={m.septum} ids={['septum', 'myocardium']} hidden={hidden} pointer={pointer} />
      <Piece geometry={s.rvWall} material={m.rv} ids={['rv', 'myocardium']} hidden={hidden} pointer={pointer} />
      <Piece geometry={s.lvCavity} material={m.lvCavity} ids={['lv-cavity']} hidden={hidden} pointer={pointer} />
      <Piece geometry={s.rvCavity} material={m.rvCavity} ids={['rv-cavity']} hidden={hidden} pointer={pointer} />
      {s.papillary.map((geo, i) => (
        <mesh key={i} geometry={geo} material={m.papillary} position={[0, -0.006, 0]} userData={{ part: 'lv' }} {...pointer} />
      ))}
      <group position={[0, -0.012, 0]}>
        {showInfarct && <Piece geometry={infarct} material={m.dead} ids={['infarct']} hidden={hidden} pointer={pointer} />}
      </group>
      <group position={[0, -0.018, 0]}>
        <Piece geometry={s.frontWall} material={m.front} ids={['lv-anterior-wall']} hidden={hidden} />
        {risk && (
          <lineLoop geometry={s.riskOutline} raycast={() => null} onUpdate={(l) => l.computeLineDistances()}>
            <lineDashedMaterial color="#6a625d" dashSize={0.04} gapSize={0.03} />
          </lineLoop>
        )}
        <Piece geometry={s.endocardium} material={m.endo} ids={['endocardium']} hidden={hidden} />
        <Piece geometry={s.epicardium} material={m.epi} ids={['epicardium']} hidden={hidden} />
      </group>
    </group>
  );
}
