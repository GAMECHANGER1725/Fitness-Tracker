// The home → gym migration: nothing logged since 27 Oct 2026 may be lost.
import { describe, expect, it } from 'vitest';
import { HOME_BACKUP_KEY, isV1, keepHomeBackup, migrate } from '../src/lib/migrate';
import { exportJson, importJson, normalize } from '../src/lib/backup';
import { mergeDocs, parseDoc, toDoc } from '../src/lib/syncdoc';
import { historyOf, records } from '../src/lib/progress';
import { DEFAULT_PROGRAM } from '../src/lib/program';
import { EX } from '../src/lib/exercises';
import { computeGame } from '../src/lib/game';
import { atOn } from '../src/lib/dates';

// The home plan exactly as the old version stored it.
const S = (exerciseId: string, sets: number, low: number, high: number, restS = 90, loadKg = 0) => ({ exerciseId, sets, low, high, restS, loadKg });
const HOME_PROGRAM = {
  days: [
    { id: 'upper-a', name: 'Upper A', slots: [S('pushup', 4, 8, 15), S('pack-row', 4, 10, 15, 90, 8), S('pike-pushup', 3, 6, 10), S('pack-curl', 3, 10, 15, 60, 4), S('ytw', 2, 8, 12, 45), S('grip-squeeze', 3, 15, 25, 45)] },
    { id: 'lower-a', name: 'Lower A', slots: [S('pack-squat', 4, 10, 15, 90, 6), S('pack-rdl', 3, 10, 15, 90, 6), S('split-squat', 3, 8, 12, 60), S('calf-raise', 3, 12, 20, 45), S('plank', 3, 30, 60, 45)] },
    { id: 'upper-b', name: 'Upper B', slots: [S('diamond-pushup', 3, 6, 12), S('one-arm-row', 4, 8, 12, 60, 6), S('chair-dip', 3, 8, 15, 60), S('pack-reverse-fly', 3, 12, 15, 45, 2), S('hollow-hold', 3, 20, 40, 45), S('pack-farmer', 3, 30, 60, 60, 8)] },
    { id: 'lower-b', name: 'Lower B', slots: [S('bulgarian', 3, 8, 12, 75), S('single-leg-bridge', 3, 10, 15, 60), S('step-up', 3, 10, 12, 60), S('wall-sit', 2, 30, 60, 60), S('side-plank', 2, 20, 40, 45), S('grip-hold', 3, 20, 40, 45)] },
  ],
  week: ['upper-a', 'lower-a', null, 'upper-b', 'lower-b', null, null],
  deloadUntil: null,
};

