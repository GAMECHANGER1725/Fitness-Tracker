// The progression engine: today's target, double progression, ladders, step-backs and the safety limits.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINES, DEFAULT_PROGRAM, HOLD_CAP_S, buildProgram, phaseOf, plankSlot, pullupSlot, pushupSlot, slotsFor, weekFor } from '../src/lib/program';
import { EX, EXERCISES, easier, harder, usable } from '../src/lib/exercises';
import { DEFAULT_KIT, MIN_LOADED_REPS, applySession, countReps, diffPrograms, effortOk, guardProgram, newRecords, progressSlot, records, stepKg, targetFor, weeklySets } from '../src/lib/progress';
import { planVolume } from '../src/lib/muscles';
import { atOn } from '../src/lib/dates';
import type { Session, SetLog, Slot } from '../src/lib/types';

const kit = DEFAULT_KIT;
const sets = (reps: number[], loadKg = 0, o: Partial<SetLog> = {}): SetLog[] => reps.map((r, i) => ({ id: `s${i}`, exerciseId: 'x', reps: r, loadKg, at: i, ...o }));
const slot = (exerciseId: string, p: Partial<Slot> = {}): Slot => ({ exerciseId, sets: 3, low: 8, high: 12, restS: 60, loadKg: 0, ...p });
let n = 0;
const sess = (date: string, dayId: string, list: [string, number, number?][], extra: Partial<Session> = {}): Session => {
  const start = atOn(date, '06:30') + n++;
  return { id: `ses${n}`, date, dayId, name: dayId, start, end: start + 3_000_000, sets: list.map(([exerciseId, reps, loadKg = 0], i) => ({ id: `x${n}-${i}`, exerciseId, reps, loadKg, rir: 2, at: start + i })), upd: start, ...extra };
};
const build: { kind: 'build'; rir: [number, number] } = { kind: 'build', rir: [2, 3] };

describe('exercise library', () => {
  it('has unique ids, muscles for everything, and every plan exercise exists', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) expect(e.primary.length, e.id).toBeGreaterThan(0);
    for (const days of [[0, 1, 3, 4], [0, 2, 4], [1, 5]]) for (const d of buildProgram(DEFAULT_BASELINES, days).days) for (const s of d.slots) expect(EX[s.exerciseId] && usable(EX[s.exerciseId]), s.exerciseId).toBe(true);
  });
  it('walks the push-up ladder: incline → knee → full', () => {
    expect(harder('incline-pushup')?.id).toBe('knee-pushup');
    expect(harder('knee-pushup')?.id).toBe('pushup');
    expect(harder('pushup')).toBeNull();
    expect(easier('pushup')?.id).toBe('knee-pushup');
  });
  it('walks the pull-up ladder and the plank ladder', () => {
    expect(['chin-neg', 'chinup', 'pullup-neg'].map((id) => harder(id)?.id)).toEqual(['chinup', 'pullup-neg', 'pullup']);
    expect(['plank', 'plank-taps', 'long-lever-plank'].map((id) => harder(id)?.id)).toEqual(['plank-taps', 'long-lever-plank', 'ball-rollout']);
  });
  it('keeps the old home moves for history but out of the gym plan', () => {
    expect(EX['pack-row'].home).toBe(true);
    expect(usable(EX['pack-row'])).toBe(false);
    expect(harder('pack-squat')).toBeNull();
  });
  it('has no barbell lifts', () => {
    for (const e of EXERCISES) expect(e.equip, e.id).not.toContain('bar');
  });
});

