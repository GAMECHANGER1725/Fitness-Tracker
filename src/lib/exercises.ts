// Built-in exercise library for home training with what's actually at home:
// bodyweight, a backpack loaded with books or water bottles, and a forearm trainer.
// Exercises sit on progression ladders (step 1 = easiest); progress.ts moves up a ladder
// once the backpack can't add more. Nothing here needs a bar, bench or dumbbells.

import type { Equip, Exercise, Pattern } from './types';

const E = (
  id: string,
  name: string,
  pattern: Pattern,
  muscles: string,
  ladder: string,
  step: number,
  cues: string[],
  o: { equip?: Equip[]; unit?: 'reps' | 'secs'; perSide?: boolean; loadable?: boolean } = {},
): Exercise => ({ id, name, pattern, muscles, ladder, step, cues, equip: o.equip ?? ['bw'], unit: o.unit ?? 'reps', perSide: o.perSide, loadable: o.loadable });

export const EXERCISES: Exercise[] = [
  // Push: horizontal
  E('wall-pushup', 'Wall push-up', 'push', 'Chest, shoulders, triceps', 'hpush', 1, ['Hands on the wall at shoulder height', 'Body in one straight line', 'Chest to the wall, push away hard']),
  E('incline-pushup', 'Incline push-up', 'push', 'Chest, shoulders, triceps', 'hpush', 2, ['Hands on a sturdy table or bed edge', 'Squeeze glutes so hips don’t sag', 'Lower until your chest nearly touches']),
  E('pushup', 'Push-up', 'push', 'Chest, shoulders, triceps', 'hpush', 3, ['Hands a bit wider than shoulders', 'Elbows about 45° from your body', 'Chest to a fist’s height off the floor']),
  E('pack-pushup', 'Backpack push-up', 'push', 'Chest, shoulders, triceps', 'hpush', 4, ['Straps tight so the bag sits high on your back', 'Same form as a push-up', 'Full lockout at the top'], { equip: ['bw', 'pack'], loadable: true }),
  E('decline-pushup', 'Decline push-up', 'push', 'Upper chest, shoulders', 'hpush', 5, ['Feet on a chair or bed', 'Keep your core tight, no sagging', 'Lower slowly, 2 seconds down'], { loadable: true }),
  E('archer-pushup', 'Archer push-up', 'push', 'Chest, triceps (one side at a time)', 'hpush', 6, ['Very wide hands', 'Shift over one arm, the other stays straight', 'Alternate sides'], { perSide: true }),
  E('diamond-pushup', 'Diamond push-up', 'push', 'Triceps, inner chest', 'tri', 2, ['Thumbs and index fingers make a diamond', 'Elbows brush your ribs', 'Drop to knees if form breaks'], { loadable: true }),
  E('chair-dip', 'Chair dip', 'push', 'Triceps, chest', 'tri', 1, ['Hands on a sturdy chair behind you', 'Shoulders down, away from ears', 'Lower to 90° at the elbow, no deeper']),
  // Push: vertical
  E('pike-pushup', 'Pike push-up', 'push', 'Shoulders, triceps', 'vpush', 1, ['Hips high, upside-down V', 'Head moves forward of your hands', 'Elbows track back, not flared']),
  E('elevated-pike', 'Feet-up pike push-up', 'push', 'Shoulders, triceps', 'vpush', 2, ['Feet on a chair, hips over hands', 'Lower the top of your head toward the floor', 'Press back up in a straight line']),
  E('wall-handstand', 'Wall handstand hold', 'push', 'Shoulders, core', 'vpush', 3, ['Walk your feet up the wall, chest facing it', 'Push the floor away, arms straight', 'Come down whenever you need to'], { unit: 'secs' }),
  // Pull (no bar: the backpack does the work)
  E('pack-row', 'Backpack row', 'pull', 'Upper back, lats, biceps', 'row', 1, ['Hinge forward, flat back', 'Pull the bag to your belly button', 'Squeeze 1 second at the top'], { equip: ['pack'], loadable: true }),
  E('one-arm-row', 'One-arm backpack row', 'pull', 'Lats, upper back', 'row', 2, ['Free hand on a chair or bed', 'Pull your elbow past your ribs', 'No twisting'], { equip: ['pack'], perSide: true, loadable: true }),
  E('table-row', 'Table row', 'pull', 'Upper back, lats, biceps', 'row', 3, ['Lie under a sturdy table, grip the edge', 'Body straight, pull your chest to the edge', 'Only if the table is solid and won’t tip']),
  E('pack-reverse-fly', 'Backpack reverse fly', 'pull', 'Rear shoulders, upper back', 'fly', 1, ['Hold the bag by its top handle, hinge forward', 'Arms slightly bent, raise to the sides', 'Slow on the way down'], { equip: ['pack'], loadable: true }),
  E('ytw', 'Prone Y-T-W raise', 'pull', 'Upper back, rear shoulders', 'ytw', 1, ['Lie face down, thumbs up', 'Lift arms in a Y, then T, then W', 'Pause at the top of each']),
  E('pack-curl', 'Backpack curl', 'pull', 'Biceps, forearms', 'curl', 1, ['Hold the bag by both straps', 'Elbows pinned to your sides', 'No swinging'], { equip: ['pack'], loadable: true }),
  E('superman', 'Superman hold', 'pull', 'Lower back, glutes', 'superman', 1, ['Lie face down, arms forward', 'Lift arms, chest and legs together', 'Look at the floor, not up'], { unit: 'secs' }),
  // Legs
  E('squat', 'Bodyweight squat', 'legs', 'Quads, glutes', 'squat', 1, ['Feet shoulder width, toes slightly out', 'Sit between your heels, chest up', 'Knees follow your toes']),
  E('pack-squat', 'Backpack squat', 'legs', 'Quads, glutes', 'squat', 2, ['Bag on your front or back, straps tight', 'Full depth you can control', 'Drive up through the whole foot'], { equip: ['pack'], loadable: true }),
  E('split-squat', 'Split squat', 'legs', 'Quads, glutes', 'single-leg', 1, ['Long stance, back heel up', 'Drop the back knee straight down', 'Front knee over the middle of the foot'], { perSide: true, loadable: true }),
  E('bulgarian', 'Bulgarian split squat', 'legs', 'Quads, glutes', 'single-leg', 2, ['Back foot on a chair or bed', 'Torso slightly forward', 'Control the bottom, don’t bounce'], { perSide: true, loadable: true }),
  E('shrimp-squat', 'Shrimp squat', 'legs', 'Quads, balance', 'single-leg', 3, ['Hold your back foot behind you', 'Lower until the back knee taps a cushion', 'Hold a wall for balance at first'], { perSide: true }),
  E('step-up', 'Step-up', 'legs', 'Quads, glutes', 'stepup', 1, ['Sturdy chair or the bottom stair', 'Push through the top foot only', 'Step down slowly'], { perSide: true, loadable: true }),
  E('reverse-lunge', 'Reverse lunge', 'legs', 'Quads, glutes', 'lunge', 1, ['Step back, both knees to 90°', 'Stay tall', 'Push back up with the front leg'], { perSide: true, loadable: true }),
  E('wall-sit', 'Wall sit', 'legs', 'Quads', 'wallsit', 1, ['Back flat on the wall', 'Thighs parallel to the floor', 'Breathe steadily'], { unit: 'secs', loadable: true }),
  E('calf-raise', 'Single-leg calf raise', 'legs', 'Calves', 'calf', 1, ['Stand on a step edge, hold the rail', 'All the way up, pause', 'Heel below the step at the bottom'], { perSide: true, loadable: true }),
  // Hinge
  E('glute-bridge', 'Glute bridge', 'hinge', 'Glutes, hamstrings', 'bridge', 1, ['Feet flat, close to your bum', 'Drive hips up, squeeze 1 second', 'Ribs down, don’t arch'], { loadable: true }),
  E('single-leg-bridge', 'Single-leg glute bridge', 'hinge', 'Glutes, hamstrings', 'bridge', 2, ['One foot planted, the other leg straight', 'Hips stay level', 'Squeeze at the top'], { perSide: true, loadable: true }),
  E('pack-hip-thrust', 'Backpack hip thrust', 'hinge', 'Glutes', 'bridge', 3, ['Upper back on the edge of the bed or couch', 'Bag on your hips, hold it in place', 'Chin tucked, drive up'], { equip: ['pack'], loadable: true }),
  E('pack-rdl', 'Backpack Romanian deadlift', 'hinge', 'Hamstrings, glutes, back', 'rdl', 1, ['Hold the bag in front, soft knees', 'Push hips back, flat back', 'Stop when your back would round'], { equip: ['pack'], loadable: true }),
  E('single-leg-rdl', 'Single-leg Romanian deadlift', 'hinge', 'Hamstrings, glutes, balance', 'rdl', 2, ['Hold the bag in the opposite hand', 'Back leg and torso move as one', 'Hips stay square to the floor'], { equip: ['pack'], perSide: true, loadable: true }),
  // Core
  E('plank', 'Plank', 'core', 'Abs, whole core', 'plank', 1, ['Elbows under shoulders', 'Squeeze glutes and quads', 'Straight line head to heels'], { unit: 'secs', loadable: true }),
  E('side-plank', 'Side plank', 'core', 'Obliques', 'sideplank', 1, ['Elbow under shoulder', 'Hips high, body straight', 'Both sides'], { unit: 'secs', perSide: true }),
  E('dead-bug', 'Dead bug', 'core', 'Deep abs', 'deadbug', 1, ['Low back pressed into the floor', 'Opposite arm and leg reach out slowly', 'Breathe out as you reach'], { perSide: true }),
  E('hollow-hold', 'Hollow hold', 'core', 'Abs', 'hollow', 1, ['Low back glued to the floor', 'Arms and legs reach long', 'Bend the knees to make it easier'], { unit: 'secs' }),
  E('leg-raise', 'Lying leg raise', 'core', 'Lower abs, hip flexors', 'legraise', 1, ['Hands under your hips', 'Legs straight, lower slowly', 'Stop before your back arches']),
  // Grip
  E('grip-squeeze', 'Forearm trainer squeezes', 'grip', 'Grip, forearms', 'grip', 1, ['Full squeeze, pause 1 second', 'Open slowly', 'Both hands'], { equip: ['grip'], perSide: true }),
  E('grip-hold', 'Forearm trainer hold', 'grip', 'Grip endurance', 'grip-hold', 1, ['Squeeze shut and hold', 'Breathe, don’t clench your jaw', 'Both hands'], { equip: ['grip'], unit: 'secs', perSide: true }),
  E('pack-farmer', 'Backpack farmer hold', 'grip', 'Grip, traps, core', 'farmer', 1, ['Hold the bag by the top handle', 'Stand tall, shoulders back', 'Swap hands halfway'], { equip: ['pack'], unit: 'secs', loadable: true }),
  E('pack-wrist-curl', 'Backpack wrist curl', 'grip', 'Forearm flexors', 'wrist', 1, ['Forearms on your thighs, palms up', 'Hold the straps and curl at the wrist only', 'Slow and controlled'], { equip: ['pack'], loadable: true }),
];

