import { describe, expect, it } from 'vitest';
import { DEFAULT_DATA, exportCsv, exportJson, importJson, normalize } from '../src/lib/backup';
import { DEFAULT_PROGRAM, addSlot, copyDay, deleteDay, nextPlanned, minutes, minutesLeft, workoutTimeOn, moveSlot, plannedDay, slotsFor, warmupFor, weekdayOf } from '../src/lib/program';
import { EX, EXERCISES, bestText, easier, harder } from '../src/lib/exercises';
import { applySession, deloadDue, diffPrograms, guardProgram, matchSession, newRecords, progressSlot, records, trendOf, moveSession, sessionText, vsLast, withLength, weeklySets } from '../src/lib/progress';
import { readiness } from '../src/lib/readiness';
import { lastWeekReport, weekNotes, weekReportText, yesterdayLine } from '../src/lib/notes';
import { backupDue, lookDefaults, startHash } from '../src/lib/layout';
import { addMeasure, measureChange } from '../src/lib/body';
import { computeGame, nextBadge, weekSummary, workoutWeeks } from '../src/lib/game';
import { addDays, addMonths, atOn, monthGrid, weekStart } from '../src/lib/dates';
import type { Night, Session, SetLog, Slot } from '../src/lib/types';

const prof = { packMaxKg: 15, hasGrip: true };
const sets = (reps: number[], loadKg = 0, rpe?: number): SetLog[] => reps.map((r, i) => ({ id: `s${i}`, exerciseId: 'x', reps: r, loadKg, rpe, at: i }));
const slot = (exerciseId: string, p: Partial<Slot> = {}): Slot => ({ exerciseId, sets: 3, low: 8, high: 12, restS: 60, loadKg: 0, ...p });
let n = 0;
const sess = (date: string, dayId: string, list: [string, number, number?][], extra: Partial<Session> = {}): Session => {
  const start = atOn(date, '16:30') + n++;
  return { id: `ses${n}`, date, dayId, name: dayId, start, end: start + 2_400_000, sets: list.map(([exerciseId, reps, loadKg = 0], i) => ({ id: `x${n}-${i}`, exerciseId, reps, loadKg, at: start + i })), upd: start, ...extra };
};

describe('exercise library', () => {
  it('has unique ids and every default exercise exists', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const d of DEFAULT_PROGRAM.days) for (const s of d.slots) expect(EX[s.exerciseId], s.exerciseId).toBeTruthy();
  });
  it('walks the push-up ladder both ways', () => {
    expect(harder('incline-pushup')?.id).toBe('pushup');
    expect(harder('pushup')?.id).toBe('pack-pushup');
    expect(easier('pushup')?.id).toBe('incline-pushup');
    expect(harder('archer-pushup')).toBeNull();
  });
  it('needs no gym equipment', () => {
    for (const e of EXERCISES) for (const q of e.equip) expect(['bw', 'pack', 'grip']).toContain(q);
  });
});

describe('program', () => {
  it('schedules upper/lower on Mon, Tue, Thu, Fri', () => {
    expect(weekdayOf('2026-10-26')).toBe(0); // a Monday
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-26')?.id).toBe('upper-a');
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-28')).toBeNull();
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-30')?.id).toBe('lower-b');
  });
  it('cuts sets on deload weeks and easy days', () => {
    const day = DEFAULT_PROGRAM.days[0];
    const p = { ...DEFAULT_PROGRAM, deloadUntil: '2026-10-30' };
    expect(slotsFor(p, day, '2026-10-26')[0].sets).toBe(2);
    expect(slotsFor(DEFAULT_PROGRAM, day, '2026-10-26', true)[0].sets).toBe(3);
    expect(slotsFor(DEFAULT_PROGRAM, day, '2026-10-26')[0].sets).toBe(4);
  });
  it('estimates 30–50 minutes for the default days', () => {
    for (const d of DEFAULT_PROGRAM.days) {
      const m = minutes(d.slots);
      expect(m).toBeGreaterThanOrEqual(30);
      expect(m).toBeLessThanOrEqual(55);
    }
  });
});