describe('the plan built from the baselines', () => {
  it('starts 3.5 push-ups on incline, 0 chin-ups on negatives and a 1:30 plank under the cap', () => {
    expect(pushupSlot(DEFAULT_BASELINES).exerciseId).toBe('incline-pushup');
    expect(pullupSlot(DEFAULT_BASELINES)).toMatchObject({ exerciseId: 'chin-neg', low: 2, high: 4 });
    const p = plankSlot(DEFAULT_BASELINES);
    expect(p).toMatchObject({ exerciseId: 'plank', low: 45, high: 75 });
    expect(p.high).toBeLessThanOrEqual(HOLD_CAP_S);
  });
  it('uses chin-ups at about half the best once there are 3', () => {
    expect(pullupSlot({ ...DEFAULT_BASELINES, chinups: 2 }).exerciseId).toBe('chin-neg');
    expect(pullupSlot({ ...DEFAULT_BASELINES, chinups: 6 })).toMatchObject({ exerciseId: 'chinup', low: 3, high: 5 });
    expect(pushupSlot({ ...DEFAULT_BASELINES, pushups: 7 }).exerciseId).toBe('knee-pushup');
    expect(plankSlot({ ...DEFAULT_BASELINES, plankS: 150 }).exerciseId).toBe('plank-taps');
  });
  it('is upper/lower on 4 days and full body on 2–3, never more than 4', () => {
    expect(weekFor([0, 1, 3, 4])).toEqual(['upper-a', 'lower-a', null, 'upper-b', 'lower-b', null, null]);
    expect(weekFor([0, 2, 4])).toEqual(['full-a', null, 'full-b', null, 'full-a', null, null]);
    expect(weekFor([0, 1, 2, 3, 4, 5]).filter(Boolean)).toHaveLength(4);
    // The first session, Thu 12 Nov 2026, is Upper B.
    expect(buildProgram(DEFAULT_BASELINES, [0, 1, 3, 4], '2026-11-12').week[3]).toBe('upper-b');
  });
  it('is balanced: every area trained, arms extra, nothing over 20 sets a week', () => {
    const w = weeklySets(DEFAULT_PROGRAM);
    for (const k of ['push', 'pull', 'legs', 'hinge', 'core'] as const) expect(w[k], k).toBeGreaterThanOrEqual(8);
    for (const v of Object.values(w)) expect(v).toBeLessThanOrEqual(20);
    const v = planVolume(DEFAULT_PROGRAM);
    for (const m of ['chest', 'shoulders', 'lats', 'upperBack', 'quads', 'hamstrings', 'glutes', 'abs', 'biceps', 'triceps'] as const) expect(v[m], m).toBeGreaterThanOrEqual(4);
    expect(v.biceps).toBeGreaterThan(v.triceps);
    expect(v.quads + v.hamstrings + v.glutes).toBeGreaterThan(v.biceps + v.triceps);
  });
  it('keeps loaded work at 8–15 reps and does one-arm work for the arm gap', () => {
    for (const d of DEFAULT_PROGRAM.days)
      for (const s of d.slots) {
        const e = EX[s.exerciseId];
        if (e.loadable && e.unit === 'reps' && e.load !== 'assist') {
          expect(s.low, e.id).toBeGreaterThanOrEqual(8);
          expect(s.high, e.id).toBeLessThanOrEqual(15);
        }
        expect(s.sets).toBeLessThanOrEqual(3);
      }
    const match = DEFAULT_PROGRAM.days.flatMap((d) => d.slots).filter((s) => EX[s.exerciseId].match).map((s) => s.exerciseId);
    expect(match).toEqual(expect.arrayContaining(['db-curl', 'cable-curl', 'hammer-curl', 'db-row']));
  });
});

