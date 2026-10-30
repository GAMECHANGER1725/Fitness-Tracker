// Which optional cards Today shows, the accent colour and text size, per device (localStorage `fitness-layout`, not synced).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TODAY_CARDS = [
  ['exercises', 'Today’s exercises (or rest-day ideas)'],
  ['fuel', 'Food from Fuel Log'],
  ['week', 'This week'],
] as const;
export type TodayCard = (typeof TODAY_CARDS)[number][0];

export const ACCENTS = [
  ['mint', 'Mint'],
  ['sky', 'Sky'],
  ['rose', 'Rose'],
  ['lime', 'Lime'],
] as const;
export type Accent = (typeof ACCENTS)[number][0];

interface Layout {
  hidden: TodayCard[];
  accent: Accent;
  /** Everything a little bigger (about 12%), for easier reading. */
  large: boolean;
  setLarge: (v: boolean) => void;
  toggle: (c: TodayCard) => void;
  setAccent: (a: Accent) => void;
}

export const useLayout = create<Layout>()(
  persist(
    (set) => ({
      hidden: [],
      accent: 'mint',
      large: false,
      setLarge: (large) => set({ large }),
      setAccent: (accent) => set({ accent }),
      toggle: (c) => set((s) => ({ hidden: s.hidden.includes(c) ? s.hidden.filter((x) => x !== c) : [...s.hidden, c] })),
    }),
    { name: 'fitness-layout', partialize: ({ hidden, accent, large }) => ({ hidden, accent, large }) },
  ),
);
