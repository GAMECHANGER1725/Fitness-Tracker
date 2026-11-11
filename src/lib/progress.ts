// The progression engine and the limits on any program change. Pure functions, all decided by code.
//
//  - Double progression. Reps first: each set aims for one more rep than last time, inside the range. When
//    every planned set reaches the top of the range with at least a rep in reserve, the weight goes up by the
//    smallest jump (stepKg) and the reps start again at the bottom of the range.
//  - Bodyweight ladders (push-up, first pull-up, plank): the range grows until the step is mastered, then the
//    plan moves to the next variation. Holds never go past 2 minutes.
//  - The assisted pull-up works backwards: progress is less help.
//  - The plan follows the weight actually lifted, so a first session's "find your weight" sticks.
//  - Two sessions in a row with every set under the range → one step back.
//  - No one-rep maxes anywhere: nothing here estimates, asks for or rewards a max single.
//  - guardProgram() keeps any proposed program (the AI coach or an edit) inside safe limits for a young
//    beginner: gym-library exercises only, 1–4 sets, loaded work at 5+ reps, weight jumps of one step at most,
//    at most 20 hard sets a week per movement pattern, and total weekly volume up by at most 20% at a time.

import type { AppData, Exercise, Pattern, PlanDay, Program, Session, SetLog, Slot } from './types';
import { DEFAULT_KIT, EX, easier, harder, loadText, stepKg, usable, type Kit } from './exercises';

export { DEFAULT_KIT, stepKg, type Kit };
import { HOLD_CAP_S, type Phase } from './program';

export const MAX_SETS = 4;
export const PATTERN_CAP = 20;
export const MAX_GROWTH = 1.2;
/** Loaded exercises never go under this many reps: heavy low-rep work isn't for a beginner. */
export const MIN_LOADED_REPS = 5;
const RANGE = { reps: [1, 30], secs: [10, HOLD_CAP_S] } as const;

export const kitOf = (d: Pick<AppData, 'profile' | 'settings'>): Kit => ({ machineStepKg: d.settings.machineStepKg, packMaxKg: d.profile.packMaxKg });

const round1 = (n: number) => Math.round(n * 2) / 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Reps that count for a set: one-arm work counts the lower arm. */
export const countReps = (s: SetLog) => (s.repsR == null ? s.reps : Math.min(s.reps, s.repsR));

/** Did the sets leave something in the tank? Reps in reserve of 1+ on average (or the old effort scale at 8.5 or under); unknown counts as fine. */
export function effortOk(sets: SetLog[]): boolean {
  const rir = sets.map((s) => s.rir).filter((r): r is number => r != null);
  if (rir.length) return avg(rir) >= 1;
  const rpe = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  return !rpe.length || avg(rpe) <= 8.5;
}

/** The weight most of the sets used (the later one on a tie). */
export function usedLoad(sets: SetLog[]): number {
  const n = new Map<number, number>();
  let best = sets[0]?.loadKg ?? 0;
  for (const s of sets) {
    n.set(s.loadKg, (n.get(s.loadKg) ?? 0) + 1);
    if ((n.get(s.loadKg) ?? 0) >= (n.get(best) ?? 0)) best = s.loadKg;
  }
  return best;
}

/** Sessions that include an exercise, newest first. */
export function historyOf(sessions: Record<string, Session>, exerciseId: string): SetLog[][] {
  return Object.values(sessions)
    .sort((a, b) => b.start - a.start)
    .map((s) => s.sets.filter((x) => x.exerciseId === exerciseId))
    .filter((x) => x.length);
}

/** The last session that included an exercise, with its date. */
export function lastTime(sessions: Record<string, Session>, exerciseId: string): { date: string; sets: SetLog[] } | null {
  for (const s of Object.values(sessions).sort((a, b) => b.start - a.start)) {
    const sets = s.sets.filter((x) => x.exerciseId === exerciseId);
    if (sets.length) return { date: s.date, sets };
  }
  return null;
}