describe('block weeks', () => {
  const p = buildProgram(DEFAULT_BASELINES, [0, 1, 3, 4], '2026-11-12');
  it('runs an intro week, 4 build weeks, then a lighter week, and repeats', () => {
    expect(phaseOf(p, '2026-11-12').kind).toBe('intro');
    expect(phaseOf(p, '2026-11-16')).toMatchObject({ kind: 'build', week: 1, rir: [3, 3] });
    expect(phaseOf(p, '2026-12-07')).toMatchObject({ kind: 'build', week: 4, rir: [1, 2] });
    expect(phaseOf(p, '2026-12-14').kind).toBe('deload');
    expect(phaseOf(p, '2026-12-20').kind).toBe('deload');
    expect(phaseOf(p, '2026-12-21')).toMatchObject({ kind: 'build', week: 1, block: 2 });
    expect(phaseOf(p, '2027-01-18').kind).toBe('deload');
  });
  it('never asks for less than 1 rep in reserve', () => {
    for (let i = 0; i < 80; i++) expect(phaseOf(p, `2026-${i < 19 ? '11' : i < 50 ? '12' : '11'}-${String((i % 28) + 1).padStart(2, '0')}`).rir[0]).toBeGreaterThanOrEqual(1);
  });
  it('gives 2 sets in the intro week and lighter, fewer sets in the deload', () => {
    const day = p.days.find((d) => d.id === 'upper-b')!;
    expect(slotsFor(p, day, '2026-11-12').every((s) => s.sets <= 2)).toBe(true);
    const de = slotsFor(p, day, '2026-12-14');
    expect(de[0].sets).toBe(2);
    expect(de[0].loadKg).toBe(18); // lat pulldown 20 → 18
    const assist = slotsFor(p, p.days[0], '2026-12-14').find((s) => s.exerciseId === 'assisted-pullup')!;
    expect(assist.loadKg).toBeGreaterThan(40); // more help, not less
  });
});

describe('smallest weight jump', () => {
  it('is 1 kg for light dumbbells, 2.5 kg from 10 kg, and the machine step otherwise', () => {
    expect(stepKg(EX['db-curl'], 4)).toBe(1);
    expect(stepKg(EX['db-curl'], 10)).toBe(2.5);
    expect(stepKg(EX['db-split-squat'], 0)).toBe(2);
    expect(stepKg(EX['chest-press'], 15)).toBe(5);
    expect(stepKg(EX['chest-press'], 15, { ...kit, machineStepKg: 2.5 })).toBe(2.5);
  });
});

describe('double progression', () => {
  it('adds the smallest jump when every set tops the range with a rep in reserve', () => {
    const r = progressSlot(slot('db-curl', { low: 10, high: 15, loadKg: 4 }), [sets([15, 15, 15], 4, { rir: 2 })], kit);
    expect(r.slot.loadKg).toBe(5);
    expect(r.line).toBe('One-arm dumbbell curl: 4 → 5 kg');
    expect(progressSlot(slot('chest-press', { loadKg: 15 }), [sets([12, 12, 13], 15, { rir: 1 })], kit).slot.loadKg).toBe(20);
  });
  it('waits when reps are still short of the top, or a set is missing', () => {
    expect(progressSlot(slot('chest-press', { loadKg: 15 }), [sets([12, 12, 11], 15)], kit).line).toBeNull();
    expect(progressSlot(slot('chest-press', { loadKg: 15 }), [sets([12, 12], 15)], kit).line).toBeNull();
  });
  it('waits when the sets left nothing in the tank', () => {
    expect(effortOk(sets([12], 15, { rir: 0 }))).toBe(false);
    expect(effortOk(sets([12], 15, { rpe: 10 }))).toBe(false);
    expect(effortOk(sets([12], 15))).toBe(true);
    expect(progressSlot(slot('chest-press', { loadKg: 15 }), [sets([12, 12, 12], 15, { rir: 0 })], kit).line).toBeNull();
  });
  it('counts the weaker arm in one-arm work', () => {
    expect(countReps({ id: 'a', exerciseId: 'db-curl', reps: 15, repsR: 13, loadKg: 4, at: 0 })).toBe(13);
    const uneven = sets([15, 15, 15], 4, { repsR: 13 });
    expect(progressSlot(slot('db-curl', { low: 10, high: 15, loadKg: 4 }), [uneven], kit).line).toBeNull();
  });
  it('follows the weight actually lifted (finding your weights in week one)', () => {
    const r = progressSlot(slot('lat-pulldown', { low: 10, high: 12, loadKg: 20 }), [sets([11, 10], 25)], kit, 2);
    expect(r.slot.loadKg).toBe(25);
    expect(r.line).toBe('Lat pulldown: now 25 kg');
  });
  it('gives the assisted pull-up less help, never negative', () => {
    const r = progressSlot(slot('assisted-pullup', { sets: 2, low: 6, high: 10, loadKg: 40 }), [sets([10, 10], 40)], kit);
    expect(r.slot.loadKg).toBe(35);
    expect(r.line).toContain('35 kg of help');
    expect(progressSlot(slot('assisted-pullup', { sets: 2, low: 6, high: 10, loadKg: 5 }), [sets([10, 10], 5)], kit).slot.loadKg).toBe(0);
  });
  it('steps back after two sessions short of the range', () => {
    expect(progressSlot(slot('chest-press', { loadKg: 20 }), [sets([6, 5, 5], 20), sets([7, 6, 6], 20)], kit).slot.loadKg).toBe(15);
    expect(progressSlot(slot('assisted-pullup', { low: 6, high: 10, loadKg: 30 }), [sets([4, 3, 3], 30), sets([5, 4, 3], 30)], kit).slot.loadKg).toBe(35);
    expect(progressSlot(slot('knee-pushup', { low: 6, high: 12 }), [sets([4, 3, 3]), sets([5, 4, 3])], kit).slot.exerciseId).toBe('incline-pushup');
    expect(progressSlot(slot('chest-press', { loadKg: 20 }), [sets([6, 5, 5], 20), sets([9, 8, 8], 20)], kit).line).toBeNull();
  });
});

