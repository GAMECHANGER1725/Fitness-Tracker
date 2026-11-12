// AI coach for training, sleep and food, using the same DeepSeek/Gemini keys as Fuel Log.
//
//  1. Weekly check-in: reads training, progression, sleep and Fuel Log, then proposes program changes
//     and a bedtime with 3 focus points and 3 sleep habits. The AI only proposes: guardProgram()
//     and guardBedtime() decide what's allowed (library exercises for this equipment, volume caps,
//     bedtime moves at most 30 min a week inside an 8–10 h window). Changes can be undone.
//  2. Morning briefing: readiness plus one line each for training, food and sleep today.
//  3. Tonight's plan: screens-off time, last food (from what's left in Fuel Log) and bedtime.
//  4. After a workout: 2–3 lines on how it went.
//  5. Swap an exercise ("my wrist hurts", "make it harder") for another from the library.
//  6. Ask your coach: short answers grounded in the same snapshot.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppData, Night, Pattern, Session, Slot } from './types';
import type { FuelData, Macros } from './fuel';
import { aiConfig, fuelAi, FUEL_STORE, weightOf } from './fuel';
import { AiError, complete, jsonRule, parseJson, type AiConfig, type Body, type Msg } from './ai';
import { EX, EXERCISES, PATTERN_LABEL, usable } from './exercises';
import { WEEKDAYS, inDeload, plannedDay } from './program';
import { deloadDue, diffPrograms, guardProgram, records, weeklySets } from './progress';
import { durationMin, guardBedtime, idealBedtime, sleepStats, wakeStreak } from './sleep';
import { readiness, type Readiness } from './readiness';
import { addDays, daysBetween, fmtDate, keyOf, todayKey, weekStart } from './dates';
import { dataOf, useStore } from './store';
import { useFuel } from './sync';

// ----- Snapshot: what the coach gets to see ---------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

function sessionLine(s: Session): { date: string; workout: string; minutes: number; feel: number | null; exercises: string[] } {
  const by = new Map<string, Session['sets']>();
  for (const x of s.sets) by.set(x.exerciseId, [...(by.get(x.exerciseId) ?? []), x]);
  const exercises = [...by.entries()].map(([id, sets]) => {
    const e = EX[id];
    const unit = e?.unit === 'secs' ? 's' : '';
    const load = sets.some((x) => x.loadKg) ? ` @${sets[0].loadKg} kg` : '';
    const rpe = sets.map((x) => x.rpe).filter(Boolean);
    return `${e?.name ?? id}: ${sets.map((x) => `${x.reps}${unit}`).join(', ')}${load}${rpe.length ? ` (RPE ${rpe.join('/')})` : ''}`;
  });
  return { date: s.date, workout: s.name, minutes: Math.round((s.end - s.start) / 60_000), feel: s.feel ?? null, exercises };
}

const nightLine = (n: Night) => {
  const m = durationMin(n);
  return {
    date: n.date,
    bed: n.bed ? clock(n.bed) : null,
    wake: n.wake ? clock(n.wake) : null,
    hours: m == null ? null : r1(m / 60),
    quality: n.quality ?? null,
    ...(n.deep != null ? { deepMin: n.deep, remMin: n.rem ?? null } : {}),
    source: n.source,
  };
};

export interface Snapshot {
  today: string;
  now: string;
  weekday: string;
  profile: { age: number; sex: string; heightCm: number; weightKg: number; goal: string; equipment: string };
  schedule: { wakeTarget: string; bedtime: string; sleepGoalHours: number; workoutTime: string };
  program: { week: string[]; days: { id: string; name: string; slots: (Slot & { name: string; unit: string })[] }[]; deloadUntil: string | null; weeklySetsByPattern: Record<Pattern, number> };
  todayPlan: string;
  sessions: ReturnType<typeof sessionLine>[];
  sessionsPerWeek: { week: string; count: number }[];
  recentProgramChanges: string[];
  bests: string[];
  deloadDue: boolean;
  sleep: {
    nights: ReturnType<typeof nightLine>[];
    last7: ReturnType<typeof sleepStats>;
    last14: ReturnType<typeof sleepStats>;
    wakeStreak: number;
    bedtimeForGoal: string;
    lastNightAfterLateMeal: boolean | null;
  };
  fuel: null | {
    targets: Macros | null;
    today: { kcal: number; protein: number; last: string | null } | null;
    left: Macros | null;
    days: { date: string; kcal: number; protein: number; lastMeal: string | null; trained: boolean }[];
    avgKcalTrainingDays: number | null;
    avgKcalRestDays: number | null;
    weightKg: number;
    weighIns: { date: string; kg: number }[];
  };
  readiness: Readiness;
}

