import { describe, expect, it } from 'vitest';
import { parseBriefing, parseReview, parseSwap, parseTonight, snapshot } from '../src/lib/coach';
import { DEFAULT_DATA } from '../src/lib/backup';
import { DEFAULT_PROGRAM } from '../src/lib/program';
import { atOn } from '../src/lib/dates';

const d = DEFAULT_DATA;
const days = (patch: (slots: typeof DEFAULT_PROGRAM.days[0]['slots']) => unknown) => ({ days: [{ id: 'upper-a', slots: patch(DEFAULT_PROGRAM.days[0].slots) }] });

describe('weekly check-in reply', () => {
  it('keeps allowed changes and the bedtime inside its limits', () => {
    const raw = `Sure! {"summary":"Good week.","focus":["Eat more on rest days","a","b","c"],"program":${JSON.stringify(days((s) => s.map((x) => (x.exerciseId === 'pike-pushup' ? { ...x, exerciseId: 'elevated-pike' } : x))))},"deload":false,"sleep":{"status":"late","bedtime":"20:00","habits":["Screens off by 8:30"],"note":"Weekends drift."}}`;
    const r = parseReview(raw, d, '2026-10-26', 'm');
    expect(r.lines).toEqual(['Upper A: Pike push-up → Feet-up pike push-up']);
    expect(r.focus).toHaveLength(3);
    expect(r.sleep).toMatchObject({ status: 'late', bedtime: '20:45', prevBedtime: '21:15' });
    expect(r.applied).toBe(false);
  });
  it('ignores made-up exercises and unknown statuses', () => {
    const raw = JSON.stringify({ summary: '', focus: 'x', program: days((s) => [...s, { exerciseId: 'bench-press', sets: 5, low: 5, high: 5 }]), deload: false, sleep: { status: 'great', bedtime: 'late', habits: [], note: '' } });
    const r = parseReview(raw, d, '2026-10-26', 'm');
    expect(r.lines).toEqual([]);
    expect(r.sleep.status).toBe('need-data');
    expect(r.sleep.bedtime).toBe('21:15');
  });
  it('allows a lighter week, but not two within 3 weeks', () => {
    const raw = JSON.stringify({ summary: 's', focus: [], program: { days: [] }, deload: true, sleep: { status: 'short', bedtime: '21:15', habits: [], note: '' } });
    expect(parseReview(raw, d, '2026-10-26', 'm').program.deloadUntil).toBe('2026-11-01');
    const recent = { ...d, program: { ...d.program, deloadUntil: '2026-10-15' } };
    expect(parseReview(raw, recent, '2026-10-26', 'm').program.deloadUntil).toBe('2026-10-15');
  });
  it('throws on a reply with no JSON', () => {
    expect(() => parseReview('I could not do that', d, '2026-10-26', 'm')).toThrow();
  });
});

describe('other coach replies', () => {
  it('reads the briefing', () => {
    expect(parseBriefing('{"headline":"Go","train":"t","food":"f","sleep":"s"}', 'x')).toMatchObject({ headline: 'Go', date: 'x' });
    expect(() => parseBriefing('{}', 'x')).toThrow();
  });
  it('keeps screens-off before bedtime', () => {
    expect(parseTonight('{"screensOff":"20:35","lastFood":"milk","plan":"p"}', 'x', '21:15').screensOff).toBe('20:35');
    expect(parseTonight('{"screensOff":"23:00","lastFood":"","plan":""}', 'x', '21:15').screensOff).toBe('20:35');
    expect(parseTonight('{"screensOff":"nope"}', 'x', '00:10').screensOff).toBe('23:30');
  });
  it('only swaps to a library exercise of the same pattern', () => {
    expect(parseSwap('{"exerciseId":"incline-pushup","why":"wrist"}', d, 'pushup').exerciseId).toBe('incline-pushup');
    expect(() => parseSwap('{"exerciseId":"pack-squat","why":""}', d, 'pushup')).toThrow();
    expect(() => parseSwap('{"exerciseId":"dumbbell-press","why":""}', d, 'pushup')).toThrow();
    expect(() => parseSwap('{"exerciseId":"grip-hold","why":""}', { ...d, profile: { ...d.profile, hasGrip: false } }, 'grip-squeeze')).toThrow();
  });
});

describe('snapshot', () => {
  it('includes sleep, training and Fuel Log', () => {
    const today = new Date();
    const k = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const data = { ...d, nights: { [k]: { date: k, bed: atOn(k, '00:30'), wake: atOn(k, '06:02'), quality: 4, source: 'tap' as const, m: 1 } } };
    const fuel = { targets: { kcal: 3050, protein: 115, carbs: 456, fat: 85 }, weighIns: [{ date: k, kg: 59 }], profileKg: 58, days: { [k]: { kcal: 1000, protein: 40, carbs: 100, fat: 30, items: 2, first: null, last: null } } };
    const s = snapshot(data, fuel);
    expect(s.sleep.nights[0]).toMatchObject({ wake: '6:02', hours: 5.5 });
    expect(s.fuel?.left).toMatchObject({ kcal: 2050, protein: 75 });
    expect(s.profile.weightKg).toBe(59);
    expect(s.program.week[0]).toBe('Mon: Upper A');
    expect(JSON.stringify(s)).not.toContain('aiKey');
  });
});