// Bodyweight ladder rules: the top of the range a step must reach before the plan moves up, and the range a
// step starts with. Steps without an entry move up as soon as the current range is topped (the old home rule).
const MASTER: Record<string, number> = { 'incline-pushup': 15, 'knee-pushup': 15, 'chin-neg': 5, chinup: 6, 'pullup-neg': 5, plank: 90, 'plank-taps': 16, 'long-lever-plank': 45 };
const ENTRY: Record<string, [number, number]> = {
  'incline-pushup': [8, 15],
  'knee-pushup': [6, 12],
  pushup: [3, 8],
  'chin-neg': [2, 4],
  chinup: [1, 3],
  'pullup-neg': [2, 4],
  pullup: [1, 3],
  plank: [45, 75],
  'plank-taps': [8, 12],
  'long-lever-plank': [20, 40],
  'ball-rollout': [6, 10],
};
/** Where the range of a top-of-ladder move stops growing. */
const TOP: Record<string, number> = { pushup: 20, pullup: 10, 'ball-rollout': 15, 'assisted-pullup': 12 };

/** A slot moved to another exercise keeps its sets; the range comes from the ladder, or is reset when the unit changes. */
function moveTo(slot: Slot, to: Exercise, from: Exercise): Slot {
  const entry = ENTRY[to.id];
  const unitChange = to.unit !== from.unit;
  const range = entry ? { low: entry[0], high: entry[1] } : unitChange ? (to.unit === 'secs' ? { low: 15, high: 30 } : { low: 6, high: 10 }) : {};
  return { ...slot, exerciseId: to.id, loadKg: to.startKg ?? 0, ...range };
}

export interface Step {
  slot: Slot;
  /** What changed, e.g. "Chest press machine: 15 → 20 kg", or null. */
  line: string | null;
}

const unit = (ex: Exercise) => (ex.unit === 'secs' ? ' s' : '');

/**
 * The next prescription for one slot, from its recent sessions (newest first; [0] is the one just finished).
 * `sets` is how many sets were planned for that session (fewer in an intro week).
 */
export function progressSlot(slot0: Slot, recent: SetLog[][], kit: Kit = DEFAULT_KIT, sets = slot0.sets): Step {
  const ex = EX[slot0.exerciseId];
  const last = recent[0];
  if (!ex || !last?.length) return { slot: slot0, line: null };

  // The plan follows the weight actually lifted.
  let slot = slot0;
  let line: string | null = null;
  const used = ex.loadable ? usedLoad(last) : 0;
  if (ex.loadable && used !== slot.loadKg && (ex.load !== 'pack' || used <= kit.packMaxKg)) {
    slot = { ...slot, loadKg: used };
    line = `${ex.name}: now ${loadText(ex, used) || 'bodyweight'}`;
  }

  const work = last.filter((s) => !ex.loadable || s.loadKg === slot.loadKg).slice(0, sets);
  const allTop = work.length >= sets && work.every((s) => countReps(s) >= slot.high);

  if (allTop && effortOk(work)) {
    const step = stepKg(ex, slot.loadKg, kit);
    if (ex.load === 'assist') {
      if (slot.loadKg > 0) {
        const l = Math.max(0, round1(slot.loadKg - step));
        return { slot: { ...slot, loadKg: l }, line: `${ex.name}: ${slot.loadKg} → ${l} kg of help` };
      }
    } else if (ex.load === 'pack') {
      const l = round1(slot.loadKg + step);
      const up = harder(ex.id);
      if (ex.equip.includes('pack') && l <= kit.packMaxKg) return { slot: { ...slot, loadKg: l }, line: `${ex.name}: ${slot.loadKg} → ${l} kg` };
      if (up) return { slot: moveTo(slot, up, ex), line: `${ex.name} → ${up.name}` };
    } else if (ex.loadable) {
      const l = round1(slot.loadKg + step);
      return { slot: { ...slot, loadKg: l }, line: `${ex.name}: ${slot.loadKg ? `${slot.loadKg} → ${l} kg` : `add ${loadText(ex, l)}`}` };
    } else {
      const up = harder(ex.id);
      const master = MASTER[ex.id] ?? slot.high;
      if (up && slot.high >= master) return { slot: moveTo(slot, up, ex), line: `${ex.name} → ${up.name}` };
    }
    // Nothing heavier or harder: the range moves up, to a ceiling.
    const cap = Math.min(RANGE[ex.unit][1], TOP[ex.id] ?? MASTER[ex.id] ?? RANGE[ex.unit][1]);
    const by = ex.unit === 'secs' ? 15 : slot.high < 8 ? 1 : 2;
    if (slot.high + by <= cap || slot.high < cap) {
      const high = Math.min(cap, slot.high + by);
      const s = { ...slot, low: slot.low + (high - slot.high), high };
      return { slot: s, line: `${ex.name}: aim for ${s.low}–${s.high}${unit(ex)}` };
    }
    return { slot, line };
  }

  // Two sessions in a row with every set short of the range: make it easier.
  const short = (xs: SetLog[]) => xs.length > 0 && xs.every((s) => countReps(s) < slot.low);
  if (recent.length >= 2 && short(recent[0]) && short(recent[1])) {
    const step = stepKg(ex, Math.max(0, slot.loadKg - 0.5), kit);
    if (ex.load === 'assist') {
      const l = round1(slot.loadKg + step);
      return { slot: { ...slot, loadKg: l }, line: `${ex.name}: ${slot.loadKg} → ${l} kg of help for now` };
    }
    if (ex.loadable && slot.loadKg >= step) {
      const l = round1(slot.loadKg - step);
      return { slot: { ...slot, loadKg: l }, line: `${ex.name}: ${slot.loadKg} → ${l} kg for now` };
    }
    const down = easier(ex.id);
    if (down) return { slot: moveTo(slot, down, ex), line: `${ex.name} → ${down.name} for now` };
  }
  return { slot, line };
}

