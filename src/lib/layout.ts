// Which optional cards Today shows and the accent colour, per device (localStorage `fitness-layout`, not synced).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TODAY_CARDS = [
  ['exercises', 'Today’s exercises'],
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
  toggle: (c: TodayCard) => void;
  setAccent: (a: Accent) => void;
}

export const useLayout = create<Layout>()(
  persist(
    (set) => ({
      hidden: [],
      accent: 'mint',
      setAccent: (accent) => set({ accent }),
      toggle: (c) => set((s) => ({ hidden: s.hidden.includes(c) ? s.hidden.filter((x) => x !== c) : [...s.hidden, c] })),
    }),
    { name: 'fitness-layout', partialize: ({ hidden, accent }) => ({ hidden, accent }) },
  ),
);
