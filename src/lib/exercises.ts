// The exercise library.
//  - Gym: machines, dumbbells and cables first (a 14-year-old beginner: technique before load), plus the
//    bodyweight ladders built from the starting benchmarks (push-up, first pull-up, plank).
//  - Home: the old backpack and forearm-trainer moves, flagged `home`. They are kept so workouts logged
//    before the gym still show their names, bests and "last time", but the gym plan never offers them.
// Exercises on a ladder (same `ladder`, rising `step`) are variations of one skill; progress.ts moves up a
// ladder when a bodyweight step is mastered.

import type { Equip, Exercise, LoadKind, Muscle, Pattern } from './types';

export const MUSCLES: Muscle[] = ['chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'lats', 'upperBack', 'lowerBack', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves'];
export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  lats: 'Lats',
  upperBack: 'Upper back',
  lowerBack: 'Lower back',
  abs: 'Abs',
  obliques: 'Obliques',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

interface Opt {
  equip?: Equip[];
  unit?: 'reps' | 'secs';
  perSide?: boolean;
  load?: LoadKind;
  startKg?: number;
  home?: boolean;
  match?: boolean;
  demo?: string;
  mistakes?: string[];
}

const E = (id: string, name: string, pattern: Pattern, primary: Muscle[], secondary: Muscle[], ladder: string, step: number, cues: string[], o: Opt = {}): Exercise => {
  const load = o.load ?? 'none';
  return {
    id,
    name,
    pattern,
    muscles: [...primary, ...secondary].map((m, i) => (i ? MUSCLE_LABEL[m].toLowerCase() : MUSCLE_LABEL[m])).join(', '),
    primary,
    secondary,
    ladder,
    step,
    cues,
    mistakes: o.mistakes,
    equip: o.equip ?? (load === 'db' ? ['db'] : load === 'machine' || load === 'assist' ? ['machine'] : load === 'cable' ? ['cable'] : load === 'pack' ? ['pack'] : ['bw']),
    unit: o.unit ?? 'reps',
    perSide: o.perSide,
    loadable: load !== 'none',
    load,
    startKg: o.startKg,
    home: o.home,
    match: o.match,
    demo: o.demo,
  };
};

const H = { home: true } as const;
const PACK = { home: true, load: 'pack' } as const;