const avgOf = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function snapshot(d: AppData, fuel: FuelData | null, now = new Date()): Snapshot {
  const today = todayKey();
  const s = d.settings;
  const sessions = Object.values(d.sessions).filter((x) => x.date >= addDays(today, -14)).sort((a, b) => b.start - a.start);
  const trainedOn = new Set(Object.values(d.sessions).map((x) => x.date));
  const weeks: { week: string; count: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const wk = addDays(weekStart(today), -7 * i);
    weeks.push({ week: wk, count: Object.values(d.sessions).filter((x) => weekStart(x.date) === wk).length });
  }
  const recs = records(d.sessions);
  const nights = Object.values(d.nights).filter((n) => n.date >= addDays(today, -14)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const targets = fuel?.targets ?? null;
  const fDays = fuel
    ? Object.entries(fuel.days)
        .filter(([k]) => k >= addDays(today, -14))
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([date, f]) => ({ date, kcal: f.kcal, protein: Math.round(f.protein), lastMeal: f.last ? clock(f.last) : null, trained: trainedOn.has(date) }))
    : [];
  const past = fDays.filter((x) => x.date < today);
  const fToday = fuel?.days[today];
  // Did last night start within 2.5 h of the last food? (Late eating can cut sleep quality.)
  const ln = d.nights[today];
  const yLast = fuel?.days[addDays(today, -1)]?.last;
  const lateMeal = ln?.bed && yLast ? ln.bed - yLast < 2.5 * 3_600_000 : null;
  const wkSets = weeklySets(d.program);
  const plan = plannedDay(d.program, today);
  const weightKg = weightOf(fuel, d.profile.weightKg);
  const readyNow = readiness({ today, night: d.nights[today], goalH: s.sleepGoalH, fuel, targets, sessions: d.sessions });
  return {
    today,
    now: clock(now.getTime()),
    weekday: now.toLocaleDateString('en-AU', { weekday: 'long' }),
    profile: {
      age: d.profile.age,
      sex: d.profile.sex,
      heightCm: d.profile.heightCm,
      weightKg,
      goal: 'Build muscle on a vegetarian bulk (eggs and dairy OK), gaining 0.25–0.5 kg a week',
      equipment: `Bodyweight, a backpack loaded up to ${d.profile.packMaxKg} kg${d.profile.hasGrip ? ', a forearm trainer' : ''}. No bar, bench or dumbbells.`,
    },
    schedule: { wakeTarget: s.wakeTarget, bedtime: s.bedtime, sleepGoalHours: s.sleepGoalH, workoutTime: s.workoutTime },
    program: {
      week: d.program.week.map((id, i) => `${WEEKDAYS[i]}: ${d.program.days.find((x) => x.id === id)?.name ?? 'rest'}`),
      days: d.program.days.map((day) => ({ id: day.id, name: day.name, slots: day.slots.map((x) => ({ ...x, name: EX[x.exerciseId]?.name ?? x.exerciseId, unit: EX[x.exerciseId]?.unit ?? 'reps' })) })),
      deloadUntil: d.program.deloadUntil,
      weeklySetsByPattern: wkSets,
    },
    todayPlan: plan ? `${plan.name}${inDeload(d.program, today) ? ' (lighter week)' : ''}` : 'Rest day',
    sessions: sessions.map(sessionLine),
    sessionsPerWeek: weeks,
    recentProgramChanges: d.programLog.slice(-6).flatMap((c) => c.lines.map((l) => `${fmtDate(keyOf(new Date(c.at)))}: ${l}`)),
    bests: Object.entries(recs)
      .sort(([, a], [, b]) => (a.date < b.date ? 1 : -1))
      .slice(0, 8)
      .map(([id, b]) => `${EX[id]?.name ?? id}: ${b.reps}${EX[id]?.unit === 'secs' ? ' s' : ''}${b.loadKg ? ` @${b.loadKg} kg` : ''} (${b.date})`),
    deloadDue: deloadDue(d.sessions, d.program, today, weekStart, addDays),
    sleep: {
      nights: nights.map(nightLine),
      last7: sleepStats(d.nights, today, 7, s.sleepGoalH, s.wakeTarget),
      last14: sleepStats(d.nights, today, 14, s.sleepGoalH, s.wakeTarget),
      wakeStreak: wakeStreak(d.nights, today, s.wakeTarget),
      bedtimeForGoal: idealBedtime(s.wakeTarget, s.sleepGoalH),
      lastNightAfterLateMeal: lateMeal,
    },
    fuel: fuel
      ? {
          targets,
          today: fToday ? { kcal: fToday.kcal, protein: Math.round(fToday.protein), last: fToday.last ? clock(fToday.last) : null } : null,
          left: targets
            ? {
                kcal: Math.max(0, Math.round(targets.kcal - (fToday?.kcal ?? 0))),
                protein: Math.max(0, Math.round(targets.protein - (fToday?.protein ?? 0))),
                carbs: Math.max(0, Math.round(targets.carbs - (fToday?.carbs ?? 0))),
                fat: Math.max(0, Math.round(targets.fat - (fToday?.fat ?? 0))),
              }
            : null,
          days: fDays,
          avgKcalTrainingDays: avgOf(past.filter((x) => x.trained).map((x) => x.kcal)),
          avgKcalRestDays: avgOf(past.filter((x) => !x.trained).map((x) => x.kcal)),
          weightKg,
          weighIns: fuel.weighIns.slice(-10),
        }
      : null,
    readiness: readyNow,
  };
}

