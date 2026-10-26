import { describe, expect, it } from 'vitest';
import { applyDoc, mergeDocs, nightTomb, parseDoc, sameDoc, toDoc } from '../src/lib/syncdoc';
import { DEFAULT_DATA } from '../src/lib/backup';
import { aiConfig, fuelAi, fuelToken, mergeFuel, parseFuelGist, parseFuelStore, weightOf } from '../src/lib/fuel';
import type { AppData, Session } from '../src/lib/types';

const S = (id: string, upd: number, date = '2026-10-26'): Session => ({ id, date, dayId: 'upper-a', name: 'Upper A', start: upd, end: upd + 1, sets: [{ id: `${id}-1`, exerciseId: 'pushup', reps: 10, loadKg: 0, at: upd }], upd });
const data = (p: Partial<AppData>): AppData => ({ ...DEFAULT_DATA, ...p });
const NOW = Date.UTC(2026, 9, 26);

describe('sync doc', () => {
  it('leaves per-device fields out', () => {
    const doc = toDoc(data({ settings: { ...DEFAULT_DATA.settings, aiKey: 'k', geminiKey: 'g', theme: 'light' }, active: null }));
    const text = JSON.stringify(doc);
    expect(text).not.toContain('"aiKey"');
    expect(text).not.toContain('"theme"');
    expect(text).not.toContain('"active"');
  });
  it('is canonical, so equal data compares equal', () => {
    const a = toDoc(data({ sessions: { x: S('x', 1), y: S('y', 2) } }));
    const b = toDoc(data({ sessions: { y: S('y', 2), x: S('x', 1) } }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(sameDoc(parseDoc(JSON.stringify(a)), a)).toBe(true);
  });
  it('keeps workouts from both devices and the newer edit of the same one', () => {
    const a = toDoc(data({ sessions: { x: S('x', 1), y: S('y', 5) } }));
    const b = toDoc(data({ sessions: { y: { ...S('y', 9), note: 'edited' }, z: S('z', 3) } }));
    const m = mergeDocs(a, b, NOW);
    expect(Object.keys(m.sessions).sort()).toEqual(['x', 'y', 'z']);
    expect(m.sessions.y.note).toBe('edited');
  });
  it('keeps deleted workouts and nights deleted', () => {
    const a = toDoc(data({ tomb: { x: NOW - 1000, [nightTomb('2026-10-26')]: NOW - 500 } }));
    const b = toDoc(data({ sessions: { x: S('x', 1) }, nights: { '2026-10-26': { date: '2026-10-26', bed: 1, wake: 2, source: 'tap', m: NOW - 900 } } }));
    const m = mergeDocs(a, b, NOW);
    expect(m.sessions).toEqual({});
    expect(m.nights).toEqual({});
  });
  it('brings back a night edited after it was deleted', () => {
    const a = toDoc(data({ tomb: { [nightTomb('2026-10-26')]: NOW - 500 } }));
    const b = toDoc(data({ nights: { '2026-10-26': { date: '2026-10-26', bed: 1, wake: 2, source: 'tap', m: NOW - 100 } } }));
    expect(Object.keys(mergeDocs(a, b, NOW).nights)).toEqual(['2026-10-26']);
  });
  it('takes the newer night per date', () => {
    const a = toDoc(data({ nights: { d: { date: 'd', bed: 1, wake: 2, source: 'tap', m: 5 } } }));
    const b = toDoc(data({ nights: { d: { date: 'd', bed: 1, wake: 2, quality: 5, source: 'tap', m: 7 } } }));
    expect(mergeDocs(a, b, NOW).nights.d.quality).toBe(5);
  });
  it('takes the whole profile/program block from the newest change', () => {
    const a = toDoc(data({ mod: 10, settings: { ...DEFAULT_DATA.settings, bedtime: '21:00' } }));
    const b = toDoc(data({ mod: 20, settings: { ...DEFAULT_DATA.settings, bedtime: '21:30' } }));
    const m = mergeDocs(a, b, NOW);
    expect(m.small.settings.bedtime).toBe('21:30');
    const local = applyDoc(data({ settings: { ...DEFAULT_DATA.settings, aiKey: 'mine', theme: 'dark' } }), m);
    expect(local.settings).toMatchObject({ bedtime: '21:30', aiKey: 'mine', theme: 'dark' });
  });
  it('refuses a file that is not ours', () => {
    expect(() => parseDoc('{"v":1,"days":{}}')).toThrow();
  });
});

// Fuel Log's own formats (see fuel-log/src/lib/store.ts and syncdoc.ts).
const entry = (id: string, at: number, kcal: number, protein: number, qty = 1) => ({ id, name: 'Food', serving: '1', base: { kcal, protein, carbs: 10, fat: 5 }, qty, source: 'db', at });
const fuelLocal = JSON.stringify({
  state: {
    v: 3,
    settings: { targets: { kcal: 3050, protein: 115, carbs: 456, fat: 85 }, aiKey: 'th-key', aiModel: 'deepseek-v4.1-flash:free', geminiKey: '', geminiModel: '', aiFirst: 'deepseek' },
    profile: { weightKg: 58.3 },
    weighIns: [{ date: '2026-10-20', kg: 58.6 }, { date: '2026-10-25', kg: 58.9 }],
    days: { '2026-10-26': { entries: [entry('a', 1000, 500, 20, 2), entry('dead', 1500, 900, 10)], water: 2, checks: {} } },
    tomb: { dead: 1 },
    mod: 100,
  },
  version: 3,
});
const fuelGist = JSON.stringify({
  v: 1,
  days: { '2026-10-26': { entries: [entry('a', 1000, 500, 20, 2), entry('b', 2000, 300, 15), entry('dead', 1500, 900, 10)], water: 3, checks: {} }, '2026-10-25': { entries: [entry('c', 500, 2800, 110)], water: 0, checks: {} } },
  tomb: {},
  mod: 50,
  small: { settings: { targets: { kcal: 2900, protein: 110, carbs: 400, fat: 80 } }, weighIns: [], profile: { weightKg: 58 } },
});

describe('Fuel Log link', () => {
  it('reads Fuel Log’s save on this phone', () => {
    const f = mergeFuel(parseFuelStore(fuelLocal), null)!;
    expect(f.targets?.kcal).toBe(3050);
    expect(f.days['2026-10-26']).toMatchObject({ kcal: 1000, protein: 40, items: 1, first: 1000, last: 1000 });
    expect(weightOf(f, 50)).toBe(58.9);
  });
  it('joins the gist and the local save by entry id, minus deletions, newest settings', () => {
    const f = mergeFuel(parseFuelStore(fuelLocal), parseFuelGist(fuelGist))!;
    expect(f.days['2026-10-26']).toMatchObject({ kcal: 1300, protein: 55, items: 2, last: 2000 });
    expect(f.days['2026-10-25'].kcal).toBe(2800);
    expect(f.targets?.kcal).toBe(3050);
  });
  it('copes with nothing or junk', () => {
    expect(mergeFuel(null, null)).toBeNull();
    expect(parseFuelStore('nope')).toBeNull();
    expect(parseFuelGist('{"v":2}')).toBeNull();
    expect(weightOf(null, 58.3)).toBe(58.3);
  });
  it('uses Fuel Log’s AI key unless this app has its own', () => {
    const own = { ...DEFAULT_DATA.settings };
    expect(aiConfig(own, fuelAi(fuelLocal)).aiKey).toBe('th-key');
    expect(aiConfig({ ...own, geminiKey: 'mine' }, fuelAi(fuelLocal))).toMatchObject({ aiKey: '', geminiKey: 'mine' });
    expect(aiConfig(own, fuelAi(null)).aiKey).toBe('');
  });
  it('finds Fuel Log’s GitHub token', () => {
    expect(fuelToken('{"token":"ghp_x","gistId":"1"}')).toBe('ghp_x');
    expect(fuelToken(null)).toBeNull();
  });
});