export const EXERCISES: Exercise[] = [
  // ----- Gym: push ------------------------------------------------------------------
  E('chest-press', 'Chest press machine', 'push', ['chest'], ['shoulders', 'triceps'], 'chest-press', 1, ['Set the seat so the handles line up with the middle of your chest', 'Shoulder blades back and down against the pad', 'Press until your arms are straight but not locked hard, then lower for 2 seconds'], {
    load: 'machine',
    startKg: 15,
    demo: 'chest-press',
    mistakes: ['Shoulders rolling forward off the pad', 'Letting the weight stack slam between reps', 'Elbows flared up level with your shoulders'],
  }),
  E('incline-db-press', 'Incline dumbbell press', 'push', ['chest', 'shoulders'], ['triceps'], 'db-press', 1, ['Bench at a low incline (about 30°), feet flat', 'Dumbbells start beside your chest, elbows about 45° from your body', 'Press up and slightly in, lower slowly to chest height'], {
    load: 'db',
    equip: ['db', 'bench'],
    startKg: 6,
    demo: 'db-press',
    mistakes: ['Dumbbells drifting back over your face', 'Bouncing out of the bottom', 'Arching hard to move more weight'],
  }),
  E('db-bench-press', 'Dumbbell bench press', 'push', ['chest'], ['shoulders', 'triceps'], 'db-press', 2, ['Flat bench, feet flat, shoulder blades pinned back', 'Lower until your upper arms are about level with the bench', 'Press up over your chest, wrists stacked over elbows'], {
    load: 'db',
    equip: ['db', 'bench'],
    startKg: 6,
    demo: 'db-press',
    mistakes: ['Elbows flared straight out to the sides', 'Half reps at the top only'],
  }),
  E('shoulder-press-machine', 'Shoulder press machine', 'push', ['shoulders'], ['triceps'], 'shoulder-press', 1, ['Seat height so the handles start level with your ears or just below', 'Back against the pad, ribs down', 'Press up without shrugging, lower under control'], {
    load: 'machine',
    startKg: 10,
    demo: 'shoulder-press',
    mistakes: ['Arching your lower back off the pad', 'Shrugging the shoulders up to your ears', 'Stopping short at the bottom'],
  }),
  E('db-shoulder-press', 'Seated dumbbell shoulder press', 'push', ['shoulders'], ['triceps'], 'shoulder-press', 2, ['Bench upright, back supported', 'Start with the dumbbells at ear height, elbows a little in front of you', 'Press up until your arms are straight, lower slowly'], {
    load: 'db',
    equip: ['db', 'bench'],
    startKg: 5,
    demo: 'shoulder-press',
    mistakes: ['Leaning back to turn it into a chest press', 'Banging the dumbbells together at the top'],
  }),
  E('lateral-raise', 'Dumbbell lateral raise', 'push', ['shoulders'], [], 'lateral-raise', 1, ['Light dumbbells, slight bend in the elbows', 'Raise out to the sides to shoulder height, lead with the elbows', 'Lower for 2–3 seconds'], {
    load: 'db',
    startKg: 2,
    mistakes: ['Swinging the weight up with your body', 'Going heavy: this one is meant to be light'],
  }),
  E('pec-fly', 'Pec fly machine', 'push', ['chest'], ['shoulders'], 'pec-fly', 1, ['Seat so your hands are level with your chest', 'Soft elbows, hug a big tree', 'Open slowly until you feel a stretch, no further'], { load: 'machine', startKg: 10, mistakes: ['Opening so far your shoulders feel pinched'] }),
  E('triceps-pushdown', 'Cable triceps pushdown', 'push', ['triceps'], [], 'pushdown', 1, ['Rope or bar on the high pulley, elbows pinned to your sides', 'Push down until your arms are straight and squeeze', 'Let it come up only until your forearms are just above level'], {
    load: 'cable',
    startKg: 10,
    demo: 'pushdown',
    mistakes: ['Elbows drifting forward and back', 'Leaning over the bar to use bodyweight'],
  }),
  E('overhead-rope-ext', 'Overhead rope triceps extension', 'push', ['triceps'], [], 'tri-overhead', 1, ['Face away from a low-to-mid pulley, rope behind your head', 'Elbows point forward and stay still', 'Straighten your arms, then lower slowly into the stretch'], {
    load: 'cable',
    startKg: 7.5,
    mistakes: ['Elbows flaring wide', 'Arching your lower back'],
  }),
  // Push-up ladder: incline → knee → full.
  E('incline-pushup', 'Incline push-up', 'push', ['chest'], ['shoulders', 'triceps', 'abs'], 'pushup', 1, ['Hands on a bench or a bar set at hip height', 'Body in one straight line, glutes tight', 'Chest to the bench, push away hard'], {
    demo: 'pushup',
    mistakes: ['Hips sagging or piking up', 'Half reps: chest stays far from the bench'],
  }),
  E('knee-pushup', 'Knee push-up', 'push', ['chest'], ['shoulders', 'triceps', 'abs'], 'pushup', 2, ['Knees on a mat, straight line from knees to head', 'Hands a bit wider than your shoulders', 'Chest to a fist off the floor, full lockout at the top'], {
    demo: 'pushup',
    mistakes: ['Bending at the hips so only your head moves', 'Elbows flared straight out'],
  }),
  E('pushup', 'Push-up', 'push', ['chest'], ['shoulders', 'triceps', 'abs'], 'pushup', 3, ['Hands a bit wider than shoulders', 'Elbows about 45° from your body', 'Chest to a fist’s height off the floor'], {
    demo: 'pushup',
    mistakes: ['Hips sagging', 'Counting half reps', 'Head poking forward'],
  }),

  // ----- Gym: pull ------------------------------------------------------------------
  // First strict pull-up ladder. The assisted machine and the lat pulldown are trained alongside it.
  E('chin-neg', 'Chin-up negative', 'pull', ['lats', 'biceps'], ['upperBack', 'forearms'], 'pullup', 1, ['Step up on a box so your chin starts over the bar, palms facing you', 'Lower yourself as slowly as you can: aim for 3–5 seconds', 'Step back up on the box for the next rep. Never jump down from the top'], {
    demo: 'chinup',
    mistakes: ['Dropping fast in the second half', 'Shrugged shoulders: keep them away from your ears', 'Doing more reps once you can’t control the lowering'],
  }),
  E('chinup', 'Chin-up', 'pull', ['lats', 'biceps'], ['upperBack', 'forearms'], 'pullup', 2, ['Palms facing you, hands shoulder width', 'Start from a dead hang, pull your chest toward the bar', 'Chin over the bar, lower all the way under control'], {
    demo: 'chinup',
    mistakes: ['Kicking or swinging', 'Stopping short of straight arms at the bottom', 'Grinding out ugly last reps: stop 1–2 early'],
  }),
  E('pullup-neg', 'Pull-up negative', 'pull', ['lats'], ['upperBack', 'biceps', 'forearms'], 'pullup', 3, ['Palms facing away, hands just wider than your shoulders', 'Start at the top from a box and lower for 3–5 seconds', 'Step back up for each rep'], {
    demo: 'chinup',
    mistakes: ['Dropping fast in the second half', 'Shoulders shrugged up'],
  }),
  E('pullup', 'Pull-up', 'pull', ['lats'], ['upperBack', 'biceps', 'forearms'], 'pullup', 4, ['Palms facing away, hands just wider than your shoulders', 'Pull your elbows down to your ribs', 'Chin over the bar, lower all the way'], {
    demo: 'chinup',
    mistakes: ['Kicking or swinging', 'Half reps'],
  }),
  E('assisted-pullup', 'Assisted pull-up machine', 'pull', ['lats'], ['biceps', 'upperBack', 'forearms'], 'assisted-pullup', 1, ['The weight you pick is help: more weight is easier', 'Knees on the pad, pull your chest up to the handles', 'Lower all the way to straight arms, slowly'], {
    load: 'assist',
    startKg: 40,
    demo: 'chinup',
    mistakes: ['Bouncing off the pad at the bottom', 'Shrugging instead of pulling the elbows down'],
  }),
  E('lat-pulldown', 'Lat pulldown', 'pull', ['lats'], ['biceps', 'upperBack'], 'lat-pulldown', 1, ['Thigh pad snug, grip just wider than your shoulders', 'Lean back a little and pull the bar to your upper chest', 'Elbows down toward your back pockets, let it up slowly'], {
    load: 'machine',
    startKg: 20,
    demo: 'lat-pulldown',
    mistakes: ['Leaning far back and heaving', 'Pulling the bar behind your neck', 'Letting the bar yank your shoulders up at the top'],
  }),
  E('seated-row', 'Seated cable row', 'pull', ['upperBack', 'lats'], ['biceps', 'forearms'], 'row', 1, ['Sit tall, knees soft, chest up', 'Pull the handle to your belly button, elbows close', 'Squeeze your shoulder blades for 1 second, then reach forward without rounding'], {
    load: 'cable',
    startKg: 20,
    demo: 'seated-row',
    mistakes: ['Rocking back and forth to move the weight', 'Shrugging the shoulders up', 'Rounding your lower back on the way forward'],
  }),
  E('machine-row', 'Chest-supported row machine', 'pull', ['upperBack', 'lats'], ['biceps'], 'row', 2, ['Chest stays on the pad the whole time', 'Pull your elbows back past your ribs', 'Pause, then lower slowly'], { load: 'machine', startKg: 15, demo: 'seated-row', mistakes: ['Lifting your chest off the pad to cheat'] }),
  E('db-row', 'One-arm dumbbell row', 'pull', ['lats', 'upperBack'], ['biceps', 'forearms'], 'db-row', 1, ['One hand and knee on a bench, back flat like a table', 'Pull the dumbbell to your hip, elbow past your ribs', 'Weaker arm first; the other arm does the same reps'], {
    load: 'db',
    equip: ['db', 'bench'],
    perSide: true,
    match: true,
    startKg: 6,
    demo: 'db-row',
    mistakes: ['Twisting your body open to lift it', 'Yanking it up with a jerk', 'Rounded back'],
  }),
  E('face-pull', 'Cable face pull', 'pull', ['upperBack', 'shoulders'], [], 'face-pull', 1, ['Rope on a pulley at face height, light weight', 'Pull the rope to your eyebrows, elbows high and wide', 'Finish with your hands beside your ears, pause'], { load: 'cable', startKg: 7.5, mistakes: ['Going heavy and leaning back', 'Elbows dropping below the hands'] }),
  E('db-curl', 'One-arm dumbbell curl', 'pull', ['biceps'], ['forearms'], 'curl', 1, ['Stand tall, elbow pinned to your side, palm up', 'Curl up without the elbow drifting forward, squeeze at the top', 'Lower for 2–3 seconds. Weaker arm first; the other arm matches its reps'], {
    load: 'db',
    perSide: true,
    match: true,
    startKg: 4,
    demo: 'db-curl',
    mistakes: ['Swinging your body to get it up', 'Elbow sliding forward', 'Doing extra reps with the stronger arm'],
  }),
  E('cable-curl', 'One-arm cable curl', 'pull', ['biceps'], ['forearms'], 'cable-curl', 1, ['Single handle on the low pulley, stand a step back', 'Elbow by your side, curl to your shoulder', 'The cable keeps tension all the way down: lower slowly. Weaker arm first'], {
    load: 'cable',
    perSide: true,
    match: true,
    startKg: 5,
    demo: 'db-curl',
    mistakes: ['Leaning back as you curl', 'Letting the stack drop between reps'],
  }),
  E('hammer-curl', 'Hammer curl', 'pull', ['biceps', 'forearms'], [], 'hammer-curl', 1, ['Palms face each other, like holding a hammer', 'One arm at a time, elbow still', 'Weaker arm first; the other arm matches its reps'], {
    load: 'db',
    perSide: true,
    match: true,
    startKg: 4,
    demo: 'db-curl',
    mistakes: ['Swinging', 'Shrugging the shoulder up'],
  }),
  E('incline-db-curl', 'Incline dumbbell curl', 'pull', ['biceps'], ['forearms'], 'curl', 2, ['Bench at about 60°, arms hang straight down behind your body', 'Curl without your elbows coming forward', 'Slow on the way down, feel the stretch'], {
    load: 'db',
    equip: ['db', 'bench'],
    perSide: true,
    match: true,
    startKg: 3,
    demo: 'db-curl',
    mistakes: ['Shoulders rolling forward', 'Too heavy to keep the elbows back'],
  }),
  E('dead-hang', 'Dead hang', 'pull', ['forearms'], ['lats', 'shoulders'], 'hang', 1, ['Hang from the bar with straight arms', 'Shoulders slightly pulled down, not jammed by your ears', 'Step down before your grip gives out'], { unit: 'secs', mistakes: ['Dropping off the bar instead of stepping down'] }),

  // ----- Gym: legs ------------------------------------------------------------------
  E('goblet-squat', 'Goblet squat', 'legs', ['quads', 'glutes'], ['abs', 'upperBack'], 'gym-squat', 1, ['Hold one dumbbell against your chest, elbows under it', 'Feet shoulder width, sit down between your heels', 'Chest up, knees follow your toes, stand up through the whole foot'], {
    load: 'db',
    startKg: 8,
    demo: 'goblet-squat',
    mistakes: ['Heels lifting', 'Knees caving in', 'Folding forward so the dumbbell pulls you down'],
  }),
  E('leg-press', 'Leg press', 'legs', ['quads', 'glutes'], ['hamstrings'], 'leg-press', 1, ['Feet shoulder width in the middle of the plate, back and hips flat on the pad', 'Lower until your knees are about 90°, hips stay down', 'Press up without locking your knees hard. Use the safety stops'], {
    load: 'machine',
    startKg: 40,
    demo: 'leg-press',
    mistakes: ['Hips rolling off the pad at the bottom', 'Snapping the knees locked', 'Pushing on your knees with your hands'],
  }),
  E('leg-extension', 'Leg extension', 'legs', ['quads'], [], 'leg-extension', 1, ['Knee joint lined up with the machine’s pivot', 'Straighten your legs and squeeze for 1 second', 'Lower for 2–3 seconds'], { load: 'machine', startKg: 15, mistakes: ['Kicking the weight up', 'Hips lifting off the seat'] }),
  E('db-split-squat', 'Dumbbell split squat', 'legs', ['quads', 'glutes'], ['hamstrings'], 'gym-single-leg', 1, ['Long stance, back heel up, a dumbbell in each hand (start with none)', 'Drop the back knee straight down to just above the floor', 'Front knee over the middle of the foot. Weaker leg first'], {
    load: 'db',
    perSide: true,
    startKg: 0,
    demo: 'split-squat',
    mistakes: ['Stance too short so the front heel lifts', 'Pushing off the back leg', 'Leaning far forward'],
  }),
  E('standing-calf-raise', 'Calf raise', 'legs', ['calves'], [], 'gym-calf', 1, ['Balls of your feet on the edge of a step or the calf machine', 'All the way up, pause for 1 second', 'Lower until you feel a stretch, no bouncing'], { load: 'machine', startKg: 20, mistakes: ['Bouncing', 'Tiny range of movement'] }),

  // ----- Gym: hips and hamstrings ---------------------------------------------------
  E('db-rdl', 'Dumbbell Romanian deadlift', 'hinge', ['hamstrings', 'glutes'], ['lowerBack', 'forearms'], 'gym-rdl', 1, ['Dumbbells in front of your thighs, knees soft', 'Push your hips back like closing a door with your bum, back flat', 'Stop at about mid-shin or when your back would round, then squeeze your glutes to stand'], {
    load: 'db',
    startKg: 6,
    demo: 'db-rdl',
    mistakes: ['Rounding your back to reach lower', 'Turning it into a squat', 'Dumbbells drifting away from your legs'],
  }),
  E('leg-curl', 'Seated leg curl', 'hinge', ['hamstrings'], ['calves'], 'leg-curl', 1, ['Knee joint lined up with the pivot, thigh pad snug', 'Curl your heels under the seat and squeeze', 'Let it back up slowly'], { load: 'machine', startKg: 15, mistakes: ['Letting the stack pull your legs back fast', 'Hips lifting'] }),
  E('back-extension', 'Back extension', 'hinge', ['lowerBack', 'glutes'], ['hamstrings'], 'back-ext', 1, ['Pad just below your hips, arms crossed on your chest', 'Hinge down with a flat back', 'Come up until your body is one straight line, no higher'], { mistakes: ['Swinging up past straight', 'Rounding and jerking'] }),
  E('glute-bridge', 'Glute bridge', 'hinge', ['glutes'], ['hamstrings'], 'bridge', 1, ['Feet flat, close to your bum', 'Drive hips up, squeeze 1 second', 'Ribs down, don’t arch']),

  // ----- Gym: core ------------------------------------------------------------------
  // Plank ladder: holds stop at 2 minutes, then it moves to harder variations.
  E('plank', 'Plank', 'core', ['abs'], ['obliques', 'shoulders'], 'plank', 1, ['Elbows under shoulders', 'Squeeze glutes and quads', 'Straight line head to heels'], { unit: 'secs', demo: 'plank', mistakes: ['Hips sagging: end the set when they drop', 'Bum piking up', 'Holding your breath'] }),
  E('plank-taps', 'Plank shoulder taps', 'core', ['abs', 'obliques'], ['shoulders'], 'plank', 2, ['Push-up position, feet wide', 'Tap one shoulder with the opposite hand', 'Hips stay square to the floor: no rocking'], { perSide: true, demo: 'plank', mistakes: ['Hips swaying side to side', 'Rushing'] }),
  E('long-lever-plank', 'Long-lever plank', 'core', ['abs'], ['shoulders', 'obliques'], 'plank', 3, ['Like a plank, but elbows a hand’s length in front of your shoulders', 'Tuck your tailbone, squeeze everything', 'Stop when your lower back starts to dip'], { unit: 'secs', demo: 'plank', mistakes: ['Lower back dipping'] }),
  E('ball-rollout', 'Stability ball roll-out', 'core', ['abs'], ['lats', 'shoulders'], 'plank', 4, ['Kneel, forearms on a gym ball', 'Roll the ball forward as far as you can keep your back flat', 'Pull back with your abs'], { mistakes: ['Lower back sagging at the far point'] }),
  E('side-plank', 'Side plank', 'core', ['obliques'], ['abs', 'shoulders'], 'sideplank', 1, ['Elbow under shoulder', 'Hips high, body straight', 'Both sides'], { unit: 'secs', perSide: true }),
  E('dead-bug', 'Dead bug', 'core', ['abs'], ['obliques'], 'deadbug', 1, ['Low back pressed into the floor', 'Opposite arm and leg reach out slowly', 'Breathe out as you reach'], { perSide: true }),
  E('pallof-press', 'Pallof press', 'core', ['obliques', 'abs'], ['shoulders'], 'pallof', 1, ['Stand side-on to a cable at chest height, handle at your chest', 'Press straight out and hold 2 seconds: don’t let it turn you', 'Back to your chest. Both sides'], { load: 'cable', perSide: true, startKg: 5, mistakes: ['Twisting toward the machine', 'Too heavy to stay square'] }),
  E('hollow-hold', 'Hollow hold', 'core', ['abs'], [], 'hollow', 1, ['Low back glued to the floor', 'Arms and legs reach long', 'Bend the knees to make it easier'], { unit: 'secs' }),
  E('leg-raise', 'Lying leg raise', 'core', ['abs'], [], 'legraise', 1, ['Hands under your hips', 'Legs straight, lower slowly', 'Stop before your back arches']),
  E('squat', 'Bodyweight squat', 'legs', ['quads', 'glutes'], [], 'squat', 1, ['Feet shoulder width, toes slightly out', 'Sit between your heels, chest up', 'Knees follow your toes'], { demo: 'goblet-squat' }),
  E('split-squat', 'Split squat', 'legs', ['quads', 'glutes'], [], 'single-leg', 1, ['Long stance, back heel up', 'Drop the back knee straight down', 'Front knee over the middle of the foot'], { perSide: true, demo: 'split-squat' }),
  E('reverse-lunge', 'Reverse lunge', 'legs', ['quads', 'glutes'], [], 'lunge', 1, ['Step back, both knees to 90°', 'Stay tall', 'Push back up with the front leg'], { perSide: true }),

  // ----- Home (before the gym): kept for history ------------------------------------
  E('wall-pushup', 'Wall push-up', 'push', ['chest'], ['shoulders', 'triceps'], 'home-hpush', 1, ['Hands on the wall at shoulder height', 'Body in one straight line', 'Chest to the wall, push away hard'], H),
  E('pack-pushup', 'Backpack push-up', 'push', ['chest'], ['shoulders', 'triceps'], 'home-hpush', 4, ['Straps tight so the bag sits high on your back', 'Same form as a push-up', 'Full lockout at the top'], PACK),
  E('decline-pushup', 'Decline push-up', 'push', ['chest', 'shoulders'], ['triceps'], 'home-hpush', 5, ['Feet on a chair or bed', 'Keep your core tight, no sagging', 'Lower slowly, 2 seconds down'], PACK),
  E('archer-pushup', 'Archer push-up', 'push', ['chest'], ['triceps'], 'home-hpush', 6, ['Very wide hands', 'Shift over one arm, the other stays straight', 'Alternate sides'], { ...H, perSide: true }),
  E('diamond-pushup', 'Diamond push-up', 'push', ['triceps'], ['chest'], 'tri', 2, ['Thumbs and index fingers make a diamond', 'Elbows brush your ribs', 'Drop to knees if form breaks'], PACK),
  E('chair-dip', 'Chair dip', 'push', ['triceps'], ['chest'], 'tri', 1, ['Hands on a sturdy chair behind you', 'Shoulders down, away from ears', 'Lower to 90° at the elbow, no deeper'], H),
  E('pike-pushup', 'Pike push-up', 'push', ['shoulders'], ['triceps'], 'vpush', 1, ['Hips high, upside-down V', 'Head moves forward of your hands', 'Elbows track back, not flared'], H),
  E('elevated-pike', 'Feet-up pike push-up', 'push', ['shoulders'], ['triceps'], 'vpush', 2, ['Feet on a chair, hips over hands', 'Lower the top of your head toward the floor', 'Press back up in a straight line'], H),
  E('wall-handstand', 'Wall handstand hold', 'push', ['shoulders'], ['abs'], 'vpush', 3, ['Walk your feet up the wall, chest facing it', 'Push the floor away, arms straight', 'Come down whenever you need to'], { ...H, unit: 'secs' }),
  E('pack-row', 'Backpack row', 'pull', ['upperBack', 'lats'], ['biceps'], 'home-row', 1, ['Hinge forward, flat back', 'Pull the bag to your belly button', 'Squeeze 1 second at the top'], PACK),
  E('one-arm-row', 'One-arm backpack row', 'pull', ['lats', 'upperBack'], ['biceps'], 'home-row', 2, ['Free hand on a chair or bed', 'Pull your elbow past your ribs', 'No twisting'], { ...PACK, perSide: true }),
  E('table-row', 'Table row', 'pull', ['upperBack', 'lats'], ['biceps'], 'home-row', 3, ['Lie under a sturdy table, grip the edge', 'Body straight, pull your chest to the edge', 'Only if the table is solid and won’t tip'], H),
  E('pack-reverse-fly', 'Backpack reverse fly', 'pull', ['upperBack', 'shoulders'], [], 'fly', 1, ['Hold the bag by its top handle, hinge forward', 'Arms slightly bent, raise to the sides', 'Slow on the way down'], PACK),
  E('ytw', 'Prone Y-T-W raise', 'pull', ['upperBack', 'shoulders'], [], 'ytw', 1, ['Lie face down, thumbs up', 'Lift arms in a Y, then T, then W', 'Pause at the top of each'], H),
  E('pack-curl', 'Backpack curl', 'pull', ['biceps'], ['forearms'], 'home-curl', 1, ['Hold the bag by both straps', 'Elbows pinned to your sides', 'No swinging'], PACK),
  E('superman', 'Superman hold', 'pull', ['lowerBack'], ['glutes'], 'superman', 1, ['Lie face down, arms forward', 'Lift arms, chest and legs together', 'Look at the floor, not up'], { ...H, unit: 'secs' }),
  E('pack-squat', 'Backpack squat', 'legs', ['quads', 'glutes'], [], 'squat', 2, ['Bag on your front or back, straps tight', 'Full depth you can control', 'Drive up through the whole foot'], PACK),
  E('bulgarian', 'Bulgarian split squat', 'legs', ['quads', 'glutes'], [], 'single-leg', 2, ['Back foot on a chair or bed', 'Torso slightly forward', 'Control the bottom, don’t bounce'], { ...PACK, perSide: true }),
  E('shrimp-squat', 'Shrimp squat', 'legs', ['quads'], ['glutes'], 'single-leg', 3, ['Hold your back foot behind you', 'Lower until the back knee taps a cushion', 'Hold a wall for balance at first'], { ...H, perSide: true }),
  E('step-up', 'Step-up', 'legs', ['quads', 'glutes'], [], 'stepup', 1, ['Sturdy chair or the bottom stair', 'Push through the top foot only', 'Step down slowly'], { ...PACK, perSide: true }),
  E('wall-sit', 'Wall sit', 'legs', ['quads'], [], 'wallsit', 1, ['Back flat on the wall', 'Thighs parallel to the floor', 'Breathe steadily'], { ...PACK, unit: 'secs' }),
  E('calf-raise', 'Single-leg calf raise', 'legs', ['calves'], [], 'calf', 1, ['Stand on a step edge, hold the rail', 'All the way up, pause', 'Heel below the step at the bottom'], { ...PACK, perSide: true }),
  E('single-leg-bridge', 'Single-leg glute bridge', 'hinge', ['glutes'], ['hamstrings'], 'bridge', 2, ['One foot planted, the other leg straight', 'Hips stay level', 'Squeeze at the top'], { ...PACK, perSide: true }),
  E('pack-hip-thrust', 'Backpack hip thrust', 'hinge', ['glutes'], ['hamstrings'], 'bridge', 3, ['Upper back on the edge of the bed or couch', 'Bag on your hips, hold it in place', 'Chin tucked, drive up'], PACK),
  E('pack-rdl', 'Backpack Romanian deadlift', 'hinge', ['hamstrings', 'glutes'], ['lowerBack'], 'rdl', 1, ['Hold the bag in front, soft knees', 'Push hips back, flat back', 'Stop when your back would round'], PACK),
  E('single-leg-rdl', 'Single-leg Romanian deadlift', 'hinge', ['hamstrings', 'glutes'], [], 'rdl', 2, ['Hold the bag in the opposite hand', 'Back leg and torso move as one', 'Hips stay square to the floor'], { ...PACK, perSide: true }),
  E('grip-squeeze', 'Forearm trainer squeezes', 'grip', ['forearms'], [], 'grip', 1, ['Full squeeze, pause 1 second', 'Open slowly', 'Both hands'], { ...H, equip: ['grip'], perSide: true }),
  E('grip-hold', 'Forearm trainer hold', 'grip', ['forearms'], [], 'grip-hold', 1, ['Squeeze shut and hold', 'Breathe, don’t clench your jaw', 'Both hands'], { ...H, equip: ['grip'], unit: 'secs', perSide: true }),
  E('pack-farmer', 'Backpack farmer hold', 'grip', ['forearms'], ['upperBack', 'abs'], 'farmer', 1, ['Hold the bag by the top handle', 'Stand tall, shoulders back', 'Swap hands halfway'], { ...PACK, unit: 'secs' }),
  E('pack-wrist-curl', 'Backpack wrist curl', 'grip', ['forearms'], [], 'wrist', 1, ['Forearms on your thighs, palms up', 'Hold the straps and curl at the wrist only', 'Slow and controlled'], PACK),
];