// ----- Prompts and schemas -------------------------------------------------------------

const BASE = [
  'You are a friendly, practical coach for a 15-year-old in Australia who trains at home and is on a vegetarian bulk (eggs and dairy OK, no meat or fish).',
  'Equipment: bodyweight, a backpack loaded with books or water bottles, and a forearm trainer. No bar, no bench, no dumbbells, no gym.',
  'They wake at their wake target every day (school days and weekends), so sleep comes from going to bed earlier, not sleeping in.',
  'Safety first for a teenager: good form over load, most sets 1–3 reps short of failure, no max-effort testing, enough sleep (8–10 h for their age), and eating enough. Never suggest cutting calories, fasting or supplements other than food (whey only if they already use it). If something hurts, tell them to stop that exercise and see a doctor or physio if it lasts.',
  'Use their real numbers from the snapshot. Be specific and short. Australian English, plain words, no hype, no emoji.',
].join(' ');

export const REVIEW_PROMPT = [
  BASE,
  'Task: the weekly check-in. Look at the last two weeks of workouts (reps, loads, RPE, how they felt), the program, progression so far, sleep (bed and wake times, hours, quality, consistency, weekend drift) and food from Fuel Log (calories and protein vs targets, training days vs rest days, how late the last meal is).',
  'Then return the program for next week. Keep the same day ids and the weekly schedule. Only use exercise ids from the library in the request. Change only what the data supports: swap an exercise that has stalled for 3+ sessions, add or remove a set, adjust a rep range or backpack load. Most weeks need few or no changes. Do not raise total weekly sets by more than about 10%.',
  'Set "deload" true only when deloadDue is true or they are clearly worn down (several short nights, low feel scores, falling reps).',
  'Sleep: give a status, a bedtime (HH:MM, 24 h) that gives them their sleep goal before the wake target, and 3 concrete habits for this week based on their own pattern (e.g. screens off time, last meal time, keeping weekend bedtime the same).',
  'summary: 2–3 sentences on the week. focus: 3 short, specific things for training and food this week.',
].join('\n');

export const SLEEP_STATUSES = ['on-track', 'short', 'irregular', 'late', 'need-data'] as const;
export type SleepStatus = (typeof SLEEP_STATUSES)[number];

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    focus: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    program: {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              slots: { type: 'array', items: { type: 'object', properties: { exerciseId: { type: 'string' }, sets: { type: 'number' }, low: { type: 'number' }, high: { type: 'number' }, restS: { type: 'number' }, loadKg: { type: 'number' } }, required: ['exerciseId', 'sets', 'low', 'high'] } },
            },
            required: ['id', 'slots'],
          },
        },
      },
      required: ['days'],
    },
    deload: { type: 'boolean' },
    sleep: {
      type: 'object',
      properties: { status: { type: 'string', enum: SLEEP_STATUSES }, bedtime: { type: 'string', description: 'HH:MM, 24 h' }, habits: { type: 'array', items: { type: 'string' }, maxItems: 3 }, note: { type: 'string' } },
      required: ['status', 'bedtime', 'habits', 'note'],
    },
  },
  required: ['summary', 'focus', 'program', 'deload', 'sleep'],
} as const;

