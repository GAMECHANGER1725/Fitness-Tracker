// Form demos: for the main home exercises, a short loop of poses for the mannequin (rig.ts), the gear to draw
// around it (a mat, a chair, the backpack) and one plain cue per phase. Pure data and maths: the 3D view and
// the 2D fallback both read this. The longer form cues live on the exercises (EX[id].cues).

import { ANKLE_Y, FOOT_R, HEAD_R, STAND_Y, add, apply, dist, fk, mid, mixPose, mixV, norm, pin, pose, reachArm, reachLeg, rotX, sub, ease, type JointName, type Joints, type Part, type Pose, type Side, type Vec3 } from './rig';

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
    const via = from === s.to ? undefined : Array.from({ length: 11 }, (_, k) => build(lerp(from, s.to, (k + 1) / 12)));
    return { name: s.name, cue: s.cue, pose: build(s.to), secs: s.secs, via };
  });
  return { id, name, camera, work, props, phases };
}

// ----- The movements. Each takes u from 0 (start) to 1 (far end) and returns a pose --------

const CHAIR = 0.45; // chair or bed height
const STEP = 0.18; // a stair

// Push-ups: the body turns about the toes as one straight line; hands stay planted.
function plankBody(lift: number, toeZ = -0.85): Pose {
  return pin(pose({ pitch: 90 - lift, neck: -6 }), toes, [0, FOOT_R, toeZ]);
}
function pushup(u: number): Pose {
  const z = shoulders(fk(plankBody(19)))[2] + 0.02;
  return hands(plankBody(lerp(19, 2.5, u)), [0.275, 0.04, z], [0.7, 0.25, -0.7]);
}
function diamond(u: number): Pose {
  const z = shoulders(fk(plankBody(19)))[2] + 0.08;
  return hands(plankBody(lerp(19, 4, u)), [0.065, 0.04, z], [0.25, 0.3, -1]);
}

