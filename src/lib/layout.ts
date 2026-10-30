// Which optional cards Today shows, the accent colour, text size and quick night notes, per device (localStorage `fitness-layout`, not synced).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NOTE_TAGS } from './sleep';

export const TODAY_CARDS = [
  ['exercises', 'Today’s exercises (or rest-day ideas)'],
  ['fuel', 'Food from Fuel Log'],
  ['week', 'This week'],
  ['recap', 'Last week’s recap (Monday to Wednesday)'],
] as const;
export type TodayCard = (typeof TODAY_CARDS)[number][0];

export const ACCENTS = [
  ['mint', 'Mint'],
  ['sky', 'Sky'],
  ['rose', 'Rose'],
  ['lime', 'Lime'],
] as const;
export type Accent = (typeof ACCENTS)[number][0];

export const START_PAGES = [
  ['today', 'Today'],
  ['train', 'Train'],
  ['sleep', 'Sleep'],
] as const;
export type StartPage = (typeof START_PAGES)[number][0];

/** The hash to open on: the chosen start page when the app opens with no page in the URL (as from the home-screen icon). */
export function startHash(hash: string, start: string): string | null {
  if (hash && hash !== '#' && hash !== '#/') return null;
  return START_PAGES.some(([id]) => id === start) && start !== 'today' ? `#/${start}` : null;
}

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
  /** Chips in the night sheet's note (and what the sleep insight looks for). */
  noteTags: string[];
  setNoteTags: (t: string[]) => void;
  start: StartPage;
  setStart: (s: StartPage) => void;
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
      noteTags: NOTE_TAGS,
      setNoteTags: (noteTags) => set({ noteTags }),
      start: 'today',
      setStart: (start) => set({ start }),
      toggle: (c) => set((s) => ({ hidden: s.hidden.includes(c) ? s.hidden.filter((x) => x !== c) : [...s.hidden, c] })),
    }),
    { name: 'fitness-layout', partialize: ({ hidden, accent, large, backupAt, backupSnooze, noteTags, start }) => ({ hidden, accent, large, backupAt, backupSnooze, noteTags, start }) },
  ),
);

const DAY = 86_400_000;

/** Nudge to save a backup file: sync is off, there's something worth keeping, and none in 30 days (or ever), unless snoozed. */
export function backupDue(now: number, o: { synced: boolean; sessions: number; nights: number; backupAt: number | null; snooze: number | null }): boolean {
  if (o.synced || o.sessions + o.nights < 5) return false;
  if (o.snooze && now < o.snooze) return false;
  return o.backupAt == null || now - o.backupAt > 30 * DAY;
}