export const BRIEFING_PROMPT = [
  BASE,
  'Task: a morning briefing for today. Use readiness (score, band and notes), last night’s sleep, today’s plan and yesterday’s food.',
  'headline: one short sentence. train: what to do today and how hard (if readiness is low, say to take it easier). food: one tip for today from their Fuel Log numbers. sleep: how last night went and tonight’s bedtime.',
].join('\n');
export const BRIEFING_SCHEMA = { type: 'object', properties: { headline: { type: 'string' }, train: { type: 'string' }, food: { type: 'string' }, sleep: { type: 'string' } }, required: ['headline', 'train', 'food', 'sleep'] } as const;

export const TONIGHT_PROMPT = [
  BASE,
  'Task: tonight’s sleep plan. Work back from the wake target and bedtime.',
  'screensOff: HH:MM (24 h), about 30–45 min before bedtime. lastFood: what and by when, using what is left of today’s calories and protein in Fuel Log (a protein-rich snack like milk, dahi or paneer if protein is short, eaten at least an hour before bed). plan: 2–3 sentences, mentioning anything from their pattern (a hard session today, a short night last night, weekend drift).',
].join('\n');
export const TONIGHT_SCHEMA = { type: 'object', properties: { screensOff: { type: 'string' }, lastFood: { type: 'string' }, plan: { type: 'string' } }, required: ['screensOff', 'lastFood', 'plan'] } as const;

export const POST_PROMPT = [BASE, 'Task: they just finished the workout in "finished". In 2–3 sentences: what went well (records, more reps or load than last time), one thing to watch, and what to eat in the next couple of hours based on Fuel Log.'].join('\n');
export const POST_SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } as const;

export const SWAP_PROMPT = [BASE, 'Task: swap one exercise for another from the library in the request, for the reason they give. Pick from the same movement pattern when you can. If they mention pain, choose something that avoids the painful position and say to stop if it still hurts.'].join('\n');
export const SWAP_SCHEMA = { type: 'object', properties: { exerciseId: { type: 'string' }, why: { type: 'string' } }, required: ['exerciseId', 'why'] } as const;

export const CHAT_PROMPT = [BASE, 'Task: answer their question about training, sleep or food in at most 5 short sentences, using the snapshot. If the question needs a doctor, say so.'].join('\n');

const library = (d: AppData) =>
  EXERCISES.filter((e) => usable(e, d.profile.hasGrip)).map((e) => `${e.id} | ${e.name} | ${PATTERN_LABEL[e.pattern]} | ${e.unit}${e.loadable ? ' | backpack ok' : ''}${e.perSide ? ' | per side' : ''} | ladder ${e.ladder} step ${e.step}`);

const req = (system: string, schema: object, user: string): Body => ({ messages: [{ role: 'system', content: `${system}\n\n${jsonRule(schema)}` }, { role: 'user', content: user }], json: true });

// ----- Parsing (pure, tested) ---------------------------------------------------------------

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, n = 3, max = 200) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const hhmmOk = (v: unknown) => (typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim().padStart(5, '0') : null);

export interface Review {
  date: string;
  summary: string;
  focus: string[];
  /** Program changes, already limited by guardProgram. */
  lines: string[];
  program: AppData['program'];
  sleep: { status: SleepStatus; bedtime: string; prevBedtime: string; habits: string[]; note: string };
  model: string;
  applied: boolean;
}

