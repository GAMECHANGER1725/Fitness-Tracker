// Reminders, shown as system notifications through the service worker (same approach as Fuel Log):
//   wind-down: screens off 20, 40 (default) or 60 min before your bedtime target
//   workout:   at your workout time on a planned day with no workout yet
//   wake-up:   15 min after the wake target if "I'm up" isn't logged (keeps the streak honest)
// ponytail: no server, so these only fire while the app is open or alive in the background.
// Reminders with the app fully closed would need Web Push from a server.
// The on/off flags, wind-down lead and "already sent" dates are per device in localStorage, not synced.

import { useStore } from './store';
import { keyOf, todayKey } from './dates';
import { minutes, plannedDay, slotsFor, workoutTimeOn } from './program';
import { clock12, minsOf } from './sleep';
import { useCoach } from './coach';

const LS_KEY = 'fitness-reminders';
export const WIND_DOWN_MIN = 40;

export type ReminderKind = 'bed' | 'workout' | 'wake';

interface Saved {
  on: boolean;
  /** Kinds turned off on their own (all on by default). */
  off: ReminderKind[];
  /** Minutes before lights out for the wind-down nudge. */
  lead: number;
  bedDate: string;
  workoutDate: string;
  wakeDate: string;
}
const EMPTY: Saved = { on: false, off: [], lead: WIND_DOWN_MIN, bedDate: '', workoutDate: '', wakeDate: '' };
const read = (): Saved => {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') };
  } catch {
    return EMPTY;
  }
};
const patch = (p: Partial<Saved>) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...read(), ...p }));
  } catch {
    /* storage blocked: reminders just repeat after a restart */
  }
};

export const reminderKinds = () => read();
export const setKind = (k: ReminderKind, on: boolean) => {
  const off = read().off.filter((x) => x !== k);
  patch({ off: on ? off : [...off, k] });
};
export const setLead = (lead: number) => patch({ lead });

export const remindersSupported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
export const remindersOn = () => remindersSupported() && read().on && Notification.permission === 'granted';

/** Asks for permission (call from a tap). Returns whether reminders are now on. */
export async function setReminders(on: boolean): Promise<boolean> {
  if (!on) return patch({ on: false }), false;
  if (!remindersSupported()) return false;
  const ok = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
  patch({ on: ok });
  return ok;
}

/** Inside [at, at + window) minutes after midnight, and not sent yet today. Pure, for tests. */
export function dueAt(now: number, atMin: number, lastDate: string, windowMin = 60): boolean {
  const d = new Date(now);
  const m = d.getHours() * 60 + d.getMinutes();
  const since = (m - atMin + 1440) % 1440;
  return since < windowMin && keyOf(d) !== lastDate;
}

async function notify(title: string, body: string, tag: string, path: string) {
  const opts: NotificationOptions = { body, tag, data: { path }, icon: `${import.meta.env.BASE_URL}pwa-192x192.png`, badge: `${import.meta.env.BASE_URL}pwa-64x64.png` };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts); // dev server: no service worker
  } catch {
    /* blocked or unsupported */
  }
}

function tick() {
  if (!remindersOn()) return;
  const now = Date.now();
  const r = read();
  const s = useStore.getState();
  const today = todayKey();
  const bed = minsOf(s.settings.bedtime);
  const want = (k: ReminderKind) => !r.off.includes(k);
  if (want('bed') && dueAt(now, bed - r.lead, r.bedDate, 45)) {
    patch({ bedDate: today });
    const t = useCoach.getState().tonight;
    notify('Time to wind down', t?.date === today && t.lastFood ? `Screens off now, lights out at ${clock12(s.settings.bedtime)}. ${t.lastFood}` : `Screens off now, lights out at ${clock12(s.settings.bedtime)} for a ${clock12(s.settings.wakeTarget)} start.`, 'bed', 'sleep');
  }
  const day = plannedDay(s.program, today);
  const trained = Object.values(s.sessions).some((x) => x.date === today);
  if (want('workout') && day && !trained && !s.active && dueAt(now, minsOf(workoutTimeOn(s.settings, today)), r.workoutDate, 120)) {
    patch({ workoutDate: today });
    notify(`${day.name} today`, `${day.slots.length} exercises, about ${minutes(slotsFor(s.program, day, today))} minutes. Tap to start.`, 'workout', 'today');
  }
  if (want('wake') && s.nights[today]?.wake == null && dueAt(now, minsOf(s.settings.wakeTarget) + 15, r.wakeDate, 60)) {
    patch({ wakeDate: today });
    notify('Up yet?', 'Tap “I’m up” to keep your wake-up streak going.', 'wake', 'today');
  }
}

/** Starts checking every minute and when you come back to the app. Returns a stop function. */
export function startReminders(): () => void {
  const onVisible = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(tick, 60_000);
  tick();
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
