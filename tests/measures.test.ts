import { describe, expect, it } from 'vitest';
import { BENCHMARKS, RETEST_DAYS, armGaps, baseline, best, change, due, fmtMetric, freshBests, gainNote, gapTrend, hasAny, latest, series, weeklyGain } from '../src/lib/measures';
import { addDays } from '../src/lib/dates';
import type { Measure } from '../src/lib/types';

const log = (...rows: Partial<Measure>[]): Record<string, Measure> => Object.fromEntries(rows.map((r) => [r.date!, { m: 1, ...r } as Measure]));

const D0 = '2026-11-12';
// A baseline, two weekly check-ins, then the 4-week retest.
const M = log(
  { date: D0, weightKg: 60, armL: 26, armR: 27, pushups: 3.5, plankS: 90, chinups: 2, pullups: 0 },
  { date: addDays(D0, 7), weightKg: 60.3, armL: 26.2, armR: 27.1 },
  { date: addDays(D0, 14), weightKg: 60.5, armL: 26.4 },
  { date: addDays(D0, 28), weightKg: 61, armL: 26.7, armR: 27.3, pushups: 6, plankS: 110, chinups: 3, pullups: 0 },
);

describe('series, baseline, latest', () => {
  it('lists a metric oldest first and skips dates without it', () => {
    expect(series(M, 'armR')).toEqual([
      { date: D0, v: 27 },
      { date: addDays(D0, 7), v: 27.1 },
      { date: addDays(D0, 28), v: 27.3 },
    ]);
    expect(series(M, 'pushups').map((p) => p.v)).toEqual([3.5, 6]);
  });
  it('sorts by date whatever order the entries were saved in', () => {
    const shuffled = Object.fromEntries(Object.entries(M).reverse());
    expect(series(shuffled, 'weightKg').map((p) => p.v)).toEqual([60, 60.3, 60.5, 61]);
  });
  it('keeps a zero (0 pull-ups is a real result)', () => {
    expect(series(M, 'pullups')).toHaveLength(2);
    expect(latest(M, 'pullups')).toEqual({ date: addDays(D0, 28), v: 0 });
  });
  it('gives the first and the newest value', () => {
    expect(baseline(M, 'weightKg')).toEqual({ date: D0, v: 60 });
    expect(latest(M, 'weightKg')).toEqual({ date: addDays(D0, 28), v: 61 });
  });
  it('is null for an empty log', () => {
    expect(series({}, 'armL')).toEqual([]);
    expect(baseline({}, 'armL')).toBeNull();
    expect(latest({}, 'armL')).toBeNull();
    expect(best({}, 'armL')).toBeNull();
    expect(change({}, 'armL')).toBeNull();
  });
});

describe('best', () => {
  it('is fresh when the newest entry set it', () => {
    expect(best(M, 'pushups')).toEqual({ date: addDays(D0, 28), v: 6, fresh: true });
  });
  it('is never fresh with one entry (a baseline is not a personal best)', () => {
    expect(best(log({ date: D0, pushups: 3.5 }), 'pushups')).toEqual({ date: D0, v: 3.5, fresh: false });
  });
  it('is not fresh when an older entry is still the best', () => {
    const m = log({ date: D0, plankS: 90 }, { date: addDays(D0, 28), plankS: 120 }, { date: addDays(D0, 56), plankS: 100 });
    expect(best(m, 'plankS')).toEqual({ date: addDays(D0, 28), v: 120, fresh: false });
  });
  it('is not fresh for a tie with an older entry', () => {
    const m = log({ date: D0, pullups: 0 }, { date: addDays(D0, 28), pullups: 0 });
    expect(best(m, 'pullups')?.fresh).toBe(false);
    const cap = log({ date: D0, plankS: 120 }, { date: addDays(D0, 28), plankS: 120 });
    expect(best(cap, 'plankS')).toEqual({ date: D0, v: 120, fresh: false });
  });
});

describe('freshBests', () => {
  it('names what the newest entry beat', () => {
    expect(freshBests(M).sort()).toEqual(['armL', 'armR', 'chinups', 'plankS', 'pushups']);
  });
  it('is empty for a lone baseline', () => {
    expect(freshBests(log({ date: D0, pushups: 3.5, plankS: 90, chinups: 2, pullups: 0 }))).toEqual([]);
  });
  it('never includes bodyweight', () => {
    expect(freshBests(M)).not.toContain('weightKg');
  });
});

