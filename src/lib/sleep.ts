// Sleep and wake-up maths. A night is keyed by the date you woke up (bedtime + 12 h lands on that date,
// so 9:50 pm on the 26th and 00:30 on the 27th both belong to the night of the 27th).
// Teens need 8–10 hours (the default goal is 8.5); the wake target is 6:00 every day.

import type { Night } from './types';
import { addDays, atOn, keyOf } from './dates';

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Up within this long after the target counts as on time. */
/** Labels for Night.quality 1–5. */
export const QUALITY = ['Awful', 'Poor', 'OK', 'Good', 'Great'];

export const ON_TIME_MIN = 15;
/** Minutes it usually takes to fall asleep, added before lights-out. */
export const FALL_ASLEEP_MIN = 15;

export const nightKey = (bed: number) => keyOf(new Date(bed + 12 * HOUR));

/** Minutes asleep (or in bed, for tapped nights), or null when either end is missing. */
export function durationMin(n: Pick<Night, 'bed' | 'wake' | 'awake'>): number | null {
  if (n.bed == null || n.wake == null || n.wake <= n.bed) return null;
  const m = Math.round((n.wake - n.bed) / MIN) - (n.awake ?? 0);
  return m > 0 && m < 20 * 60 ? m : null;
}

export const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} m`;

/** Minutes after midnight of "HH:mm". */
export const minsOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const hhmm = (mins: number) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** "9:15 pm" from "21:15". */
export function clock12(hhmmStr: string): string {
  const m = minsOf(hhmmStr);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export const clockOf = (ms: number) => {
  const d = new Date(ms);
  return clock12(`${d.getHours()}:${d.getMinutes()}`);
};

/** Lights-out time that gives `goalH` hours before the wake target. */
/** Where a clock time sits on a night chart running from `fromHour` (default 8 pm) for 12 h: 0–720 minutes, clamped. */
export function nightPos(ms: number, fromHour = 20): number {
  const d = new Date(ms);
  const m = (((d.getHours() - fromHour) * 60 + d.getMinutes()) % 1440 + 1440) % 1440;
  return m > 1080 ? 0 : Math.min(720, m);
}

/** Minutes from `now` until lights out (negative once it's past), within half a day either side. */
export function toBedtime(now: number, bedtime: string): number {
  const d = new Date(now);
  const diff = minsOf(bedtime) - (d.getHours() * 60 + d.getMinutes());
  return ((((diff + 720) % 1440) + 1440) % 1440) - 720;
}

export const idealBedtime = (wakeTarget: string, goalH: number) => hhmm(minsOf(wakeTarget) - goalH * 60 - FALL_ASLEEP_MIN);

/** Minutes late (positive) or early (negative) against the wake target, for a night's wake time. */
export function wakeOffset(n: Pick<Night, 'date' | 'wake'>, wakeTarget: string): number | null {
  if (n.wake == null) return null;
  return Math.round((n.wake - atOn(n.date, wakeTarget)) / MIN);
}

export const onTime = (n: Pick<Night, 'date' | 'wake'>, wakeTarget: string) => {
  const o = wakeOffset(n, wakeTarget);
  return o != null && o <= ON_TIME_MIN;
};

/** Days in a row up on time, counting back from today (or yesterday, if today has no wake yet). */
export function wakeStreak(nights: Record<string, Night>, today: string, wakeTarget: string): number {
  let k = nights[today]?.wake != null ? today : addDays(today, -1);
  let n = 0;
  while (nights[k] && onTime(nights[k], wakeTarget)) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

/** Bedtime as minutes from 6 pm, so 9 pm and 1 am compare the right way round. */
const bedMins = (bed: number) => {
  const d = new Date(bed);
  return (d.getHours() * 60 + d.getMinutes() - 18 * 60 + 1440) % 1440;
};

export interface SleepStats {
  nights: number;
  avgMin: number | null;
  /** Hours short of the goal over these nights (never negative per night). */
  debtMin: number;
  onTime: number;
  withWake: number;
  /** Standard deviation of bedtime in minutes: under 30 is consistent. */
  bedSpread: number | null;
  avgBed: string | null;
  avgQuality: number | null;
  /** Average bedtime on Friday and Saturday nights minus the rest, in minutes. */
  weekendDrift: number | null;
}

/** Stats over the `days` nights ending on `today`. */
export function sleepStats(nights: Record<string, Night>, today: string, days: number, goalH: number, wakeTarget: string): SleepStats {
  const list: Night[] = [];
  for (let i = 0; i < days; i++) {
    const n = nights[addDays(today, -i)];
    if (n) list.push(n);
  }
  const durs = list.map(durationMin).filter((x): x is number => x != null);
  const beds = list.filter((n) => n.bed != null).map((n) => bedMins(n.bed!));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgBed = mean(beds);
  const sd = avgBed == null || beds.length < 2 ? null : Math.sqrt(beds.reduce((t, b) => t + (b - avgBed) ** 2, 0) / beds.length);
  const q = list.map((n) => n.quality).filter((x): x is number => x != null);
  // A night keyed Saturday or Sunday started on Friday or Saturday evening.
  const wkend = list.filter((n) => n.bed != null && [0, 6].includes(new Date(`${n.date}T12:00:00`).getDay())).map((n) => bedMins(n.bed!));
  const wkday = list.filter((n) => n.bed != null && ![0, 6].includes(new Date(`${n.date}T12:00:00`).getDay())).map((n) => bedMins(n.bed!));
  const we = mean(wkend);
  const wd = mean(wkday);
  return {
    nights: list.length,
    avgMin: durs.length ? Math.round(mean(durs)!) : null,
    debtMin: durs.reduce((t, d) => t + Math.max(0, goalH * 60 - d), 0),
    onTime: list.filter((n) => onTime(n, wakeTarget)).length,
    withWake: list.filter((n) => n.wake != null).length,
    bedSpread: sd == null ? null : Math.round(sd),
    avgBed: avgBed == null ? null : hhmm(avgBed + 18 * 60),
    avgQuality: q.length ? Math.round((mean(q)! + Number.EPSILON) * 10) / 10 : null,
    weekendDrift: we == null || wd == null ? null : Math.round(we - wd),
  };
}

export const BEDTIME_STEP_MAX = 30;

/** Keep a proposed bedtime within 30 min of the current one and inside the 8–10 h window before the wake target. */
export function guardBedtime(cur: string, proposed: unknown, wakeTarget: string): string {
  const p = typeof proposed === 'string' && /^\d{1,2}:\d{2}$/.test(proposed.trim()) ? proposed.trim() : cur;
  const wake = minsOf(wakeTarget);
  // Work in minutes before the wake target: 8 h 15 m to 10 h 15 m before.
  const before = (x: string) => (wake - minsOf(x) + 1440) % 1440;
  const lo = 8 * 60 + FALL_ASLEEP_MIN;
  const hi = 10 * 60 + FALL_ASLEEP_MIN;
  const c = before(cur);
  let b = before(p);
  b = Math.min(c + BEDTIME_STEP_MAX, Math.max(c - BEDTIME_STEP_MAX, b));
  b = Math.min(hi, Math.max(lo, b));
  return hhmm(wake - b);
}

// ----- Samsung Health import --------------------------------------------------------
// ponytail: Samsung Health has no web API. Its "Download personal data" export writes CSV files to the
// phone; we read com.samsung.shealth.sleep.*.csv (start/end, score) and com.samsung.health.sleep_stage.*.csv
// (stages). Columns are matched by name suffix, since Samsung prefixes them and changes the export now and then.

/** Parse one CSV line with quotes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Rows as objects keyed by the short column name (text after the last "."). The first line is Samsung's file tag. */
export function readCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const hi = lines.findIndex((l) => /start_time/.test(l));
  if (hi < 0) return [];
  const head = cells(lines[hi]).map((h) => h.trim().split('.').pop()!);
  return lines.slice(hi + 1).map((l) => {
    const c = cells(l);
    const row: Record<string, string> = {};
    head.forEach((h, i) => h && row[h] === undefined && (row[h] = (c[i] ?? '').trim()));
    return row;
  });
}

/** Samsung times are UTC "2026-10-25 11:52:00.000" with a "UTC+1100" offset column; returns epoch ms. */
export function samsungTime(t: string | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(t ?? '');
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

const STAGE: Record<string, 'awake' | 'light' | 'deep' | 'rem'> = { '40001': 'awake', '40002': 'light', '40003': 'deep', '40004': 'rem' };

/** Nights from Samsung Health CSV texts (sleep file and, optionally, the stage file). Longest sleep per date wins. */
export function samsungNights(texts: string[], now = Date.now()): Night[] {
  const rows = texts.map(readCsv);
  const sleepRows = rows.find((r) => r.length && 'end_time' in r[0] && !('stage' in r[0])) ?? [];
  const stageRows = rows.find((r) => r.length && 'stage' in r[0]) ?? [];
  const stages = new Map<string, Record<string, number>>();
  for (const r of stageRows) {
    const a = samsungTime(r.start_time);
    const b = samsungTime(r.end_time);
    const kind = STAGE[r.stage];
    if (a == null || b == null || !kind || !r.sleep_id) continue;
    const s = stages.get(r.sleep_id) ?? {};
    s[kind] = (s[kind] ?? 0) + Math.round((b - a) / MIN);
    stages.set(r.sleep_id, s);
  }
  const best = new Map<string, Night>();
  for (const r of sleepRows) {
    const bed = samsungTime(r.start_time);
    const wake = samsungTime(r.end_time);
    if (bed == null || wake == null || wake <= bed || wake - bed > 16 * HOUR || wake - bed < 2 * HOUR) continue;
    const st = stages.get(r.datauuid ?? '') ?? {};
    const score = Number(r.sleep_score);
    const n: Night = {
      date: nightKey(bed),
      bed,
      wake,
      source: 'samsung',
      ...(st.deep != null ? { deep: st.deep } : {}),
      ...(st.rem != null ? { rem: st.rem } : {}),
      ...(st.light != null ? { light: st.light } : {}),
      ...(st.awake != null ? { awake: st.awake } : {}),
      ...(Number.isFinite(score) && score > 0 ? { score: Math.round(score) } : {}),
      m: now,
    };
    const prev = best.get(n.date);
    if (!prev || wake - bed > prev.wake! - prev.bed!) best.set(n.date, n);
  }
  return [...best.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Merge imported nights in: a watch measures better than a tap, but nights typed in by hand are kept, and so is your quality rating. */
export function mergeImported(cur: Record<string, Night>, add: Night[]): { nights: Record<string, Night>; count: number } {
  const out = { ...cur };
  let count = 0;
  for (const n of add) {
    const old = out[n.date];
    if (old?.source === 'manual') continue;
    out[n.date] = { ...n, ...(old?.quality != null ? { quality: old.quality } : {}), ...(old?.done ? { done: old.done } : {}) };
    count++;
  }
  return { nights: out, count };
}

/** Average minutes slept on nights with every wind-down step ticked vs nights with some missed, over the last 28.
 * Null until each side has 3 nights. Nights with no ticks at all count as missed only once you've ever ticked. */
export function windDownEffect(nights: Record<string, Night>, steps: string[], today: string): { full: number; partial: number } | null {
  if (!steps.length) return null;
  const recent = Object.values(nights).filter((n) => n.date > addDays(today, -28) && n.date <= today);
  if (!recent.some((n) => n.done?.length)) return null;
  const full: number[] = [];
  const partial: number[] = [];
  for (const n of recent) {
    const m = durationMin(n);
    if (m == null) continue;
    (steps.every((s) => n.done?.includes(s)) ? full : partial).push(m);
  }
  if (full.length < 3 || partial.length < 3) return null;
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return { full: avg(full), partial: avg(partial) };
}
