import { describe, expect, it } from 'vitest';
import { clock12, durationMin, guardBedtime, idealBedtime, mergeImported, nightKey, onTime, readCsv, samsungNights, samsungTime, sleepStats, wakeStreak, nightPos, toBedtime, windDownEffect } from '../src/lib/sleep';
import { addDays, atOn } from '../src/lib/dates';
import type { Night } from '../src/lib/types';

const N = (date: string, bed: string, wake: string, extra: Partial<Night> = {}): Night => {
  const b = atOn(addDays(date, bed < '12:00' ? 0 : -1), bed);
  return { date, bed: b, wake: atOn(date, wake), source: 'tap', m: 1, ...extra };
};

describe('nights', () => {
  it('keys a night by the morning you woke up', () => {
    expect(nightKey(atOn('2026-10-26', '21:50'))).toBe('2026-10-27');
    expect(nightKey(atOn('2026-10-27', '00:30'))).toBe('2026-10-27');
  });
  it('works out hours across midnight and takes off time awake', () => {
    expect(durationMin(N('2026-10-27', '21:52', '06:04'))).toBe(8 * 60 + 12);
    expect(durationMin(N('2026-10-27', '21:52', '06:04', { awake: 12 }))).toBe(8 * 60);
    expect(durationMin({ bed: null, wake: 5 })).toBeNull();
  });
  it('picks a bedtime that fits the goal before a 6:00 wake', () => {
    expect(idealBedtime('06:00', 8.5)).toBe('21:15');
    expect(idealBedtime('06:00', 9)).toBe('20:45');
    expect(clock12('21:15')).toBe('9:15 pm');
    expect(clock12('06:00')).toBe('6:00 am');
  });
  it('counts up within 15 minutes as on time, and streaks', () => {
    expect(onTime(N('2026-10-27', '21:30', '06:15'), '06:00')).toBe(true);
    expect(onTime(N('2026-10-27', '21:30', '06:16'), '06:00')).toBe(false);
    const nights: Record<string, Night> = {};
    for (const [d, w] of [['2026-10-27', '06:01'], ['2026-10-26', '05:58'], ['2026-10-25', '06:10'], ['2026-10-24', '07:40'], ['2026-10-23', '06:00']]) nights[d] = N(d, '21:30', w);
    expect(wakeStreak(nights, '2026-10-27', '06:00')).toBe(3);
    // Before you've tapped "I'm up" today, the streak still counts from yesterday.
    expect(wakeStreak(nights, '2026-10-28', '06:00')).toBe(3);
  });
});

describe('sleep stats', () => {
  it('averages hours, debt, consistency and weekend drift', () => {
    const nights: Record<string, Night> = {};
    // 2026-10-26 is a Monday. Sat and Sun mornings follow later bedtimes.
    for (let i = 0; i < 7; i++) {
      const d = addDays('2026-10-26', -i);
      const wkend = ['2026-10-24', '2026-10-25'].includes(d);
      nights[d] = N(d, wkend ? '22:45' : '21:45', '06:00', { quality: wkend ? 3 : 4 });
    }
    const s = sleepStats(nights, '2026-10-26', 7, 8.5, '06:00');
    expect(s.nights).toBe(7);
    expect(s.onTime).toBe(7);
    expect(s.weekendDrift).toBe(60);
    expect(s.avgMin).toBe(Math.round((5 * (8 * 60 + 15) + 2 * (7 * 60 + 15)) / 7));
    expect(s.debtMin).toBe(5 * 15 + 2 * 75);
    expect(s.avgBed).toBe('22:02');
    expect(s.bedSpread).toBeGreaterThan(20);
  });
});

describe('guardBedtime', () => {
  it('moves at most 30 minutes and stays in the 8–10 h window', () => {
    expect(guardBedtime('21:15', '20:00', '06:00')).toBe('20:45');
    expect(guardBedtime('21:15', '21:30', '06:00')).toBe('21:30');
    expect(guardBedtime('21:30', '22:30', '06:00')).toBe('21:45');
    expect(guardBedtime('20:00', '19:00', '06:00')).toBe('19:45');
    expect(guardBedtime('21:15', 'whenever', '06:00')).toBe('21:15');
  });
});