/** A realistic v1 save: workouts and nights from Tue 27 Oct to Tue 10 Nov 2026. */
function v1Save() {
  const sessions: Record<string, unknown> = {};
  const plan: [string, string][] = [
    ['2026-10-27', 'lower-a'], ['2026-10-29', 'upper-b'], ['2026-10-30', 'lower-b'],
    ['2026-11-02', 'upper-a'], ['2026-11-03', 'lower-a'], ['2026-11-05', 'upper-b'], ['2026-11-06', 'lower-b'],
    ['2026-11-09', 'upper-a'], ['2026-11-10', 'lower-a'],
  ];
  plan.forEach(([date, dayId], i) => {
    const day = HOME_PROGRAM.days.find((d) => d.id === dayId)!;
    const start = atOn(date, '16:30');
    sessions[`h${i}`] = {
      id: `h${i}`, date, dayId, name: day.name, start, end: start + 40 * 60_000, feel: 4, note: i === 3 ? 'Push-ups felt better' : undefined, upd: start + 1,
      sets: day.slots.flatMap((s, j) => Array.from({ length: s.sets }, (_, k) => ({ id: `h${i}-${j}-${k}`, exerciseId: s.exerciseId, reps: s.exerciseId === 'pushup' ? 3 : s.low + (i % 3), loadKg: s.loadKg, rpe: 8, at: start + (j * 10 + k) * 60_000 }))),
    };
  });
  const nights: Record<string, unknown> = {};
  for (let d = 27; d <= 31; d++) nights[`2026-10-${d}`] = { date: `2026-10-${d}`, bed: atOn(`2026-10-${d - 1}`, '21:30'), wake: atOn(`2026-10-${d}`, '06:03'), quality: 4, source: 'tap', m: 5 };
  for (let d = 1; d <= 11; d++) {
    const k = `2026-11-${String(d).padStart(2, '0')}`;
    nights[k] = { date: k, bed: null, wake: atOn(k, '06:05'), source: d % 2 ? 'samsung' : 'manual', deep: 80, rem: 95, light: 260, awake: 20, score: 82, m: 7 };
  }
  return {
    v: 1,
    profile: { name: 'Vaidik', age: 15, sex: 'male', heightCm: 182, weightKg: 58.3, packMaxKg: 15, hasGrip: true },
    settings: { wakeTarget: '06:00', sleepGoalH: 8.5, bedtime: '21:00', workoutTime: '16:30', theme: 'dark', aiKey: 'sk-mine', aiModel: 'm', geminiKey: '', geminiModel: 'g', aiFirst: 'deepseek' },
    program: HOME_PROGRAM,
    programLog: [{ at: atOn('2026-11-02', '17:15'), by: 'auto', why: 'After Upper A', lines: ['Backpack row: 6 → 8 kg'], before: { ...HOME_PROGRAM, days: HOME_PROGRAM.days.map((d) => ({ ...d, slots: d.slots.map((s) => (s.exerciseId === 'pack-row' ? { ...s, loadKg: 6 } : s)) })) } }],
    sessions,
    nights,
    active: { dayId: 'upper-a', name: 'Upper A', date: '2026-11-11', start: atOn('2026-11-11', '16:30'), slots: HOME_PROGRAM.days[0].slots, sets: [], idx: 0, restEnd: null },
    seen: { badges: ['first', 'wake7'] },
    tomb: { gone1: atOn('2026-11-01', '10:00'), 'night:2026-10-26': atOn('2026-11-01', '10:00') },
    mod: atOn('2026-11-02', '17:15'),
  };
}

const NOW = atOn('2026-11-11', '19:00');