// Incline push-up: hands on the edge of a bed, so the body is at an angle. The body turns about the toes; the
// top angle leaves the arms just short of locked, the bottom brings the chest close to the edge.
const INCLINE_TOE = -1.05;
const INCLINE_HANDS: Vec3 = [0.27, CHAIR, 0.3];
/** The body angle at which the shoulders are `reach` from the hands (bisection; the distance grows with the angle). */
function inclineLift(reach: number): number {
  let lo = 5, hi = 80;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    const sh = fk(plankBody(m, INCLINE_TOE)).lShoulder;
    if (dist(sh, INCLINE_HANDS) < reach) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
const INCLINE_TOP = inclineLift(0.6), INCLINE_LOW = inclineLift(0.3);
function inclinePushup(u: number): Pose {
  return hands(plankBody(lerp(INCLINE_TOP, INCLINE_LOW, u), INCLINE_TOE), INCLINE_HANDS, [0.7, 0.25, -0.7]);
}

// Pike push-up: hips high in an upside-down V; the head lowers toward the floor between the hands.
function pikeBody(u: number): Pose {
  const p = pose({ root: [0, lerp(0.9, 0.86, u), lerp(-0.12, -0.08, u)], pitch: lerp(126, 146, u), neck: -8 });
  return feet(p, [0.13, ANKLE_Y, -0.62], [0.13, 0, 1]);
}
/** Hands on the floor where the top position's arms are just short of straight. */
const PIKE_HANDS: Vec3 = (() => {
  const sh = fk(pikeBody(0)).lShoulder;
  const down = sh[1] - 0.04;
  return [0.24, 0.04, sh[2] + Math.sqrt(Math.max(0, 0.585 ** 2 - down ** 2 - (0.24 - sh[0]) ** 2))];
})();
function pike(u: number): Pose {
  return hands(pikeBody(u), PIKE_HANDS, [0.6, 0.3, -0.6]);
}

// Chair dip: hands on the chair behind you, feet out in front, lower to elbows at 90°.
function chairDip(u: number): Pose {
  let p = pose({ root: [0, lerp(0.56, 0.36, u), -0.08], pitch: lerp(-2, 6, u), neck: -4 });
  p = feet(p, [0.14, ANKLE_Y, 0.62], [0.14, 1, 0.3]);
  return hands(p, [0.2, CHAIR, -0.26], [0.25, 0, -1]);
}

// Backpack row: hinged forward with a flat back, pull the bag to your belly button.
function packRow(u: number): Pose {
  let p = pose({ root: [0, 0.92, -0.2], pitch: 62, neck: -10 });
  p = feet(p, [0.13, ANKLE_Y, 0], [0.13, 0, 1]);
  const j = fk(p);
  const lean = rotX(p.pitch);
  const hang: Vec3 = [0.12, shoulders(j)[1] - 0.58, shoulders(j)[2] + 0.04];
  const pull = add(j.spine, apply(lean, [0.13, 0.02, 0.17]));
  return hands(p, mixV(hang, pull, u), [0.45, 1, -0.3]);
}

// One-arm row: one hand and knee on the bed, the other arm pulls the bag to the hip.
function oneArmRow(u: number): Pose {
  let p = pose({ root: [0, 0.9, 0], pitch: 78, neck: -12 });
  p = reachLeg(p, 'l', [0.11, CHAIR + 0.055, -0.2], [0, -1, 0.6], 55);
  p = reachLeg(p, 'r', [-0.3, ANKLE_Y, -0.12], [-0.2, 0, 1]);
  const j = fk(p);
  p = reachArm(p, 'l', [0.13, CHAIR + 0.035, j.lShoulder[2] + 0.04], [0.4, 0, -1]);
  const hang: Vec3 = [-0.2, j.rShoulder[1] - 0.6, j.rShoulder[2]];
  return reachArm(p, 'r', mixV(hang, [-0.25, 0.9, 0.12], u), [-0.3, 1, -0.6]);
}

// Backpack curl: both hands on the straps, elbows pinned to your sides.
function packCurl(u: number): Pose {
  return pose({ both: { shAbd: 4, shRot: 8, shFlex: lerp(0, 8, u), elbow: lerp(8, 135, u) } });
}

// Squat with the bag held on your front.
function squat(u: number): Pose {
  let p = pose({ root: [0, lerp(STAND_Y - 0.008, 0.55, u), lerp(0, -0.23, u)], pitch: lerp(0, 34, u), neck: lerp(0, -18, u) });
  p = feet(p, [0.17, ANKLE_Y, 0], [0.36, 0, 1]);
  const j = fk(p);
  const lean = rotX(p.pitch);
  for (const s of SIDES) p = reachArm(p, s, add(j.chest, apply(lean, [sg(s) * 0.11, 0.0, 0.2])), [sg(s) * 0.35, -1, 0.1]);
  return p;
}

// Romanian deadlift: hips back, flat back, the bag slides down the front of your legs.
function rdl(u: number): Pose {
  let p = pose({ root: [0, lerp(STAND_Y - 0.006, 0.914, u), lerp(0, -0.24, u)], pitch: lerp(0, 72, u) });
  p = feet(p, [0.11, ANKLE_Y, 0], [0.1, 0, 1]);
  const sh = shoulders(fk(p));
  return hands(p, [0.11, sh[1] - 0.59, lerp(0.12, sh[2], u)], [0.2, 0, -1]);
}

function splitSquat(u: number): Pose {
  let p = pose({ root: [0, lerp(0.9, 0.6, u), 0], pitch: 5, both: { shAbd: 7, elbow: 6 } });
  p = reachLeg(p, 'l', [0.1, ANKLE_Y, 0.33], [0.1, 0, 1]);
  return toeTo(p, 'r', [-0.1, FOOT_R, -0.5], [0, -0.3, 1], 60);
}

// Bulgarian split squat: back toes up on a chair behind you.
function bulgarian(u: number): Pose {
  let p = pose({ root: [0, lerp(0.93, 0.66, u), lerp(0, 0.02, u)], pitch: lerp(6, 14, u), both: { shAbd: 7, elbow: 6 } });
  p = reachLeg(p, 'l', [0.1, ANKLE_Y, 0.3], [0.1, 0, 1]);
  return toeTo(p, 'r', [-0.1, CHAIR + FOOT_R, -0.6], [0, -0.3, 1], 35);
}

/** Turn each foot about its ankle until heel and toe both rest on the floor, toes pointing away from the head. */
function flatFeet(p: Pose): Pose {
  for (const s of SIDES) {
    let best = p, err = Infinity;
    for (let a = -90; a <= 90; a += 1) {
      const q = { ...p, [s]: { ...p[s], ankle: a } };
      const j = fk(q);
      const toe = j[`${s}Toe`], heel = j[`${s}Heel`];
      const e = Math.abs(toe[1] - FOOT_R) + Math.abs(heel[1] - FOOT_R) + (toe[2] < heel[2] ? 1 : 0);
      if (e < err) (err = e), (best = q);
    }
    p = best;
  }
  return p;
}

// Lying on your back: pitch -90 is flat, more negative lifts the hips (shoulders stay on the floor).
function bridgeBody(u: number): Pose {
  let p = pin(pose({ pitch: lerp(-92, -121, u) }), shoulders, [0, 0.09, -0.32]);
  // The head rests on the floor: tuck the chin just enough.
  let best = p;
  for (let n = -20, err = Infinity; n <= 70; n += 1) {
    const q = { ...p, neck: n };
    const e = Math.abs(fk(q).head[1] - (HEAD_R + 0.004));
    if (e < err) (err = e), (best = q);
  }
  p = best;
  p = flatFeet(feet(p, [0.15, ANKLE_Y, 0.42], [0.15, 1, 0.2]));
  return hands(p, [0.24, 0.035, 0.02], [0.4, 1, 0]);
}
const glute = (u: number) => bridgeBody(u);
function singleBridge(u: number): Pose {
  let p = bridgeBody(u);
  const j = fk(p);
  const along = norm(sub(j.lKnee, j.lHip));
  return reachLeg(p, 'r', add(j.rHip, [along[0] * 0, along[1] * 0.85, along[2] * 0.85]), [0, 1, 0]);
}

// Wall sit: slide down the wall until your thighs are level, then hold.
function wallSit(u: number): Pose {
  let p = pose({ root: [0, lerp(0.88, 0.52, u), lerp(-0.08, -0.07, u)], pitch: 0, neck: 0, both: { shAbd: 8, elbow: 10 } });
  return feet(p, [0.15, ANKLE_Y, 0.42], [0.15, 0.3, 1]);
}

// Calf raise on a stair: heels drop below the step, then rise all the way up.
function calfRaise(u: number): Pose {
  const p = pose({ both: { ankle: lerp(16, -30, u), shAbd: 7, elbow: 6 } });
  return pin(p, toes, [0, STEP + FOOT_R, 0.04]);
}

// Dead bug: back flat, arms up, knees over hips; opposite arm and leg reach out slowly.
function deadBug(u: number): Pose {
  const p = pose({ pitch: -90, l: { shFlex: lerp(90, 172, u), hipFlex: 90, knee: 90 }, r: { shFlex: 90, hipFlex: lerp(90, 14, u), knee: lerp(90, 4, u) } });
  return pin(p, 'pelvis', [0, 0.115, 0.1]);
}

function plank(u: number): Pose {
  const up = pin(pose({ pitch: 90 - 6.5, neck: -4 }), toes, [0, FOOT_R, -0.85]);
  const sh = shoulders(fk(up));
  const kneel = pin(pose({ pitch: 90 - 17.8, neck: -4, both: { knee: 32, ankle: -72 } }), shoulders, sh);
  return hands(mixPose(kneel, up, u), [0.15, 0.04, sh[2] + 0.31], [0.15, -1, -0.45]);
}

// ----- Gear ---------------------------------------------------------------------------

const mat = (len = 2, z = -0.1): Prop => ({ kind: 'box', at: [0, 0.008, z], size: [0.7, 0.016, len], tone: 'mat' });
/** A loaded backpack hanging from the hands. */
const bag = (off: Vec3 = [0, -0.17, 0.02]): Prop => ({ kind: 'box', at: 'hands', size: [0.3, 0.36, 0.17], off, tone: 'pad' });
const chair = (at: Vec3, w = 0.44): Prop[] => [
  { kind: 'box', at: [at[0], CHAIR - 0.03, at[2]], size: [w, 0.06, 0.42], tone: 'pad' },
  { kind: 'box', at: [at[0], (CHAIR - 0.06) / 2, at[2]], size: [w * 0.85, CHAIR - 0.06, 0.36], tone: 'frame' },
];

// ----- The demos --------------------------------------------------------------------------

const list: Demo[] = [
  demo('pushup', 'Push-up', { yaw: 62, pitch: 14, dist: 3.5, target: [0, 0.32, -0.15] }, ['arm', 'torso'], [mat()], pushup, [
    { name: 'Start', cue: 'Hands a bit wider than your shoulders. Body in one straight line.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down, elbows about 45° from your body.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Chest a fist off the floor. Hips stay level with your shoulders.', to: 1, secs: 0.5 },
    { name: 'Press', cue: 'Push the floor away until your arms are straight.', to: 0, secs: 1 },
  ]),
  demo('incline-pushup', 'Incline push-up', { yaw: 62, pitch: 12, dist: 4, target: [0, 0.6, -0.25] }, ['arm', 'torso'], [{ kind: 'box', at: [0, CHAIR / 2, INCLINE_HANDS[2] + 0.33], size: [1, CHAIR, 0.7], tone: 'pad' }], inclinePushup, [
    { name: 'Start', cue: 'Hands on the edge of a sturdy bed or table. Body straight, glutes tight.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down until your chest nearly touches.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Elbows about 45° from your body. Hips don’t sag.', to: 1, secs: 0.4 },
    { name: 'Press', cue: 'Push away hard until your arms are straight.', to: 0, secs: 1 },
  ]),
  demo('diamond-pushup', 'Diamond push-up', { yaw: 50, pitch: 16, dist: 3.5, target: [0, 0.32, -0.12] }, ['arm', 'torso'], [mat()], diamond, [
    { name: 'Start', cue: 'Thumbs and index fingers make a diamond under your chest.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down. Elbows brush your ribs.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Chest just above your hands. Body stays straight.', to: 1, secs: 0.4 },
    { name: 'Press', cue: 'Press up. Drop to your knees if your form breaks.', to: 0, secs: 1 },
  ]),
  demo('pike-pushup', 'Pike push-up', { yaw: 70, pitch: 10, dist: 3.8, target: [0, 0.55, -0.05] }, ['arm'], [mat()], pike, [
    { name: 'Start', cue: 'Hips high, body in an upside-down V. Arms straight.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down. Your head moves forward of your hands.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Head just above the floor. Elbows track back, not out.', to: 1, secs: 0.4 },
    { name: 'Press', cue: 'Press back up to straight arms.', to: 0, secs: 1 },
  ]),
  demo('chair-dip', 'Chair dip', { yaw: 64, pitch: 10, dist: 3.8, target: [0, 0.55, 0.15] }, ['arm'], chair([0, 0, -0.38]), chairDip, [
    { name: 'Start', cue: 'Hands on the chair behind you, arms straight, feet out in front.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down. Shoulders down, away from your ears.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Stop when your elbows reach 90°. No deeper.', to: 1, secs: 0.4 },
    { name: 'Press', cue: 'Push back up to straight arms.', to: 0, secs: 1 },
  ]),
  demo('pack-row', 'Backpack row', { yaw: 66, pitch: 8, dist: 4.1, target: [0, 0.8, 0] }, ['arm'], [bag()], packRow, [
    { name: 'Hang', cue: 'Hinge forward with a flat back, knees soft. Bag hangs below your shoulders.', to: 0, secs: 0.6 },
    { name: 'Pull', cue: 'Pull the bag to your belly button.', to: 1, secs: 1 },
    { name: 'Squeeze', cue: 'Squeeze your shoulder blades for 1 second.', to: 1, secs: 1 },
    { name: 'Lower', cue: '2 seconds down. Your back stays flat the whole time.', to: 0, secs: 2 },
  ]),
  demo(
    'one-arm-row',
    'One-arm backpack row',
    { yaw: -58, pitch: 12, dist: 3.6, target: [0, 0.62, 0.15] },
    ['arm'],
    [
      { kind: 'box', at: [0.12, CHAIR / 2, 0.1], size: [0.5, CHAIR, 1.3], tone: 'pad' },
      { kind: 'box', at: 'rHand', size: [0.17, 0.32, 0.28], off: [0, -0.15, 0], tone: 'pad' },
    ],
    oneArmRow,
    [
      { name: 'Hang', cue: 'One hand and knee on the bed. Back flat like a table, arm long.', to: 0, secs: 0.6 },
      { name: 'Pull', cue: 'Pull the bag to your hip, elbow past your ribs.', to: 1, secs: 1 },
      { name: 'Squeeze', cue: 'Pause. No twisting open.', to: 1, secs: 0.5 },
      { name: 'Lower', cue: '2 seconds down to a straight arm.', to: 0, secs: 2 },
    ],
  ),
  demo('pack-curl', 'Backpack curl', { yaw: 50, pitch: 6, dist: 4.3, target: [0, 0.92, 0] }, ['arm'], [bag([0, -0.17, 0.03])], packCurl, [
    { name: 'Start', cue: 'Hold the bag by both straps, elbows pinned to your sides.', to: 0, secs: 0.6 },
    { name: 'Curl', cue: 'Curl it up. Elbows stay by your sides, no swinging.', to: 1, secs: 1 },
    { name: 'Squeeze', cue: 'Squeeze at the top.', to: 1, secs: 0.5 },
    { name: 'Lower', cue: 'Lower for 2–3 seconds, all the way down.', to: 0, secs: 2.5 },
  ]),
  demo('squat', 'Backpack squat', { yaw: 52, pitch: 8, dist: 4.3, target: [0, 0.88, 0] }, ['leg'], [bag([0, -0.05, 0.05])], squat, [
    { name: 'Stand', cue: 'Feet shoulder width, toes slightly out. Bag hugged to your front.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down. Sit between your heels, chest up.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Knees follow your toes. Heels stay down.', to: 1, secs: 0.4 },
    { name: 'Stand up', cue: 'Drive up through your whole foot.', to: 0, secs: 1 },
  ]),
  demo('rdl', 'Backpack Romanian deadlift', { yaw: 66, pitch: 8, dist: 4.3, target: [0, 0.88, 0] }, ['leg', 'torso'], [bag([0, -0.15, 0.06])], rdl, [
    { name: 'Stand', cue: 'Bag in front of your thighs, knees soft.', to: 0, secs: 0.6 },
    { name: 'Hinge', cue: '2 seconds down. Push your hips back, back flat.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Stop when your back would start to round.', to: 1, secs: 0.4 },
    { name: 'Stand up', cue: 'Squeeze your glutes to stand tall.', to: 0, secs: 1 },
  ]),
  demo('split-squat', 'Split squat', { yaw: 66, pitch: 8, dist: 4.3, target: [0, 0.85, -0.08] }, ['leg'], [], splitSquat, [
    { name: 'Start', cue: 'Long stance, back heel up, body tall.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down. Drop your back knee straight down.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Back knee just above the floor. Front knee over the middle of your foot.', to: 1, secs: 0.4 },
    { name: 'Stand up', cue: 'Push through your front foot.', to: 0, secs: 1 },
  ]),
  demo('bulgarian', 'Bulgarian split squat', { yaw: 68, pitch: 8, dist: 4.4, target: [0, 0.82, -0.12] }, ['leg'], chair([-0.1, 0, -0.78]), bulgarian, [
    { name: 'Start', cue: 'Back foot on a chair or bed, front foot well forward.', to: 0, secs: 0.6 },
    { name: 'Lower', cue: '2 seconds down, torso slightly forward.', to: 1, secs: 2 },
    { name: 'Bottom', cue: 'Control the bottom. Don’t bounce.', to: 1, secs: 0.4 },
    { name: 'Stand up', cue: 'Push through your front foot.', to: 0, secs: 1 },
  ]),
  demo('glute-bridge', 'Glute bridge', { yaw: 72, pitch: 14, dist: 3.4, target: [0, 0.25, 0.05] }, ['leg', 'torso'], [mat(1.8, 0.05)], glute, [
    { name: 'Start', cue: 'Lie on your back, feet flat and close to your bum.', to: 0, secs: 0.6 },
    { name: 'Lift', cue: 'Drive your hips up through your heels.', to: 1, secs: 1 },
    { name: 'Squeeze', cue: 'Squeeze your glutes for 1 second. Ribs down, don’t arch.', to: 1, secs: 1 },
    { name: 'Lower', cue: '2 seconds down.', to: 0, secs: 2 },
  ]),
  demo('single-leg-bridge', 'Single-leg glute bridge', { yaw: 72, pitch: 14, dist: 3.4, target: [0, 0.28, 0.1] }, ['leg', 'torso'], [mat(1.8, 0.05)], singleBridge, [
    { name: 'Start', cue: 'One foot planted, the other leg straight.', to: 0, secs: 0.6 },
    { name: 'Lift', cue: 'Drive up through the planted heel.', to: 1, secs: 1 },
    { name: 'Squeeze', cue: 'Hips stay level. Squeeze at the top.', to: 1, secs: 1 },
    { name: 'Lower', cue: '2 seconds down.', to: 0, secs: 2 },
  ]),
  demo('wall-sit', 'Wall sit', { yaw: 68, pitch: 8, dist: 3.9, target: [0, 0.7, 0.1] }, ['leg'], [{ kind: 'box', at: [0, 1, -0.25], size: [1.3, 2, 0.06], tone: 'frame' }], wallSit, [
    { name: 'Stand', cue: 'Back flat on the wall, feet out in front.', to: 0, secs: 0.8 },
    { name: 'Slide down', cue: 'Slide down until your thighs are level with the floor.', to: 1, secs: 2 },
    { name: 'Hold', cue: 'Knees over your ankles. Breathe steadily.', to: 1, secs: 3 },
    { name: 'Up', cue: 'Push back up the wall.', to: 0, secs: 1.2 },
  ]),
  demo('calf-raise', 'Calf raise', { yaw: 72, pitch: 6, dist: 4.1, target: [0, 0.95, -0.05] }, ['leg'], [{ kind: 'box', at: [0, STEP / 2, -0.12], size: [0.8, STEP, 0.32], tone: 'frame' }], calfRaise, [
    { name: 'Start', cue: 'Balls of your feet on the edge of a stair. Hold the rail.', to: 0, secs: 0.6 },
    { name: 'Rise', cue: 'Rise all the way up onto your toes.', to: 1, secs: 1 },
    { name: 'Pause', cue: 'Pause for 1 second at the top.', to: 1, secs: 1 },
    { name: 'Lower', cue: 'Slowly lower your heels below the step.', to: 0, secs: 2 },
  ]),
  demo('dead-bug', 'Dead bug', { yaw: 60, pitch: 24, dist: 3.3, target: [0, 0.3, 0] }, ['torso'], [mat(2.1, 0.1)], deadBug, [
    { name: 'Start', cue: 'Low back pressed into the floor. Arms up, knees over your hips.', to: 0, secs: 0.8 },
    { name: 'Reach', cue: 'Slowly reach one arm back and the opposite leg out. Breathe out.', to: 1, secs: 2 },
    { name: 'Hold', cue: 'Your low back stays on the floor.', to: 1, secs: 0.6 },
    { name: 'Return', cue: 'Bring them back, then swap sides.', to: 0, secs: 1.5 },
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