describe('ladders', () => {
  it('grows the range first, then moves incline → knee push-ups', () => {
    const a = progressSlot(slot('incline-pushup', { sets: 2, low: 6, high: 12 }), [sets([12, 12])], kit);
    expect(a.slot).toMatchObject({ exerciseId: 'incline-pushup', low: 8, high: 14 });
    const b = progressSlot(slot('incline-pushup', { sets: 2, low: 8, high: 15 }), [sets([15, 15])], kit);
    expect(b.slot).toMatchObject({ exerciseId: 'knee-pushup', low: 6, high: 12 });
    const c = progressSlot(slot('knee-pushup', { sets: 2, low: 8, high: 15 }), [sets([15, 16])], kit);
    expect(c.slot).toMatchObject({ exerciseId: 'pushup', low: 3, high: 8 });
  });
  it('takes negatives to chin-ups, and chin-ups to 6 before pull-up negatives', () => {
    const a = progressSlot(slot('chin-neg', { low: 2, high: 4 }), [sets([4, 4, 4])], kit);
    expect(a.slot).toMatchObject({ exerciseId: 'chin-neg', low: 3, high: 5 });
    const b = progressSlot(a.slot, [sets([5, 5, 5])], kit);
    expect(b.slot).toMatchObject({ exerciseId: 'chinup', low: 1, high: 3 });
    const c = progressSlot(slot('chinup', { low: 1, high: 3 }), [sets([3, 3, 3])], kit);
    expect(c.slot).toMatchObject({ exerciseId: 'chinup', low: 2, high: 4 });
    expect(progressSlot(slot('chinup', { low: 4, high: 6 }), [sets([6, 6, 6])], kit).slot.exerciseId).toBe('pullup-neg');
  });
  it('never holds a plank past 2 minutes: it moves to a harder variation instead', () => {
    const a = progressSlot(slot('plank', { low: 45, high: 75 }), [sets([75, 75, 80])], kit);
    expect(a.slot).toMatchObject({ exerciseId: 'plank', low: 60, high: 90 });
    const b = progressSlot(a.slot, [sets([90, 90, 90])], kit);
    expect(b.slot).toMatchObject({ exerciseId: 'plank-taps', low: 8, high: 12 });
    let s = slot('side-plank', { low: 90, high: 115 });
    for (let i = 0; i < 5; i++) s = progressSlot(s, [sets([s.high, s.high, s.high])], kit).slot;
    expect(s.high).toBe(HOLD_CAP_S);
  });
});