export function parseReview(raw: string, d: AppData, today: string, model: string): Review {
  const r = parseJson(raw) as Record<string, unknown>;
  let program = guardProgram(d.program, r.program, d.profile);
  // A lighter week only if it's been at least 3 weeks since the last one.
  const recentDeload = d.program.deloadUntil && daysBetween(d.program.deloadUntil, today) < 21;
  if (r.deload === true && !recentDeload) program = { ...program, deloadUntil: addDays(today, 6) };
  const sl = (r.sleep && typeof r.sleep === 'object' ? r.sleep : {}) as Record<string, unknown>;
  const status = SLEEP_STATUSES.includes(sl.status as SleepStatus) ? (sl.status as SleepStatus) : 'need-data';
  const bedtime = guardBedtime(d.settings.bedtime, sl.bedtime, d.settings.wakeTarget);
  return {
    date: today,
    summary: str(r.summary, 600) || 'Check-in done.',
    focus: strs(r.focus),
    lines: diffPrograms(d.program, program),
    program,
    sleep: { status, bedtime, prevBedtime: d.settings.bedtime, habits: strs(sl.habits), note: str(sl.note, 400) },
    model,
    applied: false,
  };
}

export interface Briefing {
  date: string;
  headline: string;
  train: string;
  food: string;
  sleep: string;
}
export function parseBriefing(raw: string, date: string): Briefing {
  const r = parseJson(raw) as Record<string, unknown>;
  const b = { date, headline: str(r.headline, 200), train: str(r.train), food: str(r.food), sleep: str(r.sleep) };
  if (!b.headline && !b.train) throw new AiError('bad-reply', 'Empty briefing');
  return b;
}

export interface Tonight {
  date: string;
  screensOff: string;
  lastFood: string;
  plan: string;
}
export function parseTonight(raw: string, date: string, bedtime: string): Tonight {
  const r = parseJson(raw) as Record<string, unknown>;
  const off = hhmmOk(r.screensOff);
  const bedM = (+bedtime.slice(0, 2)) * 60 + +bedtime.slice(3);
  const offM = off ? +off.slice(0, 2) * 60 + +off.slice(3) : null;
  // Screens off has to be before bedtime (within 2 h); otherwise use 40 min before.
  const okOff = offM != null && ((bedM - offM + 1440) % 1440) <= 120 && ((bedM - offM + 1440) % 1440) >= 15;
  const fallback = `${pad(Math.floor(((bedM - 40 + 1440) % 1440) / 60))}:${pad((bedM - 40 + 1440) % 60)}`;
  return { date, screensOff: okOff ? off! : fallback, lastFood: str(r.lastFood, 300), plan: str(r.plan, 500) };
}

export function parseSwap(raw: string, d: AppData, from: string): { exerciseId: string; why: string } {
  const r = parseJson(raw) as Record<string, unknown>;
  const id = str(r.exerciseId, 40);
  const e = EX[id];
  const f = EX[from];
  if (!e || id === from || !usable(e, d.profile.hasGrip) || (f && e.pattern !== f.pattern)) throw new AiError('bad-reply', 'Not a usable swap');
  return { exerciseId: id, why: str(r.why, 300) };
}

// ----- State and actions (need the app store) --------------------------------------------

interface CoachState {
  /** Apply weekly check-ins automatically (else they wait for "Apply"). */
  auto: boolean;
  review: Review | null;
  tried: number;
  briefing: Briefing | null;
  tonight: Tonight | null;
  post: { id: string; text: string } | null;
  chat: Msg[];
  set: (p: Partial<CoachState>) => void;
}

export const useCoach = create<CoachState>()(
  persist(
    (set) => ({ auto: true, review: null, tried: 0, briefing: null, tonight: null, post: null, chat: [], set: (p) => set(p) }),
    { name: 'fitness-coach', version: 1, partialize: ({ set: _set, ...rest }) => rest },
  ),
);

/** The AI keys in use: this app's own, else Fuel Log's on this phone. */
export const currentAi = (): AiConfig => aiConfig(useStore.getState().settings, fuelAi(localStorage.getItem(FUEL_STORE)));

function ctx() {
  const d = dataOf(useStore.getState());
  const fuel = useFuel.getState().data;
  return { d, fuel, snap: snapshot(d, fuel) };
}

export const reviewDue = (review: Review | null, today: string) => !review || daysBetween(review.date, today) >= 7;

/** The weekly check-in should run by itself now (auto on, a week since the last, not tried in the last 6 h). */
export function autoDue(today: string, now = Date.now()): boolean {
  const c = useCoach.getState();
  return c.auto && reviewDue(c.review, today) && now - c.tried > 6 * 3_600_000;
}

