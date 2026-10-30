// Shared types. Times are epoch ms; dates are local "yyyy-MM-dd" keys (dates.ts).

import type { Provider } from './ai';

export type Pattern = 'push' | 'pull' | 'legs' | 'hinge' | 'core' | 'grip';
/** bw = bodyweight, pack = backpack for load, grip = forearm trainer. */
export type Equip = 'bw' | 'pack' | 'grip';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  muscles: string;
  /** Equipment needed. */
  equip: Equip[];
  /** Counted in reps or held for seconds. */
  unit: 'reps' | 'secs';
  /** Done one side at a time; the target is per side. */
  perSide?: boolean;
  /** Takes a backpack for extra load. */
  loadable?: boolean;
  /** Progression ladder this exercise is on, and its step (1 = easiest). */
  ladder: string;
  step: number;
  cues: string[];
}

/** One exercise in a plan day: sets × [low, high] reps (or seconds), with backpack load. */
export interface Slot {
  exerciseId: string;
  sets: number;
  low: number;
  high: number;
  restS: number;
  loadKg: number;
}

export interface PlanDay {
  id: string;
  name: string;
  slots: Slot[];
}

export interface Program {
  days: PlanDay[];
  /** Plan day id for each weekday, Monday = 0 … Sunday = 6; null = rest. */
  week: (string | null)[];
  /** Lighter week: planned sets are cut to about 60% until (and including) this date. */
  deloadUntil: string | null;
}

export interface ProgramChange {
  at: number;
  by: 'auto' | 'coach' | 'me';
  why: string;
  /** Lines like "Push-up → Backpack push-up". */
  lines: string[];
  before: Program;
}

export interface SetLog {
  id: string;
  exerciseId: string;
  /** Reps, or seconds for a hold. */
  reps: number;
  loadKg: number;
  /** How hard it was, 6–10 (10 = nothing left). */
  rpe?: number;
  at: number;
}

export interface Session {
  id: string;
  date: string;
  dayId: string;
  name: string;
  start: number;
  end: number;
  sets: SetLog[];
  /** How the session felt, 1–5. */
  feel?: number;
  note?: string;
  /** Last edit, for syncing. */
  upd: number;
}

/** A workout in progress on this device (not synced until it's finished). */
export interface ActiveWorkout {
  dayId: string;
  name: string;
  date: string;
  start: number;
  /** The slots as planned for today (deload and readiness already applied). */
  slots: Slot[];
  sets: SetLog[];
  idx: number;
  restEnd: number | null;
}

/** One night, keyed by the date you woke up. */
export interface Night {
  date: string;
  bed: number | null;
  wake: number | null;
  /** 1–5. */
  quality?: number;
  source: 'tap' | 'manual' | 'samsung';
  /** Minutes in each stage, from Samsung Health. */
  deep?: number;
  rem?: number;
  light?: number;
  awake?: number;
  score?: number;
  /** Wind-down steps ticked that evening (labels from Profile.windDown). */
  done?: string[];
  /** Your own note on the night ("woke at 2 am"). */
  note?: string;
  /** Last change, for syncing. */
  m: number;
}

export interface Profile {
  name: string;
  age: number;
  sex: 'male' | 'female';
  heightCm: number;
  /** Used when Fuel Log has no weigh-in. */
  weightKg: number;
  /** Heaviest the backpack can be packed, kg. */
  packMaxKg: number;
  hasGrip: boolean;
  /** Your own reminder per exercise id ("blue strap", "feet on the second step"), shown in the player. */
  exNotes: Record<string, string>;
  /** Your evening wind-down steps, ticked on Today before Going to sleep. */
  windDown: string[];
}

export interface Settings {
  /** "HH:mm". */
  wakeTarget: string;
  sleepGoalH: number;
  /** Lights-out target, "HH:mm". The sleep coach can move it a little each week. */
  bedtime: string;
  workoutTime: string;
  theme: 'auto' | 'dark' | 'light';
  /** Own AI keys; empty = use Fuel Log's. */
  aiKey: string;
  aiModel: string;
  geminiKey: string;
  geminiModel: string;
  aiFirst: Provider;
}

export interface Seen {
  badges: string[];
}

export interface AppData {
  v: 1;
  profile: Profile;
  settings: Settings;
  program: Program;
  programLog: ProgramChange[];
  sessions: Record<string, Session>;
  nights: Record<string, Night>;
  active: ActiveWorkout | null;
  seen: Seen;
  /** Deleted session ids and "night:<date>" keys → epoch ms, so a sync doesn't bring them back. */
  tomb: Record<string, number>;
  /** Last change to profile, settings, program or its log (newest wins on sync). */
  mod: number;
}