describe('today’s target', () => {
  it('starts a first-timer at the bottom of the range with a cautious weight', () => {
    const t = targetFor(slot('chest-press', { loadKg: 15 }), [], build);
    expect(t).toMatchObject({ kind: 'first', loadKg: 15, aims: [8, 8, 8], rir: [2, 3] });
    expect(t.why).toMatch(/guess/);
    expect(targetFor(slot('chest-press', { loadKg: 15, sets: 2 }), [], { kind: 'intro', rir: [3, 4] }).kind).toBe('intro');
  });
  it('asks for one more rep per set at the same weight', () => {
    const t = targetFor(slot('chest-press', { loadKg: 15 }), [sets([10, 9, 8], 15, { rir: 2 })], build);
    expect(t).toMatchObject({ kind: 'reps', loadKg: 15, aims: [11, 10, 9] });
    expect(targetFor(slot('chest-press', { loadKg: 15 }), [sets([12, 12, 11], 15, { rir: 2 })], build).aims).toEqual([12, 12, 12]);
    expect(targetFor(slot('plank', { low: 45, high: 75 }), [sets([60, 55, 50])], build).aims).toEqual([65, 60, 55]);
  });
  it('restarts at the bottom of the range after a weight jump', () => {
    const t = targetFor(slot('chest-press', { loadKg: 20 }), [sets([12, 12, 12], 15, { rir: 2 })], build);
    expect(t).toMatchObject({ kind: 'load', loadKg: 20, aims: [8, 8, 8] });
  });
  it('holds the numbers after an all-out session and eases off after a step back', () => {
    expect(targetFor(slot('chest-press', { loadKg: 15 }), [sets([12, 11, 9], 15, { rir: 0 })], build)).toMatchObject({ kind: 'hold', aims: [12, 11, 9] });
    expect(targetFor(slot('chest-press', { loadKg: 15 }), [sets([6, 5, 5], 20)], build).kind).toBe('back');
    expect(targetFor(slot('assisted-pullup', { loadKg: 35, low: 6, high: 10 }), [sets([10, 10, 10], 40)], build).kind).toBe('load');
  });
  it('keeps a lighter week light', () => {
    const t = targetFor(slot('chest-press', { loadKg: 18, sets: 2 }), [sets([12, 12, 12], 20)], { kind: 'deload', rir: [4, 4] });
    expect(t).toMatchObject({ kind: 'deload', loadKg: 18, aims: [8, 8] });
  });
  it('matches the number of sets planned for today', () => {
    expect(targetFor(slot('chest-press', { loadKg: 15, sets: 2 }), [sets([10, 9, 8], 15)], build).aims).toHaveLength(2);
  });
});

describe('finishing a session', () => {
  const p = buildProgram(DEFAULT_BASELINES, [0, 1, 3, 4], '2026-11-12');
  it('progresses only the day that was trained, against the sets planned that day', () => {
    // Intro week: 2 sets planned. Both at the top with reps in reserve → up one step.
    const s = sess('2026-11-12', 'upper-b', [['lat-pulldown', 12, 20], ['lat-pulldown', 12, 20], ['db-row', 9, 6], ['db-row', 9, 6]]);
    const planned = slotsFor(p, p.days.find((d) => d.id === 'upper-b')!, '2026-11-12');
    const { program, lines } = applySession(p, s, {}, kit, { planned });
    expect(lines).toEqual(['Lat pulldown: 20 → 25 kg']);
    expect(program.days.find((d) => d.id === 'upper-b')!.slots[0].loadKg).toBe(25);
    expect(program.days[0]).toBe(p.days[0]);
  });
  it('changes nothing in a lighter week', () => {
    const s = sess('2026-12-14', 'upper-b', [['lat-pulldown', 12, 18], ['lat-pulldown', 12, 18]]);
    expect(applySession(p, s, {}, kit, { hold: true })).toEqual({ program: p, lines: [] });
  });
});

