import { useEffect, useState } from 'react';
import { Sheet } from './ui';

/** Bump when there is something new to show; the sheet opens once per device for each id. */
export const NEWS_ID = '2026-10-30l';
const KEY = 'fitness-news';
const EVENT = 'fitness-show-news';

/** Open the What's new sheet again. */
export const showWhatsNew = () => window.dispatchEvent(new Event(EVENT));

const NEWS: [title: string, body: string, href?: string][] = [
  ['Fixed: your plan saves', 'Changing which workout is on a weekday, or only an exercise’s rest time, now saves. Before, those changes were quietly lost. A workout left unfinished from an earlier day can now be saved or discarded instead of blocking today’s.', '#/train'],
  ['Evenings and mornings on Today', 'Tick your own wind-down checklist and tap Going to sleep; tap I’m up and rate the night in one tap. Forgot to tap? Pick an earlier time. See how much sleep you’d get if you went now, and add time awake and a one-tap note to any night (“phone in bed”, or your own list); Insights shows which ones cost you sleep.', '#/sleep'],
  ['Better workouts', 'A warm-up first, last time’s reps on every set, a timer for holds, extra sets, fix or remove a logged set, notes per exercise, a beep when rest ends, and how many minutes are left. Today asks how you feel (sore or tired picks the lighter version), shows last time’s sets for each move and offers a workout you missed yesterday, the player shows your best set and what it takes to move up (the done screen names moves that were nearly there), and you can swap in a different workout from your plan. Swap shows the easier and harder versions first, and a workout you forgot to finish no longer counts as hours long (you can fix its length in History too). New: a Watch how link for each move’s form, a heads-up to pack the backpack before a loaded move, and after a week or more off Today starts you on the lighter version.'],
  ['Your plan, your way', 'Reorder, rename, copy or delete workouts, add a move straight from Exercises, change rest times as you go, see past plan changes, and start or end a lighter week.', '#/train'],
  ['See your progress', 'Month calendars for workouts and sleep, a chart per exercise (tap a bar for that day’s sets), when you last did each move, all-time totals, a search through your workouts and their notes, personal bests, body measurements (arm, chest, waist, thigh) with the change over time, your next badge (and a new Sleep diary badge), a weight chart on Fuel, and a recap of last week on Today each Monday. New: this month vs last for workouts and sleep, your shortest night of the week, readiness against your usual, and when each plan workout was last done and is next on.', '#/train?tab=history'],
  ['Coach without AI', 'Coach now opens with plain notes from your last week: what’s going up, what’s stuck, sleep and whether a lighter week is due.', '#/coach'],
  ['Undo instead of “Are you sure?”', 'Deleting a workout or night, removing a set or stopping a workout can all be undone for a few seconds.'],
  ['Make it yours', 'In Profile: a Black theme for night, a training colour, larger text, which page the app opens on, which cards Today shows, which reminders you get (with a weekend workout time and Pause for today), vibration on or off, your wind-down steps, CSV downloads, and Add to my calendar (workouts and lights out in your phone’s calendar, with alerts even when the app is closed). Reset look and layout puts it all back. This list is under Profile too.', '#/profile?open=look'],
];

const seen = () => {
  try {
    return localStorage.getItem(KEY) === NEWS_ID;
  } catch {
    return true;
  }
};

/** Shows the sheet once per NEWS_ID on this device. */
export function WhatsNewOnce() {
  const [open, setOpen] = useState(() => !seen());
  // Profile's "What's new" link reopens it.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, NEWS_ID);
    } catch {
      /* shows again next time; harmless */
    }
    setOpen(false);
  };
  return (
    <Sheet onClose={close} label="What's new">
      <div className="stack" style={{ gap: 2 }}>
        <span className="label acc">Fitness Tracker update</span>
        <h2 className="h2" style={{ fontSize: 26 }}>What’s new</h2>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        {NEWS.map(([title, body, href]) => (
          <div key={title} className="stack" style={{ gap: 2 }}>
            <span className="bold">{title}</span>
            <span className="small mut">
              {body}{' '}
              {href && <a href={href} onClick={close}>Try it</a>}
            </span>
          </div>
        ))}
      </div>
      <button className="btn primary block" onClick={close}>Got it</button>
    </Sheet>
  );
}
