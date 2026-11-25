// Who made the real heart models (CC BY 4.0: they must be credited wherever they are shown). Kept
// apart from realHeart.ts so a page can credit them without loading three.js.

export type RealHeartKind = 'realistic' | 'interior';

export const CREDITS: Record<RealHeartKind, { title: string; author: string; url: string }> = {
  realistic: {
    title: 'Realistic Human Heart',
    author: 'neshallads',
    url: 'https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089',
  },
  interior: {
    title: 'Human Heart Internal Structure 3D Model',
    author: 'Haiqa Arif',
    url: 'https://sketchfab.com/3d-models/human-heart-internal-structure-3d-model-21d346f72230432e8ed5fe448b03cca5',
  },
};