describe('progression', () => {
  it('adds 2 kg to a backpack exercise when every set hits the top', () => {
    const r = progressSlot(slot('pack-row', { loadKg: 6, high: 15 }), [sets([15, 15, 16], 6, 8)], prof);
    expect(r.slot.loadKg).toBe(8);
    expect(r.line).toContain('6 → 8 kg');
  });
  it('moves a bodyweight exercise up its ladder instead of adding load', () => {
    const r = progressSlot(slot('pushup', { high: 15 }), [sets([15, 15, 15])], prof);
    expect(r.slot.exerciseId).toBe('pack-pushup');
    expect(r.slot.loadKg).toBe(0);
  });
  it('waits when the sets were a grind (RPE above 8.5)', () => {
    expect(progressSlot(slot('pack-row', { loadKg: 6 }), [sets([12, 12, 12], 6, 10)], prof).line).toBeNull();
  });
  it('waits when fewer sets than planned were done', () => {
    expect(progressSlot(slot('pack-row', { loadKg: 6 }), [sets([12, 12], 6)], prof).line).toBeNull();
  });
  it('switches to the harder variation when the backpack is maxed out', () => {
    const r = progressSlot(slot('pack-pushup', { loadKg: 14 }), [sets([12, 12, 12], 14)], { packMaxKg: 15, hasGrip: true });
    expect(r.slot.exerciseId).toBe('decline-pushup');
  });
  it('raises the range when there is nowhere else to go', () => {
    const r = progressSlot(slot('ytw', { low: 8, high: 12 }), [sets([12, 12, 12])], prof);
    expect([r.slot.low, r.slot.high]).toEqual([10, 14]);
  });
  it('steps back after two sessions short of the range', () => {
    const r = progressSlot(slot('pack-row', { loadKg: 8 }), [sets([6, 5, 5], 8), sets([7, 6, 6], 8)], prof);
    expect(r.slot.loadKg).toBe(6);
    const b = progressSlot(slot('pushup'), [sets([4, 3, 3]), sets([5, 4, 3])], prof);
    expect(b.slot.exerciseId).toBe('incline-pushup');
  });
  it('applies a finished session to its plan day only', () => {
    const s = sess('2026-10-26', 'upper-a', [['pack-row', 15, 6], ['pack-row', 15, 6], ['pack-row', 15, 6], ['pack-row', 15, 6]]);
    const { program, lines } = applySession(DEFAULT_PROGRAM, s, {}, { ...DEFAULT_DATA.profile });
    expect(lines).toEqual(['Backpack row: 6 → 8 kg']);
    expect(program.days[0].slots[1].loadKg).toBe(8);
    expect(program.days[1]).toBe(DEFAULT_PROGRAM.days[1]);
  });
});

describe('records', () => {
  it('ranks heavier first, then more reps, and spots new bests', () => {
    const a = sess('2026-10-20', 'upper-a', [['pack-row', 12, 6]]);
    const b = sess('2026-10-23', 'upper-a', [['pack-row', 10, 8], ['pushup', 10]]);
    const all = { [a.id]: a, [b.id]: b };
    expect(records(all)['pack-row']).toMatchObject({ loadKg: 8, reps: 10 });
    expect(newRecords(b, all).map((x) => x.exerciseId)).toEqual(['pack-row']);
  });
});

describe('exportCsv', () => {
  it('writes one row per set and per night, numbering sets per exercise and quoting notes', () => {
    const a = sess('2026-10-26', 'upper-a', [['pushup', 10], ['pushup', 9], ['pack-row', 12, 6]], { note: 'Wrist, a bit sore', feel: 4 });
    const bed = atOn('2026-10-25', '21:30');
    const { workouts, sleep } = exportCsv({ sessions: { [a.id]: a }, nights: { '2026-10-26': { date: '2026-10-26', bed, wake: bed + 510 * 60_000, quality: 4, done: ['Screens off', 'Teeth'], note: 'Late, study', source: 'tap', m: 1 } } });
    const rows = workouts.trim().split('\n');
    expect(rows).toHaveLength(4);
    expect(rows[2]).toBe('2026-10-26,upper-a,Push-up,2,9,0,,4,"Wrist, a bit sore"');
    expect(rows[3]).toMatch(/^2026-10-26,upper-a,Backpack row,1,12,6,/);
    expect(sleep.trim().split('\n')[1]).toBe('2026-10-26,21:30,06:00,510,4,tap,Screens off; Teeth,"Late, study"');
  });
});

describe('addSlot', () => {
  it('adds a move at the end with a starting range, once, and not past 12', () => {
    const d = DEFAULT_PROGRAM.days[0];
    const p = addSlot(DEFAULT_PROGRAM, d.id, 'wall-sit');
    expect(p.days[0].slots.at(-1)).toEqual({ exerciseId: 'wall-sit', sets: 3, low: 20, high: 40, restS: 60, loadKg: 0 });
    expect(addSlot(p, d.id, 'wall-sit')).toEqual(p);
    expect(addSlot(DEFAULT_PROGRAM, d.id, 'nope')).toEqual(DEFAULT_PROGRAM);
    expect(p.days[1]).toBe(DEFAULT_PROGRAM.days[1]);
  });
});

