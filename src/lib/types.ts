// Shared types. Times are epoch ms; dates are local "yyyy-MM-dd" keys (dates.ts).

import type { Provider } from './ai';

export type Pattern = 'push' | 'pull' | 'legs' | 'hinge' | 'core' | 'grip';
/** bw = bodyweight, pack = backpack for load, grip = forearm trainer (the old home kit); the rest is the gym. */
export type Equip = 'bw' | 'pack' | 'grip' | 'db' | 'machine' | 'cable' | 'bench' | 'bar';
/** How an exercise is loaded: per dumbbell, a machine or cable stack, help from the assisted pull-up machine, or the old backpack. */
export type LoadKind = 'none' | 'db' | 'machine' | 'cable' | 'assist' | 'pack';
export type Muscle = 'chest' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'lats' | 'upperBack' | 'lowerBack' | 'abs' | 'obliques' | 'glutes' | 'quads' | 'hamstrings' | 'calves';

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
  /** Takes weight (see `load`). */
  loadable?: boolean;
  load: LoadKind;
  /** A cautious first weight in kg for a beginner (a guess, shown as one). */
  startKg?: number;
  /** Main and helper muscles, for the body map and weekly volume. */
  primary: Muscle[];
  secondary: Muscle[];
  /** From the old home plan: kept so history still reads, not offered in the gym plan. */
  home?: boolean;
  /** One-arm work logged per arm: the weaker arm goes first and the other matches its reps. */
  match?: boolean;
  /** Form demo id in demos.ts, if it has one. */
  demo?: string;
  /** Common mistakes, shown with the form cues. */
  mistakes?: string[];
  /** Progression ladder this exercise is on, and its step (1 = easiest). */
  ladder: string;
  step: number;
  cues: string[];
}

/** One exercise in a plan day: sets × [low, high] reps (or seconds) at a working weight (per dumbbell, the stack, or kg of help). */
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
  /** Date of the first gym session; block weeks count from its week (program.phaseOf). Null = no block. */
  start: string | null;
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
  /** One-arm work: `reps` is the first (weaker) arm, `repsR` the other. */
  repsR?: number;
  /** How hard it was, 6–10 (10 = nothing left). Home sessions used this. */
  rpe?: number;
  /** Reps in reserve, 0–4 (4 = four or more left). */
  rir?: number;
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
  /** Warm-up ticked off. */
  warm?: boolean;
}

/** A weigh-in, arm measurement or benchmark test, one entry per date. Every field is optional. */
export interface Measure {
  date: string;
  weightKg?: number;
  /** Upper arm, flexed, at the widest point, cm. */
  armL?: number;
  armR?: number;
  /** Full push-ups in one go (halves allowed for a partial rep). */
  pushups?: number;
  /** Longest plank, seconds. */
  plankS?: number;
  chinups?: number;
  pullups?: number;
  /** Last change, for syncing. */
  m: number;
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
  /** Heaviest the backpack can be packed, kg (home kit). */
  packMaxKg: number;
  hasGrip: boolean;
  goal: 'bulk' | 'fit';
  /** The smaller arm, which goes first in one-arm work. */
  weakArm: 'left' | 'right' | 'none';
}

export interface Settings {
  /** "HH:mm". */
  wakeTarget: string;
  sleepGoalH: number;
  /** Lights-out target, "HH:mm". The sleep coach can move it a little each week. */
  bedtime: string;
  workoutTime: string;
  /** Planned session length, minutes. */
  sessionMin: number;
  /** Smallest jump on machines and cables, kg. */
  machineStepKg: number;
  /** 3D views on this device: auto falls back to 2D when the phone struggles or asks for less motion. */
  view3d: 'auto' | 'on' | 'off';
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

/** The home plan as it was when the gym plan replaced it. */
export interface HomeArchive {
  program: Program;
  programLog: ProgramChange[];
  /** When it was archived. */
  at: number;
}

export interface AppData {
  v: 2;
  /** Onboarding finished. */
  onboarded: boolean;
  profile: Profile;
  settings: Settings;
  program: Program;
  programLog: ProgramChange[];
  sessions: Record<string, Session>;
  nights: Record<string, Night>;
  measures: Record<string, Measure>;
  home: HomeArchive | null;
  active: ActiveWorkout | null;
  seen: Seen;
  /** Deleted session ids, "night:<date>" and "measure:<date>" keys → epoch ms, so a sync doesn't bring them back. */
  tomb: Record<string, number>;
  /** Last change to profile, settings, program or its log (newest wins on sync). */
  mod: number;
}