/**
 * Run progression for every exercise of the finished session's plan day.
 * `planned` is the day as it was set for that session (intro and easy days have fewer sets); `hold` skips
 * progression altogether (a deload week).
 */
export function applySession(program: Program, session: Session, sessions: Record<string, Session>, kit: Kit = DEFAULT_KIT, opts: { planned?: Slot[]; hold?: boolean } = {}): { program: Program; lines: string[] } {
  if (opts.hold) return { program, lines: [] };
  const all = { ...sessions, [session.id]: session };
  const lines: string[] = [];
  const days = program.days.map((d): PlanDay => {
    if (d.id !== session.dayId) return d;
    return {
      ...d,
      slots: d.slots.map((slot) => {
        if (!session.sets.some((s) => s.exerciseId === slot.exerciseId)) return slot;
        const sets = Math.min(slot.sets, opts.planned?.find((p) => p.exerciseId === slot.exerciseId)?.sets ?? slot.sets);
        const step = progressSlot(slot, historyOf(all, slot.exerciseId), kit, sets);
        if (step.line) lines.push(step.line);
        return step.slot;
      }),
    };
  });
  return { program: lines.length ? { ...program, days } : program, lines };
}

// ----- Today's target ------------------------------------------------------------------

export type TargetKind = 'first' | 'reps' | 'load' | 'hold' | 'back' | 'intro' | 'deload' | 'step';

export interface Target {
  kind: TargetKind;
  /** Suggested weight, kg (help for the assisted pull-up; 0 for bodyweight). */
  loadKg: number;
  /** Reps (or seconds) to aim for on each set. */
  aims: number[];
  low: number;
  high: number;
  /** Reps to keep in reserve. */
  rir: [number, number];
  /** One line on why. */
  why: string;
}

/**
 * Today's weight and reps for a slot (as set for today by program.slotsFor), from the sessions that came
 * before (newest first).
 */
