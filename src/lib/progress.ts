// Progression and the limits on any program change. Pure functions, all decided by code:
//  - Double progression: when every planned set reaches the top of the range without grinding (RPE ≤ 8.5),
//    the next step is backpack weight (+2 kg) for backpack exercises, or the next harder variation for
//    bodyweight ones; when neither is possible the rep range moves up.
//  - Two sessions in a row with every set under the bottom of the range → step back.
//  - guardProgram() keeps any proposed program (from the AI coach or an edit) inside safe limits for a
//    15-year-old training at home: library exercises only, 1–5 sets, sane ranges, the backpack no heavier
//    than set in Profile, at most 20 hard sets a week per movement pattern, and total weekly volume up by
//    at most 20% at a time.

import { daysBetween } from './dates';
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

/** Moves a session to another day, keeping its clock times (and set order) so sorting by start still works. */
export function moveSession(s: Session, date: string): Session {
  const n = daysBetween(s.date, date);
  if (!n) return s;
  // Calendar days, not 24 h steps, so a move across a daylight-saving change keeps the clock time.
  const shift = (ms: number) => {
    const d = new Date(ms);
    d.setDate(d.getDate() + n);
    return d.getTime();
  };
  return { ...s, date, start: shift(s.start), end: shift(s.end), sets: s.sets.map((x) => ({ ...x, at: shift(x.at) })) };
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

export interface TrendPoint {
  date: string;
  /** Best set that session (heaviest, then most reps). */
  top: { reps: number; loadKg: number };
  /** Reps (or seconds) across all its sets. */
  total: number;
}

/** The last `n` sessions of one exercise, oldest first, for a small chart. */
export function trendOf(sessions: Record<string, Session>, exerciseId: string, n = 8): TrendPoint[] {
  return Object.values(sessions)
    .sort((a, b) => a.start - b.start)
    .flatMap((s) => {
      const xs = s.sets.filter((x) => x.exerciseId === exerciseId);
      if (!xs.length) return [];
      const top = xs.reduce<SetLog>((b, x) => (better(x, b) ? x : b), xs[0]);
      return [{ date: s.date, top: { reps: top.reps, loadKg: top.loadKg }, total: xs.reduce((t, x) => t + x.reps, 0) }];
    })
    .slice(-n);
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
    if (da.name !== db.name) lines.push(`${da.name} renamed to ${db.name}`);
    const aIds = da.slots.map((s) => s.exerciseId);
    const bIds = db.slots.map((s) => s.exerciseId);
    const gone = aIds.filter((id) => !bIds.includes(id));
    const added = bIds.filter((id) => !aIds.includes(id));
    gone.forEach((id, i) => lines.push(added[i] ? `${db.name}: ${name(id)} → ${name(added[i])}` : `${db.name}: drop ${name(id)}`));
    added.slice(gone.length).forEach((id) => lines.push(`${db.name}: add ${name(id)}`));
    if (!gone.length && !added.length && aIds.join() !== bIds.join()) lines.push(`${db.name}: new order, ${bIds.map(name).join(', ')}`);
    for (const sb of db.slots) {
      const sa = da.slots.find((s) => s.exerciseId === sb.exerciseId);
      if (!sa) continue;
      const bits: string[] = [];
      if (sa.sets !== sb.sets) bits.push(`${sa.sets} → ${sb.sets} sets`);
      if (sa.low !== sb.low || sa.high !== sb.high) bits.push(`${sa.low}–${sa.high} → ${sb.low}–${sb.high}`);
      if (sa.loadKg !== sb.loadKg) bits.push(`${sa.loadKg} → ${sb.loadKg} kg`);
      if (sa.restS !== sb.restS) bits.push(`rest ${sa.restS} → ${sb.restS} s`);
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

/** A plain-text summary of a workout for sharing: one line per exercise with its sets. */
export function sessionText(s: Session, when: string): string {
  const by = new Map<string, SetLog[]>();
  for (const x of s.sets) by.set(x.exerciseId, [...(by.get(x.exerciseId) ?? []), x]);
  const mins = Math.max(1, Math.round((s.end - s.start) / 60_000));
  const lines = [...by.entries()].map(([id, xs]) => {
    const e = EX[id];
    const kg = [...new Set(xs.map((x) => x.loadKg))].filter(Boolean);
    return `${e?.name ?? id}: ${xs.map((x) => x.reps).join(', ')}${e?.unit === 'secs' ? ' s' : ''}${kg.length ? ` @ ${kg.join('/')} kg` : ''}`;
  });
  return [`${s.name} · ${when} · ${mins} min · ${s.sets.length} set${s.sets.length === 1 ? '' : 's'}`, ...lines, ...(s.note ? [`Note: ${s.note}`] : [])].join('\n');
}