describe('workoutTimeOn', () => {
  it('uses the weekend time on Saturday and Sunday when set, and normalize keeps only a valid one', () => {
    const s = { workoutTime: '16:30', weekendWorkoutTime: '10:00' };
    expect(workoutTimeOn(s, '2026-10-30')).toBe('16:30');
    expect(workoutTimeOn(s, '2026-10-31')).toBe('10:00');
    expect(workoutTimeOn(s, '2026-11-01')).toBe('10:00');
    expect(workoutTimeOn({ ...s, weekendWorkoutTime: '' }, '2026-10-31')).toBe('16:30');
    expect(normalize({ settings: { weekendWorkoutTime: '9:05' } }).settings.weekendWorkoutTime).toBe('09:05');
    expect(normalize({ settings: { weekendWorkoutTime: 'soon' } }).settings.weekendWorkoutTime).toBe('');
    expect(normalize({}).settings.weekendWorkoutTime).toBe('');
  });
});

describe('minutesLeft', () => {
  it('counts only the sets still to do, and none once all are logged', () => {
    const s: Slot = { exerciseId: 'pushup', sets: 3, low: 8, high: 12, restS: 80, loadKg: 0 };
    expect(minutesLeft([s], [])).toBe(6);
    expect(minutesLeft([s], [{ exerciseId: 'pushup' }])).toBe(4);
    expect(minutesLeft([s], [1, 2, 3, 4].map(() => ({ exerciseId: 'pushup' })))).toBe(0);
  });
});

describe('withLength', () => {
  it('keeps the start and sets the end, between 1 and 300 min', () => {
    const s = sess('2026-10-26', 'upper-a', [['pushup', 10]]);
    expect(withLength(s, 35).end - s.start).toBe(35 * 60_000);
    expect(withLength(s, 900).end - s.start).toBe(300 * 60_000);
    expect(withLength(s, 0).end - s.start).toBe(60_000);
    expect(withLength(s, 35).start).toBe(s.start);
  });
});

describe('matchSession', () => {
  it('needs every word in the name, a move or the note, any case', () => {
    const a = sess('2026-10-26', 'Upper A', [['pushup', 10], ['pack-row', 12, 6]], { note: 'Wrist sore' });
    expect(matchSession(a, '')).toBe(true);
    expect(matchSession(a, 'upper')).toBe(true);
    expect(matchSession(a, 'backpack WRIST')).toBe(true);
    expect(matchSession(a, 'push squat')).toBe(false);
  });
});

describe('warmupFor', () => {
  it('starts general, then one line per pattern in order, at most four', () => {
    expect(warmupFor([slot('pushup'), slot('diamond-pushup'), slot('pack-row')])).toHaveLength(3);
    expect(warmupFor([slot('squat')])[1]).toMatch(/squat/);
    expect(warmupFor(DEFAULT_PROGRAM.days.flatMap((d) => d.slots)).length).toBeLessThanOrEqual(4);
    expect(warmupFor([])).toHaveLength(1);
  });
});

describe('weekSummary', () => {
  it('counts days trained, sets and minutes inside the week only', () => {
    const a = sess('2026-10-26', 'upper-a', [['pushup', 10], ['pushup', 9]]);
    const b = sess('2026-10-26', 'lower-a', [['squat', 12]]);
    const c = sess('2026-10-28', 'upper-b', [['pushup', 8]]);
    const old = sess('2026-10-25', 'upper-a', [['pushup', 8]]);
    const w = weekSummary({ sessions: { [a.id]: a, [b.id]: b, [c.id]: c, [old.id]: old }, program: DEFAULT_PROGRAM }, '2026-10-26');
    expect(w).toEqual({ done: 2, planned: DEFAULT_PROGRAM.week.filter(Boolean).length, sets: 4, minutes: 120 });
  });
});

describe('moveSlot and diffPrograms', () => {
  it('reorders a day, stops at the ends, and reports order and rest changes', () => {
    const d = DEFAULT_PROGRAM.days[0];
    const moved = moveSlot(DEFAULT_PROGRAM, d.id, 0, 1);
    expect(moved.days[0].slots.map((s) => s.exerciseId).slice(0, 2)).toEqual([d.slots[1].exerciseId, d.slots[0].exerciseId]);
    expect(moveSlot(DEFAULT_PROGRAM, d.id, 0, -1)).toEqual(DEFAULT_PROGRAM);
    expect(diffPrograms(DEFAULT_PROGRAM, moved)[0]).toMatch(/new order/);
    const rest = { ...DEFAULT_PROGRAM, days: DEFAULT_PROGRAM.days.map((x, i) => (i ? x : { ...x, slots: x.slots.map((s, j) => (j ? s : { ...s, restS: s.restS + 30 })) })) };
    expect(diffPrograms(DEFAULT_PROGRAM, rest)[0]).toMatch(/rest \d+ → \d+ s/);
    const named = { ...DEFAULT_PROGRAM, days: DEFAULT_PROGRAM.days.map((x, i) => (i ? x : { ...x, name: 'Push and pull' })) };
    expect(diffPrograms(DEFAULT_PROGRAM, named)).toEqual([`${DEFAULT_PROGRAM.days[0].name} renamed to Push and pull`]);
  });
});