export const EX: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export const PATTERN_LABEL: Record<Pattern, string> = { push: 'Push', pull: 'Pull', legs: 'Legs', hinge: 'Hips and hamstrings', core: 'Core', grip: 'Grip' };

/** Can this exercise be done with this equipment? */
export const usable = (e: Exercise, hasGrip: boolean) => !e.equip.includes('grip') || hasGrip;

/** The next harder exercise on the same ladder, if any. */
export function harder(id: string): Exercise | null {
  const e = EX[id];
  if (!e) return null;
  return EXERCISES.filter((x) => x.ladder === e.ladder && x.step > e.step).sort((a, b) => a.step - b.step)[0] ?? null;
}

/** The next easier exercise on the same ladder, if any. */
export function easier(id: string): Exercise | null {
  const e = EX[id];
  if (!e) return null;
  return EXERCISES.filter((x) => x.ladder === e.ladder && x.step < e.step).sort((a, b) => b.step - a.step)[0] ?? null;
}

/** "8–12 reps", "30–45 s", "/side" added for one-sided work. */
export function targetText(e: Exercise | undefined, low: number, high: number): string {
  const unit = e?.unit === 'secs' ? 's' : 'reps';
  return `${low === high ? low : `${low}–${high}`} ${unit}${e?.perSide ? ' each side' : ''}`;
}
