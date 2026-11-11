// Form demos: for each main exercise, a short loop of poses for the mannequin (rig.ts), the gear to draw around it
// and one plain cue per phase. Pure data and maths: the 3D view and the 2D fallback both read this.
// The longer form cues and common mistakes live on the exercises (EX[id].cues, .mistakes), not here.

import { ANKLE_Y, FOOT_R, STAND_Y, add, apply, fk, mid, mixPose, mixV, pin, pose, reachArm, reachLeg, rotX, sub, ease, type JointName, type Joints, type Part, type Pose, type Side, type Vec3 } from './rig';

/** A point to hang gear on: a joint, the middle of both hands or feet, or a fixed spot in the room. */
export type Anchor = JointName | 'hands' | 'feet' | Vec3;

export type Prop =
  /** A block: bench, seat, back pad, step, mat, foot plate. `pitch` tips it like the body's pitch; `off` is in the block's own axes. */
  | { kind: 'box'; at: Anchor; size: Vec3; pitch?: number; off?: Vec3; tone?: 'pad' | 'frame' | 'mat' }
  /** A round bar or cable between two points; `extend` makes it stick out past both ends. */
  | { kind: 'rod'; a: Anchor; b: Anchor; r: number; extend?: number; tone?: 'steel' | 'cable' }
  /** A dumbbell centred on a point, its handle along a world axis. */
  | { kind: 'dumbbell'; at: Anchor; axis: 'x' | 'y' | 'z' };

export interface Phase {
  name: string;
  cue: string;
  /** The pose at the end of this phase. */
  pose: Pose;
  /** How long it takes to get here from the phase before. */
  secs: number;
  /** In-between poses on the way here, so hands stay on the bar and feet on the floor. */
  via?: Pose[];
}

export interface Demo {
  id: string;
  name: string;
  /** Where to look from: degrees round the figure (0 = from the front, 90 = from its left), degrees above, metres away (30° lens), and the point to look at. */
  camera: { yaw: number; pitch: number; dist: number; target: Vec3 };
  props: Prop[];
  phases: Phase[];
  /** The limbs doing the work, for a subtle highlight. */
  work: Part[];
}

export function anchorAt(j: Joints, a: Anchor): Vec3 {
  if (typeof a !== 'string') return a;
  if (a === 'hands') return mid(j.lHand, j.rHand);
  if (a === 'feet') return mid(mid(j.lHeel, j.lToe), mid(j.rHeel, j.rToe));
  return j[a];
}

// ----- Helpers for writing poses -------------------------------------------------------