export function targetFor(slot: Slot, recent: SetLog[][], phase: Pick<Phase, 'kind' | 'rir'>): Target {
  const ex = EX[slot.exerciseId];
  const base = { loadKg: ex?.loadable ? slot.loadKg : 0, low: slot.low, high: slot.high, rir: phase.rir };
  const flat = (n: number) => Array.from({ length: slot.sets }, () => n);
  const last = recent[0];
  const what = ex?.unit === 'secs' ? 'seconds' : 'reps';

  if (phase.kind === 'deload') return { ...base, kind: 'deload', aims: flat(slot.low), why: 'Lighter week: easy sets, stop well short. No records this week.' };
  if (!last?.length) {
    const first = ex?.loadable
      ? ex.load === 'assist'
        ? `First time: pick enough help to do ${slot.high} smooth reps. About ${slot.loadKg} kg is a guess.`
        : `First time: pick a weight you could lift about ${slot.high + 4} times${slot.loadKg ? `. About ${slot.loadKg} kg is a guess; lighter is fine` : ''}.`
      : `First time: stop with ${phase.rir[0]}+ good ${what === 'seconds' ? 'seconds' : 'reps'} left.`;
    return { ...base, kind: phase.kind === 'intro' ? 'intro' : 'first', aims: flat(slot.low), why: first };
  }

  const lastLoad = ex?.loadable ? usedLoad(last) : 0;
  const lastReps = last.map(countReps);
  const at = (i: number) => lastReps[Math.min(i, lastReps.length - 1)];
  if (ex?.loadable && slot.loadKg !== lastLoad) {
    const easierNow = ex.load === 'assist' ? slot.loadKg > lastLoad : slot.loadKg < lastLoad;
    if (easierNow) return { ...base, kind: 'back', aims: flat(slot.low), why: `A step back from ${loadText(ex, lastLoad)} to get the reps clean.` };
    return { ...base, kind: 'load', aims: flat(slot.low), why: `You topped the range at ${loadText(ex, lastLoad)}, so it goes up by the smallest jump. Reps start again at ${slot.low}.` };
  }
  if (!effortOk(last)) return { ...base, kind: 'hold', aims: Array.from({ length: slot.sets }, (_, i) => clamp(at(i), slot.low, slot.high)), why: 'Last time left nothing in the tank. Same numbers today, with a rep or two to spare.' };
  if (lastReps.every((r) => r >= slot.high) && lastReps.length >= slot.sets) return { ...base, kind: 'step', aims: flat(slot.high), why: `Top of the range again and it steps up next time.` };
  return {
    ...base,
    kind: phase.kind === 'intro' ? 'intro' : 'reps',
    aims: Array.from({ length: slot.sets }, (_, i) => clamp(at(i) + (ex?.unit === 'secs' ? 5 : 1), slot.low, slot.high)),
    why: `Same ${ex?.loadable ? 'weight' : 'move'} as last time. Try for ${ex?.unit === 'secs' ? '5 more seconds' : 'one more rep'} per set; the weight goes up once every set hits ${slot.high}.`,
  };
}

// ----- Records -----------------------------------------------------------------

export interface Best {
  reps: number;
  loadKg: number;
  date: string;
}

type RL = { reps: number; loadKg: number };
/** Heavier, then more reps. For the assisted pull-up, less help is better. */
function better(id: string, a: RL, b: RL | undefined): boolean {
  if (!b) return true;
  const assist = EX[id]?.load === 'assist';
  const heavier = assist ? a.loadKg < b.loadKg : a.loadKg > b.loadKg;
  return heavier || (a.loadKg === b.loadKg && a.reps > b.reps);
}

/** Best set per exercise (heaviest, then most reps). */
export function records(sessions: Record<string, Session>): Record<string, Best> {
  const out: Record<string, Best> = {};
  for (const s of Object.values(sessions).sort((a, b) => a.start - b.start))
    for (const x of s.sets) {
      const r = { reps: countReps(x), loadKg: x.loadKg };
      if (better(x.exerciseId, r, out[x.exerciseId])) out[x.exerciseId] = { ...r, date: s.date };
    }
  return out;
}