describe('copyDay and deleteDay', () => {
  it('copies a day after itself with a fresh name, deletes one and frees its weekdays, and reports both', () => {
    const d0 = DEFAULT_PROGRAM.days[0];
    const c = copyDay(DEFAULT_PROGRAM, d0.id, 'copy1');
    expect(c.days[1]).toMatchObject({ id: 'copy1', name: `${d0.name} 2` });
    expect(c.days[1].slots).toEqual(d0.slots);
    expect(c.week).toEqual(DEFAULT_PROGRAM.week);
    expect(copyDay(c, d0.id, 'copy2').days[1].name).toBe(`${d0.name} 3`);
    expect(diffPrograms(DEFAULT_PROGRAM, c)).toEqual([`New workout: ${d0.name} 2`]);
    const del = deleteDay(DEFAULT_PROGRAM, d0.id);
    expect(del.days.some((d) => d.id === d0.id)).toBe(false);
    expect(del.week.includes(d0.id)).toBe(false);
    expect(diffPrograms(DEFAULT_PROGRAM, del)).toEqual([`Deleted workout: ${d0.name}`]);
    expect(deleteDay({ ...DEFAULT_PROGRAM, days: [d0] }, d0.id).days).toHaveLength(1);
    // A weekday moved on its own used to count as no change, so setProgram dropped it.
    const week = { ...DEFAULT_PROGRAM, week: [...DEFAULT_PROGRAM.week].reverse() };
    expect(diffPrograms(DEFAULT_PROGRAM, week)).toEqual(['Weekly schedule changed']);
    const light = { ...DEFAULT_PROGRAM, deloadUntil: '2026-11-04' };
    expect(diffPrograms(DEFAULT_PROGRAM, light)).toEqual(['Lighter week until 2026-11-04']);
    expect(diffPrograms(light, { ...light, deloadUntil: '2026-10-28' })).toEqual(['Lighter week ended early']);
  });
});

describe('moveSession', () => {
  it('moves the date and keeps clock times, across a daylight-saving change too', () => {
    const a = sess('2026-10-02', 'upper-a', [['pushup', 10]]);
    const m = moveSession(a, '2026-10-06');
    expect(m.date).toBe('2026-10-06');
    expect(new Date(m.start).getHours()).toBe(16);
    expect(new Date(m.start).getMinutes()).toBe(30);
    expect(m.end - m.start).toBe(a.end - a.start);
    expect(m.sets[0].at - m.start).toBe(a.sets[0].at - a.start);
    expect(moveSession(a, a.date)).toBe(a);
  });
});

describe('sessionText', () => {
  it('summarises a workout per exercise with load and note', () => {
    const a = sess('2026-10-26', 'Upper A', [['pushup', 12], ['pushup', 10], ['pack-row', 10, 6], ['pack-row', 9, 6], ['superman', 30]], { note: 'Felt good' });
    expect(sessionText(a, 'Mon 26 Oct')).toBe(['Upper A · Mon 26 Oct · 40 min · 5 sets', 'Push-up: 12, 10', 'Backpack row: 10, 9 @ 6 kg', 'Superman hold: 30 s', 'Note: Felt good'].join('\n'));
  });
});

describe('trendOf', () => {
  it('lists the best set and total per session, oldest first, last n only', () => {
    const a = sess('2026-10-20', 'upper-a', [['pushup', 10], ['pushup', 8], ['squat', 20]]);
    const b = sess('2026-10-22', 'upper-a', [['squat', 15]]);
    const c = sess('2026-10-24', 'upper-a', [['pushup', 12], ['pushup', 9]]);
    const all = { [c.id]: c, [a.id]: a, [b.id]: b };
    expect(trendOf(all, 'pushup')).toEqual([
      { date: '2026-10-20', top: { reps: 10, loadKg: 0 }, total: 18 },
      { date: '2026-10-24', top: { reps: 12, loadKg: 0 }, total: 21 },
    ]);
    expect(trendOf(all, 'pushup', 1).map((x) => x.date)).toEqual(['2026-10-24']);
    expect(trendOf(all, 'pike-pushup')).toEqual([]);
  });
});