export const EX: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export const PATTERN_LABEL: Record<Pattern, string> = { push: 'Push', pull: 'Pull', legs: 'Legs', hinge: 'Hips and hamstrings', core: 'Core', grip: 'Grip' };

/** Offered in the gym plan? The old home moves are history only. */
export const usable = (e: Exercise) => !e.home;

/** The next harder exercise on the same ladder, if any. */
export function harder(id: string): Exercise | null {
  const e = EX[id];
  if (!e) return null;
  return EXERCISES.filter((x) => x.ladder === e.ladder && x.step > e.step && !!x.home === !!e.home).sort((a, b) => a.step - b.step)[0] ?? null;
}

/** The next easier exercise on the same ladder, if any. */
export function easier(id: string): Exercise | null {
  const e = EX[id];
  if (!e) return null;
  return EXERCISES.filter((x) => x.ladder === e.ladder && x.step < e.step && !!x.home === !!e.home).sort((a, b) => b.step - a.step)[0] ?? null;
}

/** "8–12 reps", "30–45 s", "/side" added for one-sided work. */
export function targetText(e: Exercise | undefined, low: number, high: number): string {
  const unit = e?.unit === 'secs' ? 's' : 'reps';
  return `${low === high ? low : `${low}–${high}`} ${unit}${e?.perSide ? (e.match ? ' each arm' : ' each side') : ''}`;
}

/** "6 kg each", "20 kg", "40 kg help", "" for bodyweight. */
export function loadText(e: Exercise | undefined, kg: number): string {
  if (!e || !e.loadable || !kg) return '';
  if (e.load === 'assist') return `${kg} kg help`;
  if (e.load === 'db' && !e.perSide && e.id !== 'goblet-squat') return `${kg} kg each`;
  return `${kg} kg`;
}

/** What the weight field means for this exercise. */
export const loadLabel = (e: Exercise | undefined): string =>
  !e ? 'Weight kg' : e.load === 'assist' ? 'Help kg' : e.load === 'db' ? (e.perSide || e.id === 'goblet-squat' ? 'Dumbbell kg' : 'Each dumbbell kg') : e.load === 'pack' ? 'Backpack kg' : 'Weight kg';