/** Sets in a session that beat everything before it. */
export function newRecords(session: Session, before: Record<string, Session>): SetLog[] {
  const prev = records(Object.fromEntries(Object.entries(before).filter(([id, s]) => id !== session.id && s.start < session.start)));
  const out: SetLog[] = [];
  for (const x of session.sets) {
    const r = { reps: countReps(x), loadKg: x.loadKg };
    const cur = out.findIndex((o) => o.exerciseId === x.exerciseId);
    if (prev[x.exerciseId] && better(x.exerciseId, r, prev[x.exerciseId]) && (cur < 0 || better(x.exerciseId, r, { reps: countReps(out[cur]), loadKg: out[cur].loadKg }))) {
      if (cur < 0) out.push(x);
      else out[cur] = x;
    }
  }
  return out;
}

// ----- Limits on program changes ---------------------------------------------------

/** Planned hard sets per week for each movement pattern. */
export function weeklySets(p: Program): Record<Pattern, number> {
  const out: Record<Pattern, number> = { push: 0, pull: 0, legs: 0, hinge: 0, core: 0, grip: 0 };
  for (const id of p.week) {
    const d = p.days.find((x) => x.id === id);
    for (const s of d?.slots ?? []) {
      const e = EX[s.exerciseId];
      if (e) out[e.pattern] += s.sets;
    }
  }
  return out;
}

const total = (w: Record<Pattern, number>) => Object.values(w).reduce((a, b) => a + b, 0);

/** One proposed slot made safe. `cur` is the plan it would change (weights can only move one step from it). */
export function cleanSlot(v: unknown, kit: Kit, cur?: Program): Slot | null {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const ex = EX[String(s.exerciseId ?? '')];
  if (!ex || !usable(ex)) return null;
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(+x) ? +x : d);
  const [lo0, hi] = RANGE[ex.unit];
  const lo = ex.unit === 'reps' && ex.loadable ? MIN_LOADED_REPS : lo0;
  let low = Math.round(clamp(num(s.low, ex.unit === 'secs' ? 20 : 8), lo, hi));
  let high = Math.round(clamp(num(s.high, low + 4), lo, hi));
  if (high < low) [low, high] = [high, low];
  // Weight: what the plan already uses for this exercise, moved by one step at most; a new exercise starts at its cautious first weight.
  const now = cur?.days.flatMap((d) => d.slots).find((x) => x.exerciseId === ex.id);
  const base = now ? now.loadKg : (ex.startKg ?? 0);
  const step = stepKg(ex, base, kit);
  const loadKg = !ex.loadable ? 0 : now ? round1(clamp(num(s.loadKg, base), Math.max(0, base - step), base + step)) : base;
  return { exerciseId: ex.id, sets: Math.round(clamp(num(s.sets, 3), 1, MAX_SETS)), low, high, restS: Math.round(clamp(num(s.restS, 90), 30, 180) / 15) * 15, loadKg };
}

/** Trim sets (largest first, never below 1) until `over` says it's fine. */
function trim(p: Program, over: (p: Program) => Pattern | 'total' | null): Program {
  let cur = p;
  for (let guard = 0; guard < 200; guard++) {
    const what = over(cur);
    if (!what) break;
    let best: [number, number] | null = null;
    let bestSets = 0;
    for (let di = 0; di < cur.days.length; di++)
      for (let si = 0; si < cur.days[di].slots.length; si++) {
        const s = cur.days[di].slots[si];
        const e = EX[s.exerciseId];
        if (s.sets > 1 && (what === 'total' || e?.pattern === what) && s.sets > bestSets) {
          best = [di, si];
          bestSets = s.sets;
        }
      }
    if (!best) break;
    const [di, si] = best;
    cur = { ...cur, days: cur.days.map((d, i) => (i !== di ? d : { ...d, slots: d.slots.map((s, j) => (j === si ? { ...s, sets: s.sets - 1 } : s)) })) };
  }
  return cur;
}