export async function checkIn(): Promise<Review> {
  const { d, snap } = ctx();
  const [raw, model] = await complete(currentAi(), req(REVIEW_PROMPT, REVIEW_SCHEMA, `Snapshot:\n${JSON.stringify(snap)}\n\nLibrary (id | name | pattern | unit | notes):\n${library(d).join('\n')}`));
  let review: Review;
  try {
    review = parseReview(raw, d, snap.today, model);
  } catch {
    throw new AiError('bad-reply', 'Unreadable check-in');
  }
  if (useCoach.getState().auto) review = applyReview(review);
  useCoach.getState().set({ review, tried: Date.now() });
  return review;
}

function applyReview(r: Review): Review {
  const st = useStore.getState();
  if (r.lines.length) st.setProgram(r.program, 'coach', r.summary);
  if (r.sleep.bedtime !== st.settings.bedtime) st.setSettings({ bedtime: r.sleep.bedtime });
  return { ...r, applied: true };
}

export function applyCheckIn(): boolean {
  const r = useCoach.getState().review;
  if (!r || r.applied) return false;
  useCoach.getState().set({ review: applyReview(r) });
  return true;
}

export function undoCheckIn(): boolean {
  const r = useCoach.getState().review;
  if (!r?.applied) return false;
  const st = useStore.getState();
  const last = st.programLog.at(-1);
  if (r.lines.length && last?.by === 'coach') st.undoProgram();
  st.setSettings({ bedtime: r.sleep.prevBedtime });
  useCoach.getState().set({ review: { ...r, applied: false } });
  return true;
}

export async function morningBriefing(): Promise<Briefing> {
  const { snap } = ctx();
  const [raw] = await complete(currentAi(), req(BRIEFING_PROMPT, BRIEFING_SCHEMA, `Snapshot:\n${JSON.stringify(snap)}`));
  const b = parseBriefing(raw, snap.today);
  useCoach.getState().set({ briefing: b });
  return b;
}

export async function tonightPlan(): Promise<Tonight> {
  const { d, snap } = ctx();
  const [raw] = await complete(currentAi(), req(TONIGHT_PROMPT, TONIGHT_SCHEMA, `Snapshot:\n${JSON.stringify(snap)}`));
  const t = parseTonight(raw, snap.today, d.settings.bedtime);
  useCoach.getState().set({ tonight: t });
  return t;
}

export async function postWorkout(s: Session): Promise<string> {
  const { snap } = ctx();
  const [raw] = await complete(currentAi(), req(POST_PROMPT, POST_SCHEMA, `Finished:\n${JSON.stringify(sessionLine(s))}\n\nSnapshot:\n${JSON.stringify(snap)}`));
  const text = str((parseJson(raw) as Record<string, unknown>).text, 600);
  if (!text) throw new AiError('bad-reply', 'Empty');
  useCoach.getState().set({ post: { id: s.id, text } });
  return text;
}

export async function suggestSwap(from: string, reason: string): Promise<{ exerciseId: string; why: string }> {
  const { d, snap } = ctx();
  const [raw] = await complete(
    currentAi(),
    req(SWAP_PROMPT, SWAP_SCHEMA, `Swap: ${EX[from]?.name ?? from} (${from})\nReason: ${reason}\n\nLibrary:\n${library(d).join('\n')}\n\nSnapshot:\n${JSON.stringify({ profile: snap.profile, sessions: snap.sessions.slice(0, 4) })}`),
  );
  return parseSwap(raw, d, from);
}

export async function ask(question: string): Promise<string> {
  const { snap } = ctx();
  const history = useCoach.getState().chat.slice(-8);
  const msgs: Msg[] = [{ role: 'system', content: `${CHAT_PROMPT}\n\nSnapshot:\n${JSON.stringify(snap)}` }, ...history, { role: 'user', content: question }];
  const [text] = await complete(currentAi(), { messages: msgs });
  const answer = text.trim().slice(0, 1500);
  const turn: Msg[] = [{ role: 'user', content: question }, { role: 'assistant', content: answer }];
  useCoach.getState().set({ chat: [...history, ...turn].slice(-12) });
  return answer;
}

/** Plain-language sleep status for the UI. */
export const SLEEP_STATUS_LABEL: Record<SleepStatus, string> = { 'on-track': 'On track', short: 'Too short', irregular: 'All over the place', late: 'Too late', 'need-data': 'Need more nights' };

