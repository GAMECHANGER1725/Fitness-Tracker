// The words around the training: warm-up, cool-down, rest days, eating and sleep basics, and safety.
// Written for a 14-year-old beginner: short, practical, no supplements, no calorie or protein numbers
// beyond what Fuel Log already tracks, nothing about cutting weight.

export interface Tip {
  title: string;
  lines: string[];
}

/** Before the first working set. About 8 minutes. */
export const WARMUP: Tip = {
  title: 'Warm-up',
  lines: [
    '5 minutes easy on the bike, rower or treadmill, until you feel warm',
    '10 arm circles each way, 10 bodyweight squats, 10 hip hinges',
    'First exercise: 1–2 light sets of 8–10 before your working sets',
  ],
};

/** Ramp-up sets before the first exercise of a body area. */
export const RAMP = 'Do a light set of 8–10 first (about half the weight). It doesn’t count.';

export const COOLDOWN: Tip = {
  title: 'Cool-down',
  lines: ['2–3 minutes of easy walking', 'Gentle stretches for what you trained, 20–30 seconds each, no bouncing', 'Have a drink and something to eat within the next hour or two'],
};

export const REST_DAY: Tip = {
  title: 'Rest day',
  lines: [
    'Muscle is built while you rest, so rest days are part of the plan, not a gap in it',
    'Stay loosely active: a walk, a bike ride, sport with friends',
    'Eat like a training day. Your body is still rebuilding',
    'A bit sore is normal for the first couple of weeks and eases as you get used to it',
  ],
};

export const SLEEP_TIP: Tip = {
  title: 'Sleep',
  lines: ['Teenagers need about 8–10 hours a night. It’s when most growing and recovering happens', 'Keep your wake-up time steady, weekends too', 'A short night? Train lighter that day rather than pushing through'],
};

export const FOOD_TIP: Tip = {
  title: 'Eating to grow',
  lines: [
    'You can’t gain muscle without eating enough. Three proper meals plus 2–3 snacks beats one huge dinner',
    'Put some protein in every meal and snack (milk, yoghurt, eggs, paneer, dal, beans, tofu, nuts) instead of all at once',
    'Carbs fuel training: rice, roti, oats, bread, fruit, potatoes',
    'Aim for slow, steady weight gain. If the scale is flat for 2–3 weeks, add a snack',
    'Real food covers it. You don’t need supplements',
  ],
};

export const SAFETY: Tip = {
  title: 'Train safe',
  lines: [
    'Technique first. If the last reps get ugly, the set is over',
    'Stop each set with 1–3 good reps left. No maxing out, no testing one-rep maxes',
    'Sharp or sudden pain, or pain in a joint: stop that exercise. If it’s still there next time, see a doctor or physio',
    'Book the gym’s free induction and ask a trainer to check your form on the main lifts',
    'Use the safety stops and pins, re-rack your weights, and ask staff if a machine’s setup is unclear',
  ],
};

export const GUIDE: Tip[] = [SAFETY, WARMUP, COOLDOWN, REST_DAY, FOOD_TIP, SLEEP_TIP];

/** Shown small in Profile. */
export const NOT_MEDICAL = 'This app gives general training guidance, not medical advice. If something hurts or worries you, check with a doctor or physio.';

/** Reps-in-reserve choices in the logger. */
export const RIR_OPTIONS: { v: number; label: string; hint: string }[] = [
  { v: 4, label: '4+', hint: 'Easy' },
  { v: 3, label: '3', hint: 'Comfortable' },
  { v: 2, label: '2', hint: 'Solid' },
  { v: 1, label: '1', hint: 'Hard' },
  { v: 0, label: '0', hint: 'Nothing left' },
];
