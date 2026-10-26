// Progression and the limits on any program change. Pure functions, all decided by code:
//  - Double progression: when every planned set reaches the top of the range without grinding (RPE ≤ 8.5),
//    the next step is backpack weight (+2 kg) for backpack exercises, or the next harder variation for
//    bodyweight ones; when neither is possible the rep range moves up.
//  - Two sessions in a row with every set under the bottom of the range → step back.
//  - guardProgram() keeps any proposed program (from the AI coach or an edit) inside safe limits for a
//    15-year-old training at home: library exercises only, 1–5 sets, sane ranges, the backpack no heavier
//    than set in Profile, at most 20 hard sets a week per movement pattern, and total weekly volume up by
//    at most 20% at a time.

import type { Exercise, Pattern, PlanDay, Profile, Program, Session, SetLog, Slot } from './types';
import { EX, easier, harder, usable } from './exercises';

export const LOAD_STEP = 2;
export const MAX_SETS = 5;
export const PATTERN_CAP = 20;
export const MAX_GROWTH = 1.2;
const RANGE = { reps: [3, 30], secs: [10, 120] } as const;

const round1 = (n: number) => Math.round(n * 2) / 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Sessions that include an exercise, newest first. */
export function historyOf(sessions: Record<string, Session>, exerciseId: string): SetLog[][] {
  return Object.values(sessions)
    .sort((a, b) => b.start - a.start)
    .map((s) => s.sets.filter((x) => x.exerciseId === exerciseId))
    .filter((x) => x.length);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** A slot moved to another exercise keeps its sets; the range is reset when the unit changes. */
function moveTo(slot: Slot, to: Exercise, from: Exercise): Slot {
  const unitChange = to.unit !== from.unit;
  return { ...slot, exerciseId: to.id, loadKg: 0, ...(unitChange ? (to.unit === 'secs' ? { low: 15, high: 30 } : { low: 6, high: 10 }) : {}) };
}

export interface Step {
  slot: Slot;
  /** What changed, e.g. "Backpack row: 6 → 8 kg", or null. */
  line: string | null;
}

/** The next target for one slot, from its recent sessions (newest first; [0] is the one just finished). */
export function progressSlot(slot: Slot, recent: SetLog[][], profile: Pick<Profile, 'packMaxKg' | 'hasGrip'>): Step {
  const ex = EX[slot.exerciseId];
  const last = recent[0];
  if (!ex || !last?.length) return { slot, line: null };
  const work = last.slice(0, slot.sets);
  const rpes = work.map((s) => s.rpe).filter((r): r is number => r != null);
  const allTop = work.length >= slot.sets && work.every((s) => s.reps >= slot.high);
  const easyEnough = !rpes.length || avg(rpes) <= 8.5;

  if (allTop && easyEnough) {
    const nextLoad = round1(slot.loadKg + LOAD_STEP);
    const up = harder(ex.id);
    const canUp = up && usable(up, profile.hasGrip);
    const usesPack = ex.equip.includes('pack');
    if (usesPack && nextLoad <= profile.packMaxKg) return { slot: { ...slot, loadKg: nextLoad }, line: `${ex.name}: ${slot.loadKg} → ${nextLoad} kg` };
    if (canUp) return { slot: moveTo(slot, up, ex), line: `${ex.name} → ${up.name}` };
    if (ex.loadable && nextLoad <= profile.packMaxKg) return { slot: { ...slot, loadKg: nextLoad }, line: `${ex.name}: add the backpack, ${nextLoad} kg` };
    const [, cap] = RANGE[ex.unit];
    if (slot.high + 2 <= cap) {
      const s = { ...slot, low: slot.low + 2, high: slot.high + 2 };
      return { slot: s, line: `${ex.name}: aim for ${s.low}–${s.high}${ex.unit === 'secs' ? ' s' : ''}` };
    }
    return { slot, line: null };
  }

  // Two sessions in a row with every set short of the range: make it easier.
  const short = (sets: SetLog[]) => sets.length > 0 && sets.every((s) => s.reps < slot.low);
  if (recent.length >= 2 && short(recent[0]) && short(recent[1])) {
    if (slot.loadKg >= LOAD_STEP) {
      const l = round1(slot.loadKg - LOAD_STEP);
      return { slot: { ...slot, loadKg: l }, line: `${ex.name}: ${slot.loadKg} → ${l} kg for now` };
    }
    const down = easier(ex.id);
    if (down) return { slot: moveTo(slot, down, ex), line: `${ex.name} → ${down.name} for now` };
  }
  return { slot, line: null };
}

/** Run progression for every exercise of the finished session's plan day. */
export function applySession(program: Program, session: Session, sessions: Record<string, Session>, profile: Profile): { program: Program; lines: string[] } {
  const all = { ...sessions, [session.id]: session };
  const lines: string[] = [];
  const days = program.days.map((d): PlanDay => {
    if (d.id !== session.dayId) return d;
    return {
      ...d,
      slots: d.slots.map((slot) => {
        if (!session.sets.some((s) => s.exerciseId === slot.exerciseId)) return slot;
        const step = progressSlot(slot, historyOf(all, slot.exerciseId), profile);
        if (step.line) lines.push(step.line);
        return step.slot;
      }),
    };
  });
  return { program: lines.length ? { ...program, days } : program, lines };
}

// ----- Records -----------------------------------------------------------------

export interface Best {
  reps: number;
  loadKg: number;
  date: string;
}

const better = (a: { reps: number; loadKg: number }, b: { reps: number; loadKg: number } | undefined) => !b || a.loadKg > b.loadKg || (a.loadKg === b.loadKg && a.reps > b.reps);

/** Best set per exercise (heaviest, then most reps). */
export function records(sessions: Record<string, Session>): Record<string, Best> {
  const out: Record<string, Best> = {};
  for (const s of Object.values(sessions).sort((a, b) => a.start - b.start))
    for (const x of s.sets) if (better(x, out[x.exerciseId])) out[x.exerciseId] = { reps: x.reps, loadKg: x.loadKg, date: s.date };
  return out;
}

/** Sets in a session that beat everything before it. */
export function newRecords(session: Session, before: Record<string, Session>): SetLog[] {
  const prev = records(Object.fromEntries(Object.entries(before).filter(([id, s]) => id !== session.id && s.start < session.start)));
  const out: SetLog[] = [];
  for (const x of session.sets) {
    if (prev[x.exerciseId] && better(x, prev[x.exerciseId]) && !out.some((o) => o.exerciseId === x.exerciseId)) out.push(x);
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

function cleanSlot(v: unknown, profile: Pick<Profile, 'packMaxKg' | 'hasGrip'>): Slot | null {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const ex = EX[String(s.exerciseId ?? '')];
  if (!ex || !usable(ex, profile.hasGrip)) return null;
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(+x) ? +x : d);
  const [lo, hi] = RANGE[ex.unit];
  let low = Math.round(clamp(num(s.low, ex.unit === 'secs' ? 20 : 8), lo, hi));
  let high = Math.round(clamp(num(s.high, low + 4), lo, hi));
  if (high < low) [low, high] = [high, low];
  return {
    exerciseId: ex.id,
    sets: Math.round(clamp(num(s.sets, 3), 1, MAX_SETS)),
    low,
    high,
    restS: Math.round(clamp(num(s.restS, 60), 30, 180) / 15) * 15,
    loadKg: ex.loadable ? round1(clamp(num(s.loadKg, 0), 0, profile.packMaxKg)) : 0,
  };
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
export function guardProgram(cur: Program, proposed: unknown, profile: Pick<Profile, 'packMaxKg' | 'hasGrip'>): Program {
  const raw = (proposed && typeof proposed === 'object' ? proposed : {}) as { days?: unknown };
  const given = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : [];
  const days = cur.days.map((d): PlanDay => {
    const p = given.find((g) => g && g.id === d.id);
    if (!p || !Array.isArray(p.slots)) return d;
    const seen = new Set<string>();
    const slots = (p.slots as unknown[])
      .map((s) => cleanSlot(s, profile))
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
  if (a.deloadUntil !== b.deloadUntil && b.deloadUntil) lines.push(`Lighter week until ${b.deloadUntil}`);
  return lines;
}

/** A lighter week is due after 5 weeks in a row with at least 3 sessions and no deload. */
export function deloadDue(sessions: Record<string, Session>, program: Program, today: string, weekStart: (k: string) => string, addDays: (k: string, n: number) => string): boolean {
  if (program.deloadUntil && program.deloadUntil >= addDays(today, -35)) return false;
  const counts = new Map<string, number>();
  for (const s of Object.values(sessions)) counts.set(weekStart(s.date), (counts.get(weekStart(s.date)) ?? 0) + 1);
  let wk = addDays(weekStart(today), -7);
  for (let i = 0; i < 5; i++, wk = addDays(wk, -7)) if ((counts.get(wk) ?? 0) < 3) return false;
  return true;
}