const SLEEP_CSV = [
  'com.samsung.shealth.sleep,6313002,7',
  'original_efficiency,com.samsung.health.sleep.start_time,sleep_score,com.samsung.health.sleep.end_time,com.samsung.health.sleep.time_offset,com.samsung.health.sleep.datauuid,',
  '92.1,2026-10-26 10:52:00.000,81,2026-10-26 19:04:00.000,UTC+1100,abc-1,',
  '90.0,2026-10-25 11:40:00.000,74,2026-10-25 19:01:00.000,UTC+1100,abc-2,',
  '80.0,2026-10-25 03:00:00.000,0,2026-10-25 03:40:00.000,UTC+1100,nap,',
].join('\n');
const STAGE_CSV = [
  'com.samsung.health.sleep_stage,6312002,4',
  'start_time,sleep_id,stage,time_offset,end_time,datauuid',
  '2026-10-26 10:52:00.000,abc-1,40002,UTC+1100,2026-10-26 12:52:00.000,s1',
  '2026-10-26 12:52:00.000,abc-1,40003,UTC+1100,2026-10-26 14:22:00.000,s2',
  '2026-10-26 14:22:00.000,abc-1,40004,UTC+1100,2026-10-26 16:22:00.000,s3',
  '2026-10-26 16:22:00.000,abc-1,40001,UTC+1100,2026-10-26 16:32:00.000,s4',
].join('\n');

describe('Samsung Health import', () => {
  it('reads the CSV headers by their short names', () => {
    const rows = readCsv(SLEEP_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0].start_time).toBe('2026-10-26 10:52:00.000');
    expect(rows[0].datauuid).toBe('abc-1');
  });
  it('reads times as UTC', () => {
    expect(samsungTime('2026-10-26 10:52:00.000')).toBe(Date.UTC(2026, 9, 26, 10, 52));
    expect(samsungTime('junk')).toBeNull();
  });
  it('turns the export into nights with stages, skipping naps', () => {
    const nights = samsungNights([STAGE_CSV, SLEEP_CSV], 99);
    expect(nights).toHaveLength(2);
    const last = nights.find((n) => n.bed === Date.UTC(2026, 9, 26, 10, 52))!;
    expect(last).toMatchObject({ source: 'samsung', deep: 90, rem: 120, light: 120, awake: 10, score: 81, m: 99 });
    expect(last.wake! - last.bed!).toBe((8 * 60 + 12) * 60_000);
  });
  it('keeps hand-entered nights, your quality rating and wind-down ticks', () => {
    const cur: Record<string, Night> = {
      a: { date: 'a', bed: 1, wake: 2, source: 'manual', m: 1 },
      b: { date: 'b', bed: 1, wake: 2, quality: 4, done: ['Read'], source: 'tap', m: 1 },
    };
    const { nights, count } = mergeImported(cur, [
      { date: 'a', bed: 5, wake: 9, source: 'samsung', m: 2 },
      { date: 'b', bed: 5, wake: 9, source: 'samsung', m: 2 },
    ]);
    expect(count).toBe(1);
    expect(nights.a.bed).toBe(1);
    expect(nights.b).toMatchObject({ bed: 5, quality: 4, done: ['Read'], source: 'samsung' });
  });
});

describe('toBedtime', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m).getTime();
  it('counts down to lights out and past it, across midnight', () => {
    expect(toBedtime(at(21, 15), '22:00')).toBe(45);
    expect(toBedtime(at(22, 20), '22:00')).toBe(-20);
    expect(toBedtime(at(0, 30), '22:00')).toBe(-150);
    expect(toBedtime(at(23, 0), '00:30')).toBe(90);
  });
});

describe('nightPos', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m).getTime();
  it('places times on an 8 pm to 8 am axis and clamps the rest', () => {
    expect(nightPos(at(20))).toBe(0);
    expect(nightPos(at(21, 30))).toBe(90);
    expect(nightPos(at(6))).toBe(600);
    expect(nightPos(at(9))).toBe(720);
    expect(nightPos(at(18))).toBe(0);
  });
});

describe('windDownEffect', () => {
  const n = (date: string, hours: number, done?: string[]): Night => ({ date, bed: atOn(date, '06:00') - hours * 3_600_000, wake: atOn(date, '06:00'), done, source: 'tap', m: 1 });
  it('compares nights with the whole checklist ticked against the rest, once each side has 3', () => {
    const steps = ['Screens off', 'Teeth'];
    const all: Record<string, Night> = {};
    ['2026-10-20', '2026-10-21', '2026-10-22'].forEach((d) => (all[d] = n(d, 9, steps)));
    ['2026-10-23', '2026-10-24'].forEach((d) => (all[d] = n(d, 7.5, ['Teeth'])));
    expect(windDownEffect(all, steps, '2026-10-29')).toBeNull();
    all['2026-10-25'] = n('2026-10-25', 7.5);
    expect(windDownEffect(all, steps, '2026-10-29')).toEqual({ full: 540, partial: 450 });
    expect(windDownEffect({ a: n('2026-10-25', 8) }, steps, '2026-10-29')).toBeNull();
  });
});