describe('guardProgram', () => {
  it('drops unknown exercises, clamps numbers and the backpack', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: [{ exerciseId: 'barbell-bench', sets: 4, low: 5, high: 5 }, { exerciseId: 'pushup', sets: 9, low: 1, high: 80 }, { exerciseId: 'pack-row', sets: 3, low: 10, high: 15, loadKg: 99 }, { exerciseId: 'pike-pushup', sets: 3, low: 6, high: 10 }] }] }, prof);
    const s = g.days[0].slots;
    expect(s.map((x) => x.exerciseId)).toEqual(['pushup', 'pack-row', 'pike-pushup']);
    expect(s[0]).toMatchObject({ sets: 5, low: 3, high: 30 });
    expect(s[1].loadKg).toBe(15);
    expect(g.week).toEqual(DEFAULT_PROGRAM.week);
  });
  it('keeps a day when too few exercises survive', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'lower-a', slots: [{ exerciseId: 'pushup', sets: 3, low: 8, high: 12 }] }] }, prof);
    expect(g.days[1]).toEqual(DEFAULT_PROGRAM.days[1]);
  });
  it('removes the forearm trainer when there is none', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: [{ exerciseId: 'pushup', sets: 3, low: 8, high: 12 }, { exerciseId: 'pack-row', sets: 3, low: 8, high: 12 }, { exerciseId: 'grip-squeeze', sets: 3, low: 8, high: 12 }, { exerciseId: 'ytw', sets: 2, low: 8, high: 12 }] }] }, { packMaxKg: 15, hasGrip: false });
    expect(g.days[0].slots.map((s) => s.exerciseId)).not.toContain('grip-squeeze');
  });
  it('limits total weekly volume growth to about 20%', () => {
    const fat = { days: DEFAULT_PROGRAM.days.map((d) => ({ id: d.id, slots: d.slots.map((s) => ({ ...s, sets: 5 })) })) };
    const g = guardProgram(DEFAULT_PROGRAM, fat, prof);
    const before = Object.values(weeklySets(DEFAULT_PROGRAM)).reduce((a, b) => a + b, 0);
    const after = Object.values(weeklySets(g)).reduce((a, b) => a + b, 0);
    expect(after).toBeLessThanOrEqual(Math.round(before * 1.2));
    for (const v of Object.values(weeklySets(g))) expect(v).toBeLessThanOrEqual(20);
  });
  it('describes the changes in plain words', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: DEFAULT_PROGRAM.days[0].slots.map((s) => (s.exerciseId === 'pike-pushup' ? { ...s, exerciseId: 'elevated-pike' } : s.exerciseId === 'pack-row' ? { ...s, sets: 3 } : s)) }] }, prof);
    expect(diffPrograms(DEFAULT_PROGRAM, g)).toEqual(['Upper A: Pike push-up → Feet-up pike push-up', 'Backpack row: 4 → 3 sets']);
  });
});

describe('deload and streaks', () => {
  it('is due after 5 full weeks', () => {
    const all: Record<string, Session> = {};
    for (let w = 1; w <= 5; w++) for (const d of [0, 1, 3]) {
      const s = sess(addDays(addDays(weekStart('2026-10-26'), -7 * w), d), 'upper-a', [['pushup', 10]]);
      all[s.id] = s;
    }
    expect(deloadDue(all, DEFAULT_PROGRAM, '2026-10-26', weekStart, addDays)).toBe(true);
    expect(deloadDue(all, { ...DEFAULT_PROGRAM, deloadUntil: '2026-10-10' }, '2026-10-26', weekStart, addDays)).toBe(false);
    expect(workoutWeeks({ sessions: all }, '2026-10-26')).toBe(5);
  });
});

