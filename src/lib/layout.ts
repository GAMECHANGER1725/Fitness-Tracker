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
  /** Last time a backup file was saved on this device, and until when the reminder is snoozed (epoch ms). */
  backupAt: number | null;
  backupSnooze: number | null;
  set: (p: Partial<Pick<Layout, 'backupAt' | 'backupSnooze'>>) => void;
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
      backupAt: null,
      backupSnooze: null,
      set: (p) => set(p),
      setAccent: (accent) => set({ accent }),
      toggle: (c) => set((s) => ({ hidden: s.hidden.includes(c) ? s.hidden.filter((x) => x !== c) : [...s.hidden, c] })),
    }),
    { name: 'fitness-layout', partialize: ({ hidden, accent, large, backupAt, backupSnooze }) => ({ hidden, accent, large, backupAt, backupSnooze }) },
  ),
);

const DAY = 86_400_000;

/** Nudge to save a backup file: sync is off, there's something worth keeping, and none in 30 days (or ever), unless snoozed. */
export function backupDue(now: number, o: { synced: boolean; sessions: number; nights: number; backupAt: number | null; snooze: number | null }): boolean {
  if (o.synced || o.sessions + o.nights < 5) return false;
  if (o.snooze && now < o.snooze) return false;
  return o.backupAt == null || now - o.backupAt > 30 * DAY;
}