describe('home → gym migration', () => {
  const old = v1Save();
  const d = normalize(migrate(old, NOW));

  it('recognises the old save and leaves a v2 save alone', () => {
    expect(isV1(old)).toBe(true);
    expect(isV1(d)).toBe(false);
    expect(migrate(d)).toBe(d);
    expect(normalize(d)).toEqual(d);
  });

  it('keeps every workout and every set exactly as logged', () => {
    expect(Object.keys(d.sessions)).toHaveLength(9);
    for (const [id, s] of Object.entries(old.sessions) as [string, { sets: { id: string }[]; date: string; start: number; end: number }][]) {
      const got = d.sessions[id];
      expect(got, id).toBeTruthy();
      expect(got).toMatchObject({ date: s.date, start: s.start, end: s.end, feel: 4 });
      expect(got.sets).toEqual((s.sets as unknown[]).map((x) => ({ ...(x as object), repsR: undefined, rir: undefined })));
    }
    expect(d.sessions.h3.note).toBe('Push-ups felt better');
    expect(d.sessions.h0.date).toBe('2026-10-27');
  });

  it('keeps every night, the settings, the keys, badges and deletions', () => {
    expect(d.nights).toEqual(normalize({ ...old, v: 2 }).nights);
    expect(Object.keys(d.nights)).toHaveLength(16);
    expect(d.nights['2026-11-03']).toMatchObject({ source: 'samsung', deep: 80, score: 82 });
    expect(d.settings).toMatchObject({ bedtime: '21:00', wakeTarget: '06:00', sleepGoalH: 8.5, theme: 'dark', aiKey: 'sk-mine' });
    // Two deliberate changes for the gym start: morning sessions, and the age and weight given on 11 Nov.
    expect(d.settings.workoutTime).toBe('06:30');
    expect(d.profile).toMatchObject({ age: 14, weightKg: 60 });
    expect(d.seen.badges).toEqual(['first', 'wake7']);
    expect(d.tomb).toEqual(old.tomb);
    expect(d.profile).toMatchObject({ name: 'Vaidik', heightCm: 182, packMaxKg: 15, hasGrip: true });
  });

  it('archives the home plan and its change log, and starts the gym plan with onboarding', () => {
    expect(d.home?.program.days.map((x) => x.id)).toEqual(['upper-a', 'lower-a', 'upper-b', 'lower-b']);
    expect(d.home?.program.days[0].slots).toEqual(HOME_PROGRAM.days[0].slots);
    expect(d.home?.programLog[0].lines).toEqual(['Backpack row: 6 → 8 kg']);
    expect(d.home?.at).toBe(NOW);
    expect(d.program).toEqual(DEFAULT_PROGRAM);
    expect(d.programLog).toEqual([]);
    expect(d.onboarded).toBe(false);
    expect(d.active).toBeNull();
    expect(d.measures).toEqual({});
    expect(d.mod).toBe(NOW);
  });

  it('still knows every exercise in the old log, so history, bests and "last time" work', () => {
    const ids = new Set(Object.values(d.sessions).flatMap((s) => s.sets.map((x) => x.exerciseId)));
    for (const id of ids) expect(EX[id], id).toBeTruthy();
    expect(records(d.sessions)['pack-row']).toMatchObject({ loadKg: 8, date: '2026-11-09' });
    // Moves the gym plan shares with the home plan carry their history over.
    expect(historyOf(d.sessions, 'plank').length).toBe(3);
    expect(historyOf(d.sessions, 'pushup')[0][0].reps).toBe(3);
    expect(computeGame(d, '2026-11-11').sessions).toBe(9);
  });

  it('migrates an old backup file on import, and round-trips a new one', () => {
    const oldBackup = JSON.stringify({ app: 'fitness-tracker', v: 1, exportedAt: 'x', data: old });
    const back = importJson(oldBackup);
    expect(Object.keys(back.sessions)).toHaveLength(9);
    expect(back.home?.program.days).toHaveLength(4);
    expect(back.onboarded).toBe(false);
    const withMeasure = { ...d, onboarded: true, measures: { '2026-11-11': { date: '2026-11-11', weightKg: 60, pushups: 3.5, plankS: 90, chinups: 0, pullups: 0, m: 1 } } };
    const again = importJson(exportJson(withMeasure));
    expect(again).toEqual({ ...withMeasure, settings: { ...withMeasure.settings, aiKey: '', geminiKey: '' } });
  });

  it('reads the old sync file, and a device already on the gym plan wins the plan', () => {
    const { aiKey: _a, aiModel: _m, geminiKey: _g, geminiModel: _gm, aiFirst: _f, theme: _t, ...settings } = old.settings;
    const gist = JSON.stringify({ v: 1, sessions: old.sessions, nights: old.nights, tomb: old.tomb, mod: old.mod, small: { profile: old.profile, settings, program: old.program, programLog: old.programLog } });
    const remote = parseDoc(gist);
    expect(remote.v).toBe(2);
    expect(Object.keys(remote.sessions)).toHaveLength(9);
    expect(remote.small.home?.program.days).toHaveLength(4);
    expect(remote.mod).toBe(old.mod);
    const local = toDoc({ ...d, onboarded: true, program: { ...DEFAULT_PROGRAM, start: '2026-11-12' } });
    const merged = mergeDocs(local, remote, NOW);
    expect(merged.small.onboarded).toBe(true);
    expect(merged.small.program.start).toBe('2026-11-12');
    expect(Object.keys(merged.sessions)).toHaveLength(9);
  });

  it('keeps one untouched copy of the old save before the first rewrite', () => {
    const mem = new Map<string, string>([['fitness-v1', JSON.stringify({ state: old, version: 1 })]]);
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(keepHomeBackup(storage, 'fitness-v1')).toBe(true);
    expect(JSON.parse(mem.get(HOME_BACKUP_KEY)!).state.sessions.h0.date).toBe('2026-10-27');
    mem.set('fitness-v1', JSON.stringify({ state: d, version: 2 }));
    expect(keepHomeBackup(storage, 'fitness-v1')).toBe(false);
    expect(JSON.parse(mem.get(HOME_BACKUP_KEY)!).version).toBe(1);
  });

  it('copes with junk', () => {
    expect(normalize(migrate(null)).v).toBe(2);
    expect(normalize(migrate({ v: 1 })).sessions).toEqual({});
    expect(normalize(migrate({ v: 1, program: 'nope' })).home).toBeNull();
  });
});