/** Make a proposed program safe. Days and the weekly schedule stay as they are; only their exercises change. */
export function guardProgram(cur: Program, proposed: unknown, kit: Kit = DEFAULT_KIT): Program {
  const raw = (proposed && typeof proposed === 'object' ? proposed : {}) as { days?: unknown };
  const given = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : [];
  const days = cur.days.map((d): PlanDay => {
    const p = given.find((g) => g && g.id === d.id);
    if (!p || !Array.isArray(p.slots)) return d;
    const seen = new Set<string>();
    const slots = (p.slots as unknown[])
      .map((s) => cleanSlot(s, kit, cur))
      .filter((s): s is Slot => !!s && !seen.has(s.exerciseId) && !!seen.add(s.exerciseId))
      .slice(0, 8);
    return slots.length >= 3 ? { ...d, slots } : d;
  });
  const before = weeklySets(cur);
  const limit = Math.max(Math.round(total(before) * MAX_GROWTH), total(before) + 2);
  let out: Program = { ...cur, days };
  out = trim(out, (p) => {
    const w = weeklySets(p);
    // A pattern already over the cap may stay where it was, but can't grow.
    const pat = (Object.keys(w) as Pattern[]).find((k) => w[k] > Math.max(PATTERN_CAP, before[k]));
    return pat ?? (total(w) > limit ? 'total' : null);
  });
  return out;
}

/** Human lines for what changed between two programs. */
export function diffPrograms(a: Program, b: Program): string[] {
  const lines: string[] = [];
  const name = (id: string) => EX[id]?.name ?? id;
  for (const db of b.days) {
    const da = a.days.find((d) => d.id === db.id);
    if (!da) continue;
    const aIds = da.slots.map((s) => s.exerciseId);
    const bIds = db.slots.map((s) => s.exerciseId);
    const gone = aIds.filter((id) => !bIds.includes(id));
    const added = bIds.filter((id) => !aIds.includes(id));
    gone.forEach((id, i) => lines.push(added[i] ? `${db.name}: ${name(id)} → ${name(added[i])}` : `${db.name}: drop ${name(id)}`));
    added.slice(gone.length).forEach((id) => lines.push(`${db.name}: add ${name(id)}`));
    for (const sb of db.slots) {
      const sa = da.slots.find((s) => s.exerciseId === sb.exerciseId);
      if (!sa) continue;
      const bits: string[] = [];
      if (sa.sets !== sb.sets) bits.push(`${sa.sets} → ${sb.sets} sets`);
      if (sa.low !== sb.low || sa.high !== sb.high) bits.push(`${sa.low}–${sa.high} → ${sb.low}–${sb.high}`);
      if (sa.loadKg !== sb.loadKg) bits.push(`${sa.loadKg} → ${sb.loadKg} kg`);
      if (bits.length) lines.push(`${name(sb.exerciseId)}: ${bits.join(', ')}`);
    }
  }
  const moved = a.week.some((x, i) => x !== b.week[i]);
  if (moved) lines.push(`Gym days: ${b.week.map((x, i) => (x ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] : null)).filter(Boolean).join(', ') || 'none'}`);
  if (a.deloadUntil !== b.deloadUntil && b.deloadUntil) lines.push(`Lighter week until ${b.deloadUntil}`);
  return lines;
}

/**
 * An extra lighter week is due after 5 weeks in a row with at least 3 sessions and no deload. With a block
 * running (program.start) the deload weeks are already scheduled, so this only matters for a plan without one.
 */
export function deloadDue(sessions: Record<string, Session>, program: Program, today: string, weekStart: (k: string) => string, addDays: (k: string, n: number) => string): boolean {
  if (program.start) return false;
  if (program.deloadUntil && program.deloadUntil >= addDays(today, -35)) return false;
  const counts = new Map<string, number>();
  for (const s of Object.values(sessions)) counts.set(weekStart(s.date), (counts.get(weekStart(s.date)) ?? 0) + 1);
  let wk = addDays(weekStart(today), -7);
  for (let i = 0; i < 5; i++, wk = addDays(wk, -7)) if ((counts.get(wk) ?? 0) < 3) return false;
  return true;
}
