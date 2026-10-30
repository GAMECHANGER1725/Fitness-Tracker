import { useState } from 'react';
import { Sheet } from './ui';

/** Bump when there is something new to show; the sheet opens once per device for each id. */
export const NEWS_ID = '2026-10-30b';
const KEY = 'fitness-news';

const NEWS: [title: string, body: string, href?: string][] = [
  ['Fixed: your plan saves', 'Changing which workout is on a weekday, or only an exercise’s rest time, now saves. Before, those changes were quietly lost. A workout left unfinished from an earlier day can now be saved or discarded instead of blocking today’s.', '#/train'],
  ['Evenings and mornings on Today', 'Tick your own wind-down checklist and tap Going to sleep; tap I’m up and rate the night in one tap. Forgot to tap? Pick an earlier time. Add a note to any night (“woke at 2 am”).', '#/sleep'],
  ['Better workouts', 'A warm-up first, last time’s reps on every set, a timer for holds, extra sets, fix or remove a logged set, notes per exercise, a beep when rest ends, and how many minutes are left.'],
  ['Your plan, your way', 'Reorder, rename, copy or delete workouts, change rest times as you go, and start or end a lighter week.', '#/train'],
  ['See your progress', 'Month calendars for workouts and sleep, a chart per exercise, a search through your workouts and their notes, personal bests, badge progress, and week totals on Today.', '#/train?tab=history'],
  ['Coach without AI', 'Coach now opens with plain notes from your last week: what’s going up, what’s stuck, sleep and whether a lighter week is due.', '#/coach'],
  ['Undo instead of “Are you sure?”', 'Deleting a workout or night, removing a set or stopping a workout can all be undone for a few seconds.'],
  ['Make it yours', 'In Profile: a training colour (mint, sky, rose or lime), larger text, which cards Today shows and which reminders you get, your wind-down steps, and CSV downloads. The app also follows your phone’s Reduce motion setting.', '#/profile?open=look'],
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
