// Which optional cards Today shows, per device (localStorage `fitness-layout`, not synced).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TODAY_CARDS = [
  ['exercises', 'Today’s exercises'],
  ['fuel', 'Food from Fuel Log'],
  ['week', 'This week'],
] as const;
export type TodayCard = (typeof TODAY_CARDS)[number][0];

interface Layout {
  hidden: TodayCard[];
  toggle: (c: TodayCard) => void;
}

export const useLayout = create<Layout>()(
  persist(
    (set) => ({
      hidden: [],
      toggle: (c) => set((s) => ({ hidden: s.hidden.includes(c) ? s.hidden.filter((x) => x !== c) : [...s.hidden, c] })),
    }),
    { name: 'fitness-layout', partialize: ({ hidden }) => ({ hidden }) },
  ),
);