const SIDES: Side[] = ['l', 'r'];
const sg = (s: Side) => (s === 'l' ? 1 : -1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const shoulders = (j: Joints) => mid(j.lShoulder, j.rShoulder);
const toes = (j: Joints) => mid(j.lToe, j.rToe);

/** Both hands to mirrored targets. `at` and `pole` are given for the left side (x is flipped for the right). */
function hands(p: Pose, at: Vec3, pole: Vec3): Pose {
  for (const s of SIDES) p = reachArm(p, s, [at[0] * sg(s), at[1], at[2]], [pole[0] * sg(s), pole[1], pole[2]]);
  return p;
}

/** Both ankles to mirrored targets (given for the left side). */
function feet(p: Pose, at: Vec3, pole: Vec3 = [0.12, 0, 1], toeDown = 0): Pose {
  for (const s of SIDES) p = reachLeg(p, s, [at[0] * sg(s), at[1], at[2]], [pole[0] * sg(s), pole[1], pole[2]], toeDown);
  return p;
}

/** Put a foot's toe on `toe` (rather than its ankle): reach, see where the toe landed, correct, repeat. */
function toeTo(p: Pose, s: Side, toe: Vec3, pole: Vec3, toeDown: number): Pose {
  let ankle = add(toe, [0, 0.16, -0.04]);
  for (let i = 0; i < 4; i++) {
    p = reachLeg(p, s, ankle, pole, toeDown);
    ankle = add(ankle, sub(toe, fk(p)[`${s}Toe`]));
  }
  return reachLeg(p, s, ankle, pole, toeDown);
}

/** A point given in a tipped block's own axes. */
const tipped = (from: Vec3, pitch: number, off: Vec3): Vec3 => add(from, apply(rotX(pitch), off));

interface Step {
  name: string;
  cue: string;
  /** Where along the movement this phase ends: 0 = start position, 1 = the far end. */
  to: number;
  secs: number;
}

function demo(id: string, name: string, camera: Demo['camera'], work: Part[], props: Prop[], build: (u: number) => Pose, steps: Step[]): Demo {
  const phases = steps.map((s, i): Phase => {
    const from = steps[(i + steps.length - 1) % steps.length].to;
    const via = from === s.to ? undefined : [1, 2, 3, 4, 5, 6, 7].map((k) => build(lerp(from, s.to, k / 8)));
    return { name: s.name, cue: s.cue, pose: build(s.to), secs: s.secs, via };
  });
  return { id, name, camera, work, props, phases };
}

// ----- The movements. Each takes u from 0 (start) to 1 (far end) and returns a pose --------

const SEAT = 0.45; // seat top
const SIT_Y = SEAT + 0.105; // pelvis height when sitting on it

// Push-up: the body turns about the toes as one straight line; hands stay planted.
function pushupBody(lift: number): Pose {
  return pin(pose({ pitch: 90 - lift, neck: -6 }), toes, [0, FOOT_R, -0.85]);
}
function pushup(u: number): Pose {
  const z = shoulders(fk(pushupBody(19)))[2] + 0.02;
  return hands(pushupBody(lerp(19, 2.5, u)), [0.275, 0.04, z], [0.7, 0.25, -0.7]);
}

// Plank: from the knees (u = 0) up to a straight line on the forearms (u = 1).
function plank(u: number): Pose {
  const up = pin(pose({ pitch: 90 - 6.5, neck: -4 }), toes, [0, FOOT_R, -0.85]);
  const sh = shoulders(fk(up));
  const kneel = pin(pose({ pitch: 90 - 17.8, neck: -4, both: { knee: 32, ankle: -72 } }), shoulders, sh);
  return hands(mixPose(kneel, up, u), [0.15, 0.04, sh[2] + 0.31], [0.15, -1, -0.45]);
}

const BAR_Y = 2.2;
function chinup(u: number): Pose {
  let p = pose({ pitch: lerp(0, -12, u), neck: lerp(0, -14, u), both: { hipFlex: lerp(6, 16, u), knee: lerp(8, 22, u), ankle: -25 } });
  p = pin(p, shoulders, [0, lerp(BAR_Y - 0.612, BAR_Y - 0.085, u), lerp(0, -0.17, u)]);
  return hands(p, [0.2, BAR_Y, 0], [0.35, -1, 0.55]);
}

function seated(pitch: number, seat = SIT_Y, footZ = 0.42): Pose {
  return feet(pose({ root: [0, seat, 0], pitch }), [0.15, ANKLE_Y, footZ], [0.15, 1, 0.3]);
}

function latPulldown(u: number): Pose {
  const p = feet(pose({ root: [0, 0.5 + 0.105, 0], pitch: lerp(-4, -16, u) }), [0.14, ANKLE_Y, 0.4], [0.1, 1, 0.3]);
  const m = shoulders(fk(p));
  const bar = mixV(add(m, [0, 0.57, 0.05]), add(m, [0, -0.03, 0.2]), u);
  return hands(p, [0.36, bar[1], bar[2]], [0.7, -1, -0.25]);
}

const ROW_SEAT = 0.42 + 0.105;
function seatedRow(u: number): Pose {
  const p = feet(pose({ root: [0, ROW_SEAT, 0], pitch: lerp(10, -4, u) }), [0.13, 0.33, 0.78], [0.15, 1, 0], -55);
  return hands(p, [lerp(0.07, 0.1, u), ROW_SEAT + 0.2, lerp(0.6, 0.17, u)], [0.4, -1, -0.5]);
}

const BENCH = 0.42;
function dbRow(u: number): Pose {
  let p = pose({ root: [0, 0.9, 0], pitch: 78, neck: -12 });
  p = reachLeg(p, 'l', [0.11, BENCH + 0.055, -0.2], [0, -1, 0.6], 55); // knee on the bench
  p = reachLeg(p, 'r', [-0.3, ANKLE_Y, -0.12], [-0.2, 0, 1]); // other foot on the floor
  const j = fk(p);
  p = reachArm(p, 'l', [0.13, BENCH + 0.035, j.lShoulder[2] + 0.04], [0.4, 0, -1]); // hand on the bench
  const hang: Vec3 = [-0.2, j.rShoulder[1] - 0.6, j.rShoulder[2]];
  return reachArm(p, 'r', mixV(hang, [-0.25, 0.87, 0.12], u), [-0.3, 1, -0.6]);
}

function chestPress(u: number): Pose {
  const p = seated(-8);
  const sh = shoulders(fk(p));
  return hands(p, [lerp(0.27, 0.22, u), sh[1] - 0.06, sh[2] + lerp(0.2, 0.57, u)], [0.8, -0.75, -0.3]);
}

const INCLINE = 30;
function dbPress(u: number): Pose {
  const p = feet(pose({ root: [0, SIT_Y, 0], pitch: INCLINE - 90 }), [0.2, ANKLE_Y, 0.45], [0.2, 1, 0.2]);
  const sh = shoulders(fk(p));
  // u = 0 is the top (arms straight over the shoulders), u = 1 the bottom (beside the chest).
  return hands(p, [lerp(0.2, 0.36, u), sh[1] + lerp(0.6, 0.1, u), sh[2] + lerp(0.03, 0.1, u)], [0.6, -1, 0.45]);
}

function shoulderPress(u: number): Pose {
  const p = seated(-5);
  const sh = shoulders(fk(p));
  return hands(p, [lerp(0.385, 0.21, u), sh[1] + lerp(0.15, 0.6, u), sh[2] + lerp(0.1, 0.03, u)], [1, -0.7, 0.3]);
}

function dbCurl(u: number): Pose {
  return pose({ both: { shAbd: 6, elbow: 6 }, l: { shFlex: lerp(0, 6, u), elbow: lerp(6, 138, u) } });
}

function pushdown(u: number): Pose {
  let p = feet(pose({ root: [0, STAND_Y - 0.02, -0.03], pitch: 12 }), [0.12, ANKLE_Y, 0]);
  const j = fk(p);
  const bend = lerp(100, 8, u) * (Math.PI / 180);
  for (const s of SIDES) {
    const upper: Vec3 = [sg(s) * 0.02, -0.29, 0.02];
    const elbow = add(j[`${s}Shoulder`], upper);
    p = reachArm(p, s, add(elbow, [0, -0.33 * Math.cos(bend), 0.33 * Math.sin(bend)]), upper);
  }
  return p;
}

function gobletSquat(u: number): Pose {
  const e = u;
  let p = pose({ root: [0, lerp(STAND_Y - 0.008, 0.54, e), lerp(0, -0.23, e)], pitch: lerp(0, 34, e), neck: lerp(0, -18, e) });
  p = feet(p, [0.17, ANKLE_Y, 0], [0.36, 0, 1]);
  const j = fk(p);
  const lean = rotX(p.pitch);
  for (const s of SIDES) p = reachArm(p, s, add(j.chest, apply(lean, [sg(s) * 0.07, 0.09, 0.185])), [sg(s) * 0.35, -1, 0.1]);
  return p;
}

const PRESS_BACK = -35;
function legPress(u: number): Pose {
  let p = pose({ root: [0, SIT_Y, 0], pitch: PRESS_BACK });
  const reach = lerp(0.855, 0.63, u);
  for (const s of SIDES) {
    const hip = fk(p)[`${s}Hip`];
    p = reachLeg(p, s, add(hip, [sg(s) * 0.04, 0.242 * reach, 0.97 * reach]), [sg(s) * 0.25, 1, 0.2], -76);
  }
  return hands(p, [0.3, SEAT - 0.02, 0.06], [0.5, 0, -1]);
}

function dbRdl(u: number): Pose {
  let p = pose({ root: [0, lerp(STAND_Y - 0.006, 0.914, u), lerp(0, -0.24, u)], pitch: lerp(0, 75, u) });
  p = feet(p, [0.11, ANKLE_Y, 0], [0.1, 0, 1]);
  const sh = shoulders(fk(p));
  return hands(p, [0.15, sh[1] - 0.59, lerp(0.12, sh[2], u)], [0.2, 0, -1]);
}

function splitSquat(u: number): Pose {
  let p = pose({ root: [0, lerp(0.9, 0.6, u), 0], pitch: 5, both: { shAbd: 7, elbow: 6 } });
  p = reachLeg(p, 'l', [0.1, ANKLE_Y, 0.33], [0.1, 0, 1]); // front foot flat
  // Back foot on its toes, heel up 60°.
  return toeTo(p, 'r', [-0.1, FOOT_R, -0.5], [0, -0.3, 1], 60);
}

// ----- Gear ---------------------------------------------------------------------------

const mat = (len = 2, z = -0.1): Prop => ({ kind: 'box', at: [0, 0.008, z], size: [0.7, 0.016, len], tone: 'mat' });
const seat = (y = SEAT, z = 0.06): Prop[] => [
  { kind: 'box', at: [0, y - 0.04, z], size: [0.36, 0.08, 0.42], tone: 'pad' },
  { kind: 'box', at: [0, (y - 0.08) / 2, z - 0.02], size: [0.12, y - 0.08, 0.12], tone: 'frame' },
];
const backPad = (pitch: number, from: Vec3 = [0, SIT_Y, 0], height = 0.78): Prop => ({ kind: 'box', at: tipped(from, pitch, [0, height / 2 - 0.06, -0.155]), size: [0.34, height, 0.07], pitch, tone: 'pad' });
const dumbbells = (axis: 'x' | 'y' | 'z'): Prop[] => [
  { kind: 'dumbbell', at: 'lHand', axis },
  { kind: 'dumbbell', at: 'rHand', axis },
];

// ----- The 15 demos ---------------------------------------------------------------------

const list: Demo[] = [
  demo('pushup', 'Push-up', { yaw: 62, pitch: 14, dist: 3.5, target: [0, 0.32, -0.15] }, ['arm', 'torso'], [mat()], pushup, [
    { name: 'Start', cue: 'Hands a bit wider than your shoulders. Body in one straight line.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down, elbows about 45° from your body.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Chest a fist off the floor. Hips stay level with your shoulders.', to: 1, secs: 0.5 },
    { name: 'Press', cue: 'Push the floor away until your arms are straight.', to: 0, secs: 1 },
  ]),
  demo(
    'chinup',
    'Chin-up',
    { yaw: 48, pitch: 6, dist: 5.2, target: [0, 1.2, 0] },
    ['arm'],
    [
      { kind: 'rod', a: [-0.62, BAR_Y, 0], b: [0.62, BAR_Y, 0], r: 0.018 },
      { kind: 'box', at: [-0.64, 1.125, 0], size: [0.06, 2.25, 0.06], tone: 'frame' },
      { kind: 'box', at: [0.64, 1.125, 0], size: [0.06, 2.25, 0.06], tone: 'frame' },
    ],
    chinup,
    [
      { name: 'Hang', cue: 'Start from a dead hang: arms straight, shoulders away from your ears.', to: 0, secs: 0.7 },
      { name: 'Pull', cue: 'Pull your elbows down to your ribs. No kicking or swinging.', to: 1, secs: 1.2 },
      { name: 'Top', cue: 'Chin over the bar, chest toward it.', to: 1, secs: 0.5 },
      { name: 'Lower', cue: 'Lower slowly, all the way to straight arms.', to: 0, secs: 2.5 },
    ],
  ),
  demo(
    'lat-pulldown',
    'Lat pulldown',
    { yaw: 52, pitch: 8, dist: 4.9, target: [0, 1.12, 0.15] },
    ['arm'],
    [
      ...seat(0.5),
      { kind: 'box', at: [0, 0.72, 0.27], size: [0.4, 0.09, 0.16], tone: 'pad' },
      { kind: 'box', at: [0, 1.15, 0.85], size: [0.14, 2.3, 0.14], tone: 'frame' },
      { kind: 'box', at: [0, 2.27, 0.48], size: [0.07, 0.07, 0.8], tone: 'frame' },
      { kind: 'rod', a: 'lHand', b: 'rHand', r: 0.016, extend: 0.14 },
      { kind: 'rod', a: [0, 2.24, 0.12], b: 'hands', r: 0.006, tone: 'cable' },
    ],
    latPulldown,
    [
      { name: 'Reach', cue: 'Arms long, grip just wider than your shoulders.', to: 0, secs: 0.6 },
      { name: 'Pull', cue: 'Lean back a little and pull the bar to your upper chest.', to: 1, secs: 1.2 },
      { name: 'Squeeze', cue: 'Elbows down toward your back pockets.', to: 1, secs: 0.5 },
      { name: 'Return', cue: 'Let it up slowly. Don’t let it yank your shoulders up.', to: 0, secs: 2 },
    ],
  ),
  demo(
    'seated-row',
    'Seated row',
    { yaw: 62, pitch: 10, dist: 3.9, target: [0, 0.62, 0.5] },
    ['arm'],
    [
      { kind: 'box', at: [0, 0.38, -0.02], size: [0.36, 0.08, 0.5], tone: 'pad' },
      { kind: 'box', at: [0, 0.17, 0.5], size: [0.14, 0.34, 1.5], tone: 'frame' },
      { kind: 'box', at: [0, 0.34, 0.95], size: [0.5, 0.36, 0.05], pitch: -35, tone: 'frame' },
      { kind: 'box', at: [0, 0.6, 1.5], size: [0.3, 1.2, 0.14], tone: 'frame' },
      { kind: 'rod', a: 'lHand', b: 'rHand', r: 0.015, extend: 0.04 },
      { kind: 'rod', a: [0, ROW_SEAT + 0.2, 1.43], b: 'hands', r: 0.006, tone: 'cable' },
    ],
    seatedRow,
    [
      { name: 'Reach', cue: 'Sit tall, knees soft. Reach forward without rounding your back.', to: 0, secs: 0.6 },
      { name: 'Pull', cue: 'Pull the handle to your belly button, elbows close.', to: 1, secs: 1 },
      { name: 'Squeeze', cue: 'Squeeze your shoulder blades together for 1 second.', to: 1, secs: 1 },
      { name: 'Return', cue: '2 seconds back out. No rocking.', to: 0, secs: 2 },
    ],
  ),
  demo(
    'db-row',
    'One-arm dumbbell row',
    { yaw: -58, pitch: 12, dist: 3.6, target: [0, 0.62, 0.15] },
    ['arm'],
    [
      { kind: 'box', at: [0.12, BENCH - 0.04, 0.12], size: [0.3, 0.08, 1.2], tone: 'pad' },
      { kind: 'box', at: [0.12, (BENCH - 0.08) / 2, 0.12], size: [0.1, BENCH - 0.08, 0.9], tone: 'frame' },
      { kind: 'dumbbell', at: 'rHand', axis: 'z' },
    ],
    dbRow,
    [
      { name: 'Hang', cue: 'One hand and knee on the bench. Back flat like a table, arm long.', to: 0, secs: 0.6 },
      { name: 'Pull', cue: 'Pull the dumbbell to your hip, elbow past your ribs.', to: 1, secs: 1 },
      { name: 'Squeeze', cue: 'Pause. Chest stays square to the floor: no twisting open.', to: 1, secs: 0.5 },
      { name: 'Lower', cue: '2 seconds down to a straight arm.', to: 0, secs: 2 },
    ],
  ),
  demo(
    'chest-press',
    'Chest press machine',
    { yaw: 58, pitch: 10, dist: 4.1, target: [0, 0.85, 0.15] },
    ['arm'],
    [
      ...seat(),
      backPad(-8),
      { kind: 'box', at: [0, 0.9, -0.3], size: [0.12, 1.8, 0.1], tone: 'frame' },
      { kind: 'box', at: [0, 1.78, -0.16], size: [0.7, 0.07, 0.3], tone: 'frame' },
      { kind: 'rod', a: [0.32, 1.76, -0.05], b: 'lHand', r: 0.016 },
      { kind: 'rod', a: [-0.32, 1.76, -0.05], b: 'rHand', r: 0.016 },
    ],
    chestPress,
    [
      { name: 'Start', cue: 'Handles level with the middle of your chest. Shoulder blades back and down.', to: 0, secs: 0.6 },
      { name: 'Press', cue: 'Press until your arms are straight, but don’t lock them hard.', to: 1, secs: 1 },
      { name: 'Top', cue: 'Shoulders stay back on the pad.', to: 1, secs: 0.4 },
      { name: 'Lower', cue: '2 seconds back. Don’t let the stack slam.', to: 0, secs: 2 },
    ],
  ),
  demo(
    'db-press',
    'Dumbbell press',
    { yaw: 56, pitch: 14, dist: 4, target: [0, 0.75, 0] },
    ['arm'],
    [
      { kind: 'box', at: [0, SEAT - 0.04, 0.1], size: [0.32, 0.08, 0.34], tone: 'pad' },
      backPad(INCLINE - 90, [0, SIT_Y, 0], 0.9),
      { kind: 'box', at: [0, 0.18, -0.25], size: [0.1, 0.36, 1], tone: 'frame' },
      ...dumbbells('x'),
    ],
    dbPress,
    [
      { name: 'Start', cue: 'Feet flat, shoulder blades pinned back. Arms straight over your chest.', to: 0, secs: 0.6 },
      { name: 'Lower', cue: '2 seconds down, elbows about 45° from your body.', to: 1, secs: 2 },
      { name: 'Bottom', cue: 'Dumbbells beside your chest, wrists stacked over elbows. No bounce.', to: 1, secs: 0.4 },
      { name: 'Press', cue: 'Press up and slightly in.', to: 0, secs: 1 },
    ],
  ),
  demo('shoulder-press', 'Shoulder press', { yaw: 38, pitch: 8, dist: 4.4, target: [0, 0.95, 0.1] }, ['arm'], [...seat(), backPad(-5, [0, SIT_Y, 0], 0.85), ...dumbbells('x')], shoulderPress, [
    { name: 'Start', cue: 'Back against the pad. Hands at ear height, elbows a little in front.', to: 0, secs: 0.6 },
    { name: 'Press', cue: 'Press up until your arms are straight. No shrugging.', to: 1, secs: 1 },
    { name: 'Top', cue: 'Ribs down: don’t arch your lower back.', to: 1, secs: 0.4 },
    { name: 'Lower', cue: '2 seconds down to ear height.', to: 0, secs: 2 },
  ]),
  demo(
    'db-curl',
    'Dumbbell curl',
    { yaw: 50, pitch: 6, dist: 4.3, target: [0, 0.92, 0] },
    ['arm'],
    [
      { kind: 'dumbbell', at: 'lHand', axis: 'x' },
      { kind: 'dumbbell', at: 'rHand', axis: 'z' },
    ],
    dbCurl,
    [
      { name: 'Start', cue: 'Stand tall, elbow pinned to your side, palm up.', to: 0, secs: 0.6 },
      { name: 'Curl', cue: 'Curl up without your elbow drifting forward. No swinging.', to: 1, secs: 1 },
      { name: 'Squeeze', cue: 'Squeeze at the top.', to: 1, secs: 0.5 },
      { name: 'Lower', cue: 'Lower for 2–3 seconds, all the way down.', to: 0, secs: 2.5 },
    ],
  ),
  demo(
    'pushdown',
    'Triceps pushdown',
    { yaw: 60, pitch: 6, dist: 4.9, target: [0, 1.08, 0.25] },
    ['arm'],
    [
      { kind: 'box', at: [0, 1.06, 0.8], size: [0.3, 2.12, 0.14], tone: 'frame' },
      { kind: 'box', at: [0, 2.09, 0.6], size: [0.07, 0.07, 0.4], tone: 'frame' },
      { kind: 'rod', a: 'lHand', b: 'rHand', r: 0.015, extend: 0.07 },
      { kind: 'rod', a: [0, 2.06, 0.44], b: 'hands', r: 0.006, tone: 'cable' },
    ],
    pushdown,
    [
      { name: 'Start', cue: 'Elbows pinned to your sides, forearms just above level.', to: 0, secs: 0.6 },
      { name: 'Push', cue: 'Push down until your arms are straight.', to: 1, secs: 1 },
      { name: 'Squeeze', cue: 'Squeeze. Only your forearms move.', to: 1, secs: 0.5 },
      { name: 'Return', cue: '2 seconds up. Elbows stay by your sides.', to: 0, secs: 2 },
    ],
  ),
  demo('goblet-squat', 'Goblet squat', { yaw: 52, pitch: 8, dist: 4.3, target: [0, 0.88, 0] }, ['leg'], [{ kind: 'dumbbell', at: 'hands', axis: 'y' }], gobletSquat, [
    { name: 'Stand', cue: 'Feet shoulder width, toes slightly out. Dumbbell against your chest.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down. Sit between your heels, chest up.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Knees follow your toes. Heels stay down.', to: 1, secs: 0.4 },
    { name: 'Stand up', cue: 'Push through your whole foot to stand tall.', to: 0, secs: 1 },
  ]),
  demo(
    'leg-press',
    'Leg press',
    { yaw: 64, pitch: 10, dist: 3.9, target: [0, 0.62, 0.35] },
    ['leg'],
    [
      ...seat(),
      backPad(PRESS_BACK, [0, SIT_Y, 0], 0.85),
      { kind: 'box', at: 'feet', size: [0.5, 0.42, 0.04], pitch: -14, off: [0, 0.03, 0.058], tone: 'frame' },
      { kind: 'box', at: [0, 0.07, 0.55], size: [0.5, 0.14, 1.5], tone: 'frame' },
    ],
    legPress,
    [
      { name: 'Start', cue: 'Feet shoulder width in the middle of the plate. Back and hips flat on the pad.', to: 0, secs: 0.6 },
      { name: 'Lower', cue: '2 seconds down until your knees are about 90°. Hips stay down.', to: 1, secs: 2 },
      { name: 'Bottom', cue: 'Knees in line with your toes.', to: 1, secs: 0.4 },
      { name: 'Press', cue: 'Press up. Stop just before your knees lock.', to: 0, secs: 1 },
    ],
  ),
  demo('db-rdl', 'Romanian deadlift', { yaw: 66, pitch: 8, dist: 4.3, target: [0, 0.88, 0] }, ['leg', 'torso'], dumbbells('x'), dbRdl, [
    { name: 'Stand', cue: 'Dumbbells in front of your thighs, knees soft.', to: 0, secs: 0.6 },
    { name: 'Hinge', cue: '2 seconds down. Push your hips back, back flat.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Stop below your knees. Dumbbells stay close to your legs.', to: 1, secs: 0.4 },
    { name: 'Stand up', cue: 'Squeeze your glutes to stand tall.', to: 0, secs: 1 },
  ]),
  demo('split-squat', 'Split squat', { yaw: 66, pitch: 8, dist: 4.3, target: [0, 0.85, -0.08] }, ['leg'], dumbbells('z'), splitSquat, [
    { name: 'Start', cue: 'Long stance, back heel up, body tall.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down. Drop your back knee straight down.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Back knee just above the floor. Front knee over the middle of your foot.', to: 1, secs: 0.4 },
    { name: 'Stand up', cue: 'Push through your front foot.', to: 0, secs: 1 },
  ]),
  demo('plank', 'Plank', { yaw: 62, pitch: 14, dist: 3.5, target: [0, 0.28, -0.15] }, ['torso'], [mat()], plank, [
    { name: 'Set up', cue: 'Elbows under your shoulders, knees down.', to: 0, secs: 1 },
    { name: 'Lift', cue: 'Lift your knees. Squeeze your glutes and quads.', to: 1, secs: 1.2 },
    { name: 'Hold', cue: 'Straight line from head to heels. Keep breathing.', to: 1, secs: 3 },
  ]),
];

export const DEMOS: Record<string, Demo> = Object.fromEntries(list.map((d) => [d.id, d]));
export const DEMO_IDS: string[] = list.map((d) => d.id);

/** Seconds for one full loop. */
export const demoSecs = (d: Demo): number => d.phases.reduce((n, p) => n + p.secs, 0);

/** The pose at the end of phase i (what a paused step shows). */
export function phasePose(d: Demo, i: number): Pose {
  const n = d.phases.length;
  return d.phases[((Math.trunc(i) % n) + n) % n].pose;
}

/** When phase i starts, in seconds from the top of the loop. */
export function phaseStart(d: Demo, i: number): number {
  let t = 0;
  for (let k = 0; k < i && k < d.phases.length; k++) t += d.phases[k].secs;
  return t;
}

/** The pose t seconds into the loop (it repeats), and which phase that is. */
export function sampleDemo(d: Demo, tSeconds: number): { pose: Pose; phase: number } {
  const total = demoSecs(d);
  let t = ((tSeconds % total) + total) % total;
  let i = 0;
  while (i < d.phases.length - 1 && t >= d.phases[i].secs) t -= d.phases[i++].secs;
  const ph = d.phases[i];
  const path = [phasePose(d, i - 1), ...(ph.via ?? []), ph.pose];
  const along = ease(ph.secs > 0 ? t / ph.secs : 1) * (path.length - 1);
  const k = Math.min(path.length - 2, Math.floor(along));
  return { pose: mixPose(path[k], path[k + 1], along - k), phase: i };
}