describe('change', () => {
  it('is the latest minus the first', () => {
    expect(change(M, 'pushups')).toBe(2.5);
    expect(change(M, 'weightKg')).toBe(1);
    expect(change(M, 'armL')).toBe(0.7);
    expect(change(M, 'pullups')).toBe(0);
  });
  it('can go down', () => {
    expect(change(log({ date: D0, plankS: 90 }, { date: addDays(D0, 28), plankS: 75 }), 'plankS')).toBe(-15);
  });
  it('needs two values', () => {
    expect(change(log({ date: D0, pushups: 3.5 }), 'pushups')).toBeNull();
  });
});

describe('arm gap', () => {
  it('only counts dates with both arms, right minus left', () => {
    expect(armGaps(M)).toEqual([
      { date: D0, left: 26, right: 27, gap: 1 },
      { date: addDays(D0, 7), left: 26.2, right: 27.1, gap: 0.9 },
      { date: addDays(D0, 28), left: 26.7, right: 27.3, gap: 0.6 },
    ]);
  });
  it('is negative when the left arm is bigger', () => {
    expect(armGaps(log({ date: D0, armL: 28, armR: 27.5 }))[0].gap).toBe(-0.5);
  });
  const gaps = (...g: number[]) => g.map((gap, i) => ({ date: addDays(D0, i * 7), left: 26, right: 26 + gap, gap }));
  it('closing: at least 0.2 cm smaller than the first', () => {
    expect(gapTrend(armGaps(M))).toBe('closing');
    expect(gapTrend(gaps(1, 0.8))).toBe('closing');
  });
  it('widening: at least 0.2 cm bigger', () => {
    expect(gapTrend(gaps(1, 1.1, 1.2))).toBe('widening');
  });
  it('same: within 0.1 cm', () => {
    expect(gapTrend(gaps(1, 0.5, 0.9))).toBe('same');
    expect(gapTrend(gaps(1, 1.1))).toBe('same');
  });
  it('goes by size, whichever arm is bigger', () => {
    expect(gapTrend(gaps(-1, -0.5))).toBe('closing');
    expect(gapTrend(gaps(-0.5, -1))).toBe('widening');
    expect(gapTrend(gaps(0.5, -0.5))).toBe('same');
  });
  it('needs two measurements', () => {
    expect(gapTrend(gaps(1))).toBeNull();
    expect(gapTrend([])).toBeNull();
  });
});

describe('weeklyGain and gainNote', () => {
  const today = addDays(D0, 28);
  it('averages the change per week over the recent weigh-ins', () => {
    expect(weeklyGain(series(M, 'weightKg'), today)).toBe(0.25);
  });
  it('ignores weigh-ins older than 5 weeks', () => {
    const pts = [{ date: addDays(today, -60), v: 50 }, { date: addDays(today, -14), v: 60 }, { date: today, v: 60.6 }];
    expect(weeklyGain(pts, today)).toBe(0.3);
  });
  it('needs two weigh-ins at least a week apart', () => {
    expect(weeklyGain([{ date: today, v: 60 }], today)).toBeNull();
    expect(weeklyGain([{ date: addDays(today, -3), v: 60 }, { date: today, v: 60.4 }], today)).toBeNull();
    expect(weeklyGain([{ date: addDays(today, -60), v: 58 }, { date: today, v: 60 }], today)).toBeNull();
    expect(weeklyGain([], today)).toBeNull();
  });
  it('can be negative', () => {
    expect(weeklyGain([{ date: addDays(today, -14), v: 61 }, { date: today, v: 60 }], today)).toBe(-0.5);
  });
  it('has a note for each band', () => {
    expect(gainNote(null)).toMatch(/same morning/);
    expect(gainNote(-0.3)).toMatch(/flat/);
    expect(gainNote(0.05)).toMatch(/flat/);
    expect(gainNote(0.1)).toMatch(/steady pace/);
    expect(gainNote(0.25)).toMatch(/steady pace/);
    expect(gainNote(0.5)).toMatch(/steady pace/);
    expect(gainNote(0.6)).toMatch(/quickly/);
  });
  it('never tells him to eat less', () => {
    for (const v of [null, -1, 0, 0.3, 1.5]) expect(gainNote(v)).not.toMatch(/cut|less|diet|calorie/i);
  });
});

