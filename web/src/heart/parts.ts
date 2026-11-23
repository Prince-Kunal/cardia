// The parts of the heart lessons can point at, and the views that show them. Part ids are the mesh
// names the 3D model will use (PLAN.md §3f), so lessons written for the 2D diagram keep working with
// the 3D heart. Names are English, like the rest of the app (PLAN.md D10).

export type View = 'section' | 'anterior' | 'slice';

export const PART_NAMES: Record<string, string> = {
  ra: 'Right atrium',
  la: 'Left atrium',
  rv: 'Right ventricle',
  lv: 'Left ventricle',
  septum: 'Septum',
  tricuspid: 'Tricuspid valve',
  mitral: 'Mitral valve',
  'pulmonary-valve': 'Pulmonary valve',
  'aortic-valve': 'Aortic valve',
  aorta: 'Aorta',
  'pulmonary-trunk': 'Pulmonary artery',
  svc: 'Superior vena cava',
  ivc: 'Inferior vena cava',
  'pulmonary-veins': 'Pulmonary veins',
  lad: 'Left anterior descending artery (LAD)',
  lcx: 'Left circumflex artery (LCx)',
  rca: 'Right coronary artery (RCA)',
  'lad-territory': 'Area fed by the LAD',
  'lcx-territory': 'Area fed by the LCx',
  'rca-territory': 'Area fed by the RCA',
  'lv-anterior-wall': 'Front wall of the left ventricle',
  apex: 'Apex',
  base: 'Base',
  myocardium: 'Heart muscle (myocardium)',
  endocardium: 'Inner lining (endocardium)',
  epicardium: 'Outer layer (epicardium)',
  'lv-cavity': 'Left ventricle cavity',
  'rv-cavity': 'Right ventricle cavity',
  infarct: 'Infarct (dead tissue)',
};

/** Which parts each view can show. */
export const VIEW_PARTS: Record<View, string[]> = {
  section: [
    'ra',
    'la',
    'rv',
    'lv',
    'septum',
    'tricuspid',
    'mitral',
    'pulmonary-valve',
    'aortic-valve',
    'aorta',
    'pulmonary-trunk',
    'svc',
    'ivc',
    'pulmonary-veins',
    'apex',
    'myocardium',
  ],
  anterior: [
    'ra',
    'la',
    'rv',
    'lv',
    'aorta',
    'pulmonary-trunk',
    'svc',
    'lad',
    'lcx',
    'rca',
    'lad-territory',
    'lcx-territory',
    'rca-territory',
    'lv-anterior-wall',
    'apex',
    'base',
    'epicardium',
  ],
  slice: ['lv', 'rv', 'septum', 'lv-cavity', 'rv-cavity', 'endocardium', 'epicardium', 'myocardium', 'infarct', 'lv-anterior-wall'],
};

export const VIEW_NAMES: Record<View, string> = {
  section: 'Cut open from the front',
  anterior: 'Outside, from the front',
  slice: 'One slice, across the ventricles',
};

/** Lesson cameras (and later 3D camera presets) mapped onto the 2D views. "ttc" is a slice after TTC
 *  staining, with an infarct; "short-axis" is a healthy slice. */
export function viewOf(camera: string | null | undefined): View {
  switch (camera) {
    case 'anterior':
    case 'posterior':
    case 'outside':
    case 'coronaries':
      return 'anterior';
    case 'short-axis':
    case 'slice':
    case 'ttc':
      return 'slice';
    default:
      return 'section';
  }
}

/** Animations the diagram can play. Loops run until the step changes; the others play once. */
export const ANIMS = ['heartbeat', 'flow', 'coronary-flow', 'occlusion', 'reperfusion', 'slicing', 'ttc', 'wavefront'] as const;
export type Anim = (typeof ANIMS)[number];
export const LOOPING: Anim[] = ['heartbeat', 'flow', 'coronary-flow'];

export function partName(id: string): string {
  return PART_NAMES[id] ?? id;
}
