// What lesson text can do from a link: open a glossary card, or point at a part of the heart.

import { createContext } from 'react';

export interface LearnLinks {
  /** Open the glossary card for a term. */
  openTerm: (id: string, from: HTMLElement) => void;
  /** Point at a part of the heart (null stops). Absent where no heart is shown. */
  pointAt?: (id: string | null) => void;
  termExists: (id: string) => boolean;
}

export const LinksContext = createContext<LearnLinks | null>(null);