describe('readiness', () => {
  const night = (h: number, q = 4): Night => ({ date: '2026-10-26', bed: atOn('2026-10-25', '21:30'), wake: atOn('2026-10-25', '21:30') + h * 3_600_000, quality: q, source: 'tap', m: 1 });
  const fuel = (kcal: number, protein: number) => ({ targets: { kcal: 3050, protein: 115, carbs: 456, fat: 85 }, weighIns: [], profileKg: null, days: { '2026-10-25': { kcal, protein, carbs: 0, fat: 0, items: 3, first: null, last: null } } });
  it('says go hard after a full night, food on target and a rest day', () => {
    const f = fuel(3100, 120);
    const r = readiness({ today: '2026-10-26', night: night(8.5, 5), goalH: 8.5, fuel: f, targets: f.targets, sessions: {} });
    expect(r.band).toBe('hard');
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
  it('says take it easy after a short night, little food and two hard days', () => {
    const f = fuel(1800, 60);
    const a = sess('2026-10-24', 'upper-a', [['pushup', 10]]);
    const b = sess('2026-10-25', 'lower-a', [['pack-squat', 10]], { feel: 1 });
    const r = readiness({ today: '2026-10-26', night: night(5.5, 2), goalH: 8.5, fuel: f, targets: f.targets, sessions: { [a.id]: a, [b.id]: b } });
    expect(r.band).toBe('easy');
    expect(r.notes.join(' ')).toMatch(/Short night/);
  });
  it('counts missing data as average', () => {
    const r = readiness({ today: '2026-10-26', night: undefined, goalH: 8.5, fuel: null, targets: null, sessions: {} });
    expect(r.band).toBe('hard');
    expect(r.score).toBe(80);
  });
});

describe('badges', () => {
  it('awards the first workout and a wake streak', () => {
    const s = sess('2026-10-26', 'upper-a', [['pushup', 10]]);
    const nights: Record<string, Night> = {};
    for (let i = 0; i < 7; i++) {
      const k = addDays('2026-10-26', -i);
      nights[k] = { date: k, bed: null, wake: atOn(k, '06:05'), source: 'tap', m: 1 };
    }
    const g = computeGame({ ...DEFAULT_DATA, sessions: { [s.id]: s }, nights }, '2026-10-26');
    expect(g.wake).toBe(7);
    expect(g.badges.filter((b) => b.earned).map((b) => b.id)).toEqual(['first', 'wake7']);
    expect(g.badges.find((b) => b.id === 'ten')).toMatchObject({ have: 1, need: 10, earned: false });
    expect(g.badges.find((b) => b.id === 'wake7')).toMatchObject({ have: 7, need: 7 });
    expect(g.badges.find((b) => b.id === 'wake30')).toMatchObject({ have: 7, need: 30 });
    expect(g.badges.find((b) => b.id === 'bests10')).toMatchObject({ need: 10, earned: false });
    expect(g.badges.find((b) => b.id === 'diary30')).toMatchObject({ have: 7, need: 30, earned: false });
    const ticked = { ...nights, '2026-10-26': { ...nights['2026-10-26'], done: [...DEFAULT_DATA.profile.windDown] } };
    expect(computeGame({ ...DEFAULT_DATA, sessions: { [s.id]: s }, nights: ticked }, '2026-10-26').badges.find((b) => b.id === 'wind7')).toMatchObject({ have: 1, need: 7 });
  });
});

describe('exercise notes', () => {
  it('keeps notes for real exercises, trims them, and drops unknown or empty ones', () => {
    const d = normalize({ profile: { exNotes: { pushup: '  blue strap  ', nope: 'x', squat: '   ', 'pack-row': 'a'.repeat(300) } } });
    expect(d.profile.exNotes).toEqual({ pushup: 'blue strap', 'pack-row': 'a'.repeat(200) });
    expect(normalize({}).profile.exNotes).toEqual({});
  });
});

describe('wind-down', () => {
  it('defaults the list, cleans it, and keeps ticks on a night', () => {
    expect(normalize({}).profile.windDown).toHaveLength(3);
    expect(normalize({ profile: { windDown: [' Read ', 'Read', '', 5, 'Stretch'] } }).profile.windDown).toEqual(['Read', 'Stretch']);
    expect(normalize({ profile: { windDown: [] } }).profile.windDown).toEqual([]);
    const d = normalize({ nights: { '2026-10-29': { bed: null, wake: null, done: ['Read', 7, ''], m: 1 } } });
    expect(d.nights['2026-10-29'].done).toEqual(['Read']);
  });
  it('keeps a trimmed night note and drops an empty one', () => {
    const d = normalize({ nights: { a: 1, '2026-10-29': { bed: null, wake: null, note: '  Woke at 2 am ', m: 1 }, '2026-10-28': { bed: null, wake: null, note: '  ', m: 1 } } });
    expect(d.nights['2026-10-29'].note).toBe('Woke at 2 am');
    expect('note' in d.nights['2026-10-28']).toBe(false);
  });
});

describe('startHash', () => {
  it('goes to the start page only when the URL names no page', () => {
    expect(startHash('', 'sleep')).toBe('#/sleep');
    expect(startHash('#/', 'train')).toBe('#/train');
    expect(startHash('#/profile', 'sleep')).toBeNull();
    expect(startHash('', 'today')).toBeNull();
    expect(startHash('', 'nope')).toBeNull();
  });
});

describe('lookDefaults', () => {
  it('is a fresh copy each time', () => {
    const a = lookDefaults();
    a.noteTags.push('x');
    a.hidden.push('fuel');
    expect(lookDefaults()).toMatchObject({ hidden: [], accent: 'mint', large: false, start: 'today' });
    expect(lookDefaults().noteTags).not.toContain('x');
  });
});

describe('body measurements', () => {
  it('keeps one entry a day, oldest first, and reports the change since the first', () => {
    let l = addMeasure([], { date: '2026-10-20', arm: 28, waist: 70 });
    l = addMeasure(l, { date: '2026-10-01', arm: 27.2 });
    l = addMeasure(l, { date: '2026-10-20', arm: 28.5, waist: 70 });
    expect(l.map((x) => x.date)).toEqual(['2026-10-01', '2026-10-20']);
    expect(measureChange(l, 'arm')).toEqual({ now: 28.5, diff: 1.3, days: 19 });
    expect(measureChange(l, 'waist')).toEqual({ now: 70, diff: 0, days: 0 });
    expect(measureChange(l, 'chest')).toBeNull();
  });
  it('normalize cleans the log', () => {
    const d = normalize({ profile: { measures: [{ date: '2026-10-02', arm: '27.04', chest: 'x' }, { date: 'bad', arm: 30 }, { date: '2026-10-01' }, { date: '2026-10-02', arm: 27.5 }] } });
    expect(d.profile.measures).toEqual([{ date: '2026-10-02', arm: 27.5 }]);
    expect(normalize({}).profile.measures).toEqual([]);
  });
});

describe('theme', () => {
  it('keeps black and drops unknown themes', () => {
    expect(normalize({ settings: { theme: 'black' } }).settings.theme).toBe('black');
    expect(normalize({ settings: { theme: 'purple' } }).settings.theme).toBe('auto');
  });
});

describe('backup', () => {
  it('round-trips without the AI keys', () => {
    const d = { ...DEFAULT_DATA, settings: { ...DEFAULT_DATA.settings, aiKey: 'secret', geminiKey: 'g' } };
    const text = exportJson(d);
    expect(text).not.toContain('secret');
    const back = importJson(text);
    expect(back.program).toEqual(DEFAULT_DATA.program);
    expect(back.settings.aiKey).toBe('');
  });
  it('rejects other files and repairs bad fields', () => {
    expect(() => importJson('{"app":"fuel-log","data":{}}')).toThrow(/Fitness Tracker/);
    const d = normalize({ settings: { wakeTarget: '25:99', sleepGoalH: 30 }, program: { days: [{ id: 'x', slots: [{ exerciseId: 'nope' }] }] }, nights: { bad: {}, '2026-10-26': { wake: 5, quality: 9 } } });
    expect(d.settings.wakeTarget).toBe('06:00');
    expect(d.settings.sleepGoalH).toBe(11);
    expect(d.program).toEqual(DEFAULT_PROGRAM);
    expect(Object.keys(d.nights)).toEqual(['2026-10-26']);
    expect(d.nights['2026-10-26'].quality).toBe(5);
  });
});

describe('nextBadge', () => {
  const b = (id: string, have: number, need: number) => ({ id, name: id, how: '', earned: have >= need, have, need });
  it('picks the closest started badge, skipping earned, untouched and one-step ones', () => {
    expect(nextBadge([b('a', 3, 10), b('b', 5, 7), b('c', 0, 4), b('d', 7, 7), b('e', 0, 1)])?.id).toBe('b');
    expect(nextBadge([b('x', 1, 2), b('y', 5, 10)])?.id).toBe('x');
    expect(nextBadge([b('c', 0, 4)])).toBeNull();
  });
});

describe('weekNotes and night notes', () => {
  it('mentions the note that goes with the least sleep', () => {
    const nights: Record<string, Night> = {};
    for (let i = 1; i <= 8; i++) {
      const date = addDays('2026-10-29', -i);
      const ph = i <= 3;
      const bed = atOn(addDays(date, -1), ph ? '22:30' : '21:30');
      nights[date] = { date, bed, wake: atOn(date, '06:00'), note: ph ? 'Phone in bed' : undefined, source: 'tap', m: 1 };
    }
    expect(weekNotes({ ...DEFAULT_DATA, nights }, '2026-10-29').some((l) => l.startsWith('Nights you note “phone in bed” average 1 h 00 m less'))).toBe(true);
  });
});

describe('yesterdayLine', () => {
  it('names yesterday’s workout and food, or nothing', () => {
    const a = sess('2026-10-29', 'Lower B', [['pushup', 10]]);
    const sessions = { [a.id]: a };
    expect(yesterdayLine(sessions, { kcal: 2950.4, protein: 110.2 }, '2026-10-29')).toBe('Yesterday: Lower B, 40 min · 2,950 kcal, 110 g protein');
    expect(yesterdayLine(sessions, undefined, '2026-10-29')).toBe('Yesterday: Lower B, 40 min');
    expect(yesterdayLine({}, { kcal: 0, protein: 0 }, '2026-10-29')).toBeNull();
  });
});

describe('lastWeekReport', () => {
  it('reports Monday to Sunday before this week, with new bests, or null when nothing was logged', () => {
    const list = [sess('2026-10-13', 'upper-a', [['pushup', 8]]), sess('2026-10-20', 'upper-a', [['pushup', 10]]), sess('2026-10-22', 'upper-a', [['pushup', 12]]), sess('2026-10-27', 'upper-a', [['pushup', 15]])];
    const bed = atOn('2026-10-20', '21:30');
    const d = { ...DEFAULT_DATA, sessions: Object.fromEntries(list.map((x) => [x.id, x])), nights: { '2026-10-21': { date: '2026-10-21', bed, wake: bed + 510 * 60_000, source: 'tap' as const, m: 1 } } };
    const r = lastWeekReport(d, '2026-10-28')!;
    expect(r).toMatchObject({ ws: '2026-10-19', workouts: 2, bests: 2, nights: 1, avgMin: 510, onTime: 1 });
    expect(r.minutes).toBe(80);
    expect(lastWeekReport({ ...DEFAULT_DATA }, '2026-10-28')).toBeNull();
    expect(weekReportText(r).split('\n')).toEqual(['My week, 19 Oct – 25 Oct', 'Workouts: 2 of 4, 1 h 20 m, 2 new bests', 'Sleep: 8 h 30 m average, up on time 1 of 1, 1 of 7 nights logged']);
  });
});

describe('weekNotes', () => {
  it('counts the week, spots moves going up or stuck, and talks about sleep', () => {
    const a = sess('2026-10-20', 'upper-a', [['pushup', 10], ['pack-row', 10, 6]]);
    const b = sess('2026-10-23', 'upper-a', [['pushup', 11], ['pack-row', 10, 6]]);
    const c = sess('2026-10-26', 'upper-a', [['pushup', 12], ['pack-row', 10, 6]]);
    const nights: Record<string, Night> = {};
    for (let i = 0; i < 5; i++) {
      const k = addDays('2026-10-26', -i);
      nights[k] = { date: k, bed: atOn(addDays(k, -1), '22:30'), wake: atOn(k, '06:00'), source: 'tap', m: 1 };
    }
    const notes = weekNotes({ sessions: { [a.id]: a, [b.id]: b, [c.id]: c }, nights, program: DEFAULT_PROGRAM, settings: DEFAULT_DATA.settings }, '2026-10-26');
    expect(notes[0]).toMatch(/^3 workouts in the last 7 days/);
    expect(notes.join(' ')).toMatch(/Going up .*Push-up/);
    expect(notes.join(' ')).toMatch(/Same best set 3 times in a row: Backpack row/);
    expect(notes.join(' ')).toMatch(/Sleep averaged 7 h 30 m, about 1 h 00 m under your goal/);
    expect(weekNotes({ sessions: {}, nights: {}, program: DEFAULT_PROGRAM, settings: DEFAULT_DATA.settings }, '2026-10-26')[0]).toMatch(/No workouts logged yet/);
  });
});

describe('monthGrid', () => {
  it('lays out a month in Monday-first weeks', () => {
    const oct = monthGrid('2026-10-15');
    expect(oct[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
    expect(oct.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
    expect(monthGrid('2026-02-01').flat().filter(Boolean)).toHaveLength(28);
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });
});

describe('nextPlanned', () => {
  it('finds the next scheduled workout within a week, or none', () => {
    const p = { ...DEFAULT_PROGRAM, week: [null, null, 'upper-a', null, null, null, null] };
    expect(nextPlanned(p, '2026-10-26')).toMatchObject({ date: '2026-10-28', day: { id: 'upper-a' } });
    expect(nextPlanned(p, '2026-10-28')!.date).toBe('2026-11-04');
    expect(nextPlanned({ ...p, week: Array(7).fill(null) }, '2026-10-26')).toBeNull();
  });
});

describe('vsLast', () => {
  it('compares with the last session of the same plan day only', () => {
    const a = sess('2026-10-20', 'upper-a', [['pushup', 10], ['pushup', 9]]);
    const b = sess('2026-10-22', 'lower-a', [['squat', 20]]);
    const c = sess('2026-10-27', 'upper-a', [['pushup', 12], ['pushup', 10], ['pushup', 8]]);
    const all = { [a.id]: a, [b.id]: b, [c.id]: c };
    expect(vsLast(c, all)).toEqual({ date: '2026-10-20', reps: 11, sets: 1 });
    expect(vsLast(a, all)).toBeNull();
  });
});

describe('backupDue', () => {
  const D = 86_400_000;
  const base = { synced: false, sessions: 4, nights: 3, backupAt: null, snooze: null };
  it('nudges only without sync, with data, after 30 days or never, and not while snoozed', () => {
    expect(backupDue(100 * D, base)).toBe(true);
    expect(backupDue(100 * D, { ...base, synced: true })).toBe(false);
    expect(backupDue(100 * D, { ...base, sessions: 1, nights: 2 })).toBe(false);
    expect(backupDue(100 * D, { ...base, backupAt: 80 * D })).toBe(false);
    expect(backupDue(100 * D, { ...base, backupAt: 60 * D })).toBe(true);
    expect(backupDue(100 * D, { ...base, snooze: 101 * D })).toBe(false);
  });
});

describe('bestText', () => {
  it('reads reps, seconds and backpack load', () => {
    expect(bestText({ reps: 12, loadKg: 0 }, { unit: 'reps' })).toBe('best 12 reps');
    expect(bestText({ reps: 40, loadKg: 0 }, { unit: 'secs' })).toBe('best 40 s');
    expect(bestText({ reps: 10, loadKg: 8 }, { unit: 'reps' })).toBe('best 10 @ 8 kg');
    expect(bestText(undefined, { unit: 'reps' })).toBeUndefined();
  });
});