describe('records', () => {
  it('ranks heavier first, then more reps, and spots new bests', () => {
    const a = sess('2026-11-12', 'upper-b', [['db-curl', 12, 4]]);
    const b = sess('2026-11-16', 'upper-a', [['db-curl', 10, 5], ['incline-pushup', 10]]);
    const all = { [a.id]: a, [b.id]: b };
    expect(records(all)['db-curl']).toMatchObject({ loadKg: 5, reps: 10 });
    expect(newRecords(b, all).map((x) => x.exerciseId)).toEqual(['db-curl']);
  });
  it('treats less help on the assisted pull-up as better', () => {
    const a = sess('2026-11-16', 'upper-a', [['assisted-pullup', 8, 40]]);
    const b = sess('2026-11-23', 'upper-a', [['assisted-pullup', 6, 35]]);
    expect(records({ [a.id]: a, [b.id]: b })['assisted-pullup'].loadKg).toBe(35);
  });
});

describe('guardProgram (limits on the AI coach and edits)', () => {
  const day0 = DEFAULT_PROGRAM.days[0];
  it('drops unknown and home exercises, and clamps sets and reps', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: [{ exerciseId: 'barbell-bench', sets: 4, low: 1, high: 1 }, { exerciseId: 'pack-row', sets: 3, low: 8, high: 12 }, { exerciseId: 'chest-press', sets: 9, low: 1, high: 80 }, { exerciseId: 'seated-row', sets: 3, low: 10, high: 12 }, { exerciseId: 'incline-pushup', sets: 2, low: 8, high: 15 }] }] }, kit);
    const s = g.days[0].slots;
    expect(s.map((x) => x.exerciseId)).toEqual(['chest-press', 'seated-row', 'incline-pushup']);
    expect(s[0].low).toBe(MIN_LOADED_REPS);
    expect(s[0].sets).toBeLessThanOrEqual(4);
    expect(g.week).toEqual(DEFAULT_PROGRAM.week);
  });
  it('lets a weight move by one step at most, and starts new exercises light', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: day0.slots.map((s) => (s.exerciseId === 'chest-press' ? { ...s, loadKg: 80 } : s.exerciseId === 'db-curl' ? { ...s, exerciseId: 'incline-db-curl', loadKg: 20 } : s)) }] }, kit);
    expect(g.days[0].slots.find((s) => s.exerciseId === 'chest-press')!.loadKg).toBe(20);
    expect(g.days[0].slots.find((s) => s.exerciseId === 'incline-db-curl')!.loadKg).toBe(3);
  });
  it('keeps a day when too few exercises survive', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'lower-a', slots: [{ exerciseId: 'leg-press', sets: 3, low: 8, high: 12 }] }] }, kit);
    expect(g.days[1]).toEqual(DEFAULT_PROGRAM.days[1]);
  });
  it('limits weekly volume growth to about 20% and 20 sets per pattern', () => {
    const fat = { days: DEFAULT_PROGRAM.days.map((d) => ({ id: d.id, slots: d.slots.map((s) => ({ ...s, sets: 4 })) })) };
    const g = guardProgram(DEFAULT_PROGRAM, fat, kit);
    const sum = (p: typeof g) => Object.values(weeklySets(p)).reduce((a, b) => a + b, 0);
    expect(sum(g)).toBeLessThanOrEqual(Math.round(sum(DEFAULT_PROGRAM) * 1.2));
    for (const v of Object.values(weeklySets(g))) expect(v).toBeLessThanOrEqual(20);
  });
  it('describes the changes in plain words', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: day0.slots.map((s) => (s.exerciseId === 'chest-press' ? { ...s, exerciseId: 'pec-fly' } : s.exerciseId === 'db-curl' ? { ...s, sets: 2 } : s)) }] }, kit);
    expect(diffPrograms(DEFAULT_PROGRAM, g)).toEqual(['Upper A: Chest press machine → Pec fly machine', 'One-arm dumbbell curl: 3 → 2 sets']);
  });
});
