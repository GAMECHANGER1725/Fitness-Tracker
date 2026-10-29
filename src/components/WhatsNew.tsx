import { useState } from 'react';
import { Sheet } from './ui';

/** Bump when there is something new to show; the sheet opens once per device for each id. */
export const NEWS_ID = '2026-10-29a';
const KEY = 'fitness-news';

const NEWS: [title: string, body: string, href?: string][] = [
  ['Going to sleep from Today', 'In the evening Today counts down to lights out with a Going to sleep button, and Undo if you tap it by mistake. In the morning, rate your sleep in one tap.'],
  ['Time your holds', 'Hold exercises get a timer: 3 s to get in position, a buzz at the bottom and top of the range, and Stop fills in the seconds.'],
  ['Fix sets, add sets', 'Tap a logged set to change or remove it, add an extra set with + Set, and tap the workout name to jump to any exercise.'],
  ['Beep and screen on', 'A beep when rest ends and the screen stays on during a workout. Both can be turned off.', '#/profile'],
  ['Your progress per move', 'Open a move in Exercises to see your last 8 sessions as a chart.', '#/train?tab=moves'],
  ['Edit and back-fill workouts', 'Edit a saved workout’s day, feel and note, or log one you did without the app.', '#/train?tab=history'],
  ['Reorder your plan', 'Tap Reorder on a plan day to move exercises up or down. Changing only the rest time now saves too.', '#/train'],
  ['Your week at a glance', 'This week on Today now totals workouts, sets and time. Tap a day to see what you did or what’s planned.'],
  ['30 nights of sleep', 'The sleep chart can show 7, 14 or 30 nights.', '#/sleep'],
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