describe('due', () => {
  const base = log({ date: D0, weightKg: 60, pushups: 3.5, plankS: 90, chinups: 2, pullups: 0 });
  it('asks for everything when nothing is logged', () => {
    expect(due({}, D0)).toEqual({ weekly: true, retest: true, retestOn: null, retestIn: null });
  });
  it('is quiet on the day of the baseline', () => {
    expect(due(base, D0)).toEqual({ weekly: false, retest: false, retestOn: addDays(D0, RETEST_DAYS), retestIn: 28 });
  });
  it('weekly is due 7 days after the last weigh-in or arm measure', () => {
    expect(due(base, addDays(D0, 6)).weekly).toBe(false);
    expect(due(base, addDays(D0, 7)).weekly).toBe(true);
    const armsOnly = { ...base, ...log({ date: addDays(D0, 7), armL: 26 }) };
    expect(due(armsOnly, addDays(D0, 13)).weekly).toBe(false);
    expect(due(armsOnly, addDays(D0, 14)).weekly).toBe(true);
  });
  it('a retest-only entry does not count as the weekly check-in', () => {
    const m = log({ date: D0, pushups: 4 });
    expect(due(m, D0).weekly).toBe(true);
    expect(due(m, D0).retest).toBe(false);
  });
  it('retest is due 28 days after the last benchmark and counts down', () => {
    expect(due(base, addDays(D0, 16))).toMatchObject({ retest: false, retestIn: 12, retestOn: addDays(D0, 28) });
    expect(due(base, addDays(D0, 27))).toMatchObject({ retest: false, retestIn: 1 });
    expect(due(base, addDays(D0, 28))).toMatchObject({ retest: true, retestIn: 0 });
    expect(due(base, addDays(D0, 33))).toMatchObject({ retest: true, retestIn: -5 });
  });
  it('weekly check-ins do not move the retest date', () => {
    const m = { ...base, ...log({ date: addDays(D0, 7), weightKg: 60.3 }, { date: addDays(D0, 14), weightKg: 60.5, armL: 26.4 }) };
    expect(due(m, addDays(D0, 21))).toMatchObject({ weekly: true, retest: false, retestOn: addDays(D0, 28), retestIn: 7 });
  });
  it('a retest restarts the 4 weeks', () => {
    expect(due(M, addDays(D0, 28))).toEqual({ weekly: false, retest: false, retestOn: addDays(D0, 56), retestIn: 28 });
  });
  it('counts whole days across the daylight-saving change', () => {
    // Sydney: clocks go back on 4 Apr 2027 and forward on 3 Oct 2027.
    expect(due(log({ date: '2027-03-22', pushups: 5 }), '2027-04-19')).toMatchObject({ retest: true, retestIn: 0, retestOn: '2027-04-19' });
    expect(due(log({ date: '2027-09-20', pushups: 5 }), '2027-10-17')).toMatchObject({ retest: false, retestIn: 1, retestOn: '2027-10-18' });
  });
});

describe('fmtMetric and hasAny', () => {
  it('writes a plank as minutes and seconds', () => {
    expect(fmtMetric('plankS', 90)).toBe('1:30');
    expect(fmtMetric('plankS', 120)).toBe('2:00');
    expect(fmtMetric('plankS', 45)).toBe('0:45');
    expect(fmtMetric('plankS', 65)).toBe('1:05');
    expect(fmtMetric('plankS', 0)).toBe('0:00');
  });
  it('never writes ":60" for a part second', () => {
    expect(fmtMetric('plankS', 59.6)).toBe('1:00');
    expect(fmtMetric('plankS', 119.5)).toBe('2:00');
  });
  it('writes weight, arms and reps', () => {
    expect(fmtMetric('weightKg', 60)).toBe('60 kg');
    expect(fmtMetric('weightKg', 60.25)).toBe('60.3 kg');
    expect(fmtMetric('armL', 27.5)).toBe('27.5 cm');
    expect(fmtMetric('armR', 27)).toBe('27 cm');
    expect(fmtMetric('pushups', 3.5)).toBe('3.5');
    expect(fmtMetric('chinups', 5)).toBe('5');
  });
  it('hasAny sees any filled field, including zero', () => {
    expect(hasAny({ date: D0, m: 1 })).toBe(false);
    expect(hasAny({ pullups: 0 })).toBe(true);
    expect(hasAny({ weightKg: 60 })).toBe(true);
  });
  it('the benchmarks are the four tests', () => {
    expect(BENCHMARKS).toEqual(['pushups', 'plankS', 'chinups', 'pullups']);
  });
});
