// The mannequin's skeleton: joints, a pose (root + joint angles in degrees) and forward kinematics. Pure maths,
// no three and no DOM, so the 3D mannequin, the 2D fallback and the tests all draw the same body.
//
// Space: metres, y up, the figure faces +z, its left side is +x. The floor is y = 0.
// Proportions: a lean teenager about 1.78 m tall.

import type { Muscle } from './types';

export type Vec3 = [number, number, number];
export type Side = 'l' | 'r';

/** One side's arm and leg. All angles in degrees; 0 everywhere is standing tall with the arms hanging. */
export interface Limb {
  /** Shoulder: + lifts the arm forward. */
  shFlex: number;
  /** Shoulder: + lifts the arm out to the side. */
  shAbd: number;
  /** Shoulder: twist along the upper arm, + turns the forearm outward. */
  shRot: number;
  /** Elbow: 0 straight, + bent. */
  elbow: number;
  /** Hip: + lifts the thigh forward. */
  hipFlex: number;
  /** Hip: + moves the thigh out to the side. */
  hipAbd: number;
  /** Hip: twist along the thigh, + turns the knee and toes outward. */
  hipRot: number;
  /** Knee: 0 straight, + bent. */
  knee: number;
  /** Ankle: + pulls the toes up toward the shin. */
  ankle: number;
}

export interface Pose {
  /** Pelvis position. */
  root: Vec3;
  /** Pelvis: + leans the whole body forward (90 = face down). */
  pitch: number;
  /** Pelvis: turn about the vertical axis. */
  yaw: number;
  /** Pelvis: tilt to the side. */
  roll: number;
  /** Lower back: + rounds forward. 0 is a flat back. */
  spine: number;
  /** Upper back: + rounds forward. */
  chest: number;
  /** Neck: + chin toward the chest. */
  neck: number;
  l: Limb;
  r: Limb;
}

const SIDE_JOINTS = ['Shoulder', 'Elbow', 'Wrist', 'Hand', 'Hip', 'Knee', 'Ankle', 'Heel', 'Toe'] as const;
type SideJoint = `${Side}${(typeof SIDE_JOINTS)[number]}`;
export type JointName = 'pelvis' | 'spine' | 'chest' | 'neck' | 'head' | SideJoint;
export type Joints = Record<JointName, Vec3>;

export const JOINTS: JointName[] = ['pelvis', 'spine', 'chest', 'neck', 'head', ...(['l', 'r'] as const).flatMap((s) => SIDE_JOINTS.map((j) => `${s}${j}` as SideJoint))];

/** Segment lengths in metres. */
export const LEN = {
  pelvisToSpine: 0.11,
  spineToChest: 0.17,
  chestToNeck: 0.21,
  neckToHead: 0.16,
  shoulderX: 0.185,
  shoulderY: 0.16,
  hipX: 0.095,
  hipY: -0.04,
  upperArm: 0.29,
  forearm: 0.25,
  hand: 0.08,
  thigh: 0.45,
  shin: 0.43,
  /** Ankle to the sole line (heel and toe sit this far below the ankle). */
  footDrop: 0.05,
  heelBack: 0.05,
  toeFwd: 0.16,
} as const;

/** Head radius, and the foot's radius (so a flat foot's heel and toe joints sit this high above the floor). */
export const HEAD_R = 0.105;
export const FOOT_R = 0.035;
/** Ankle height when standing flat. */
export const ANKLE_Y = LEN.footDrop + FOOT_R;
/** Pelvis height when standing tall with straight legs. */
export const STAND_Y = ANKLE_Y + LEN.shin + LEN.thigh - LEN.hipY;

export type Part = 'torso' | 'head' | 'arm' | 'leg';
export interface Bone {
  a: JointName;
  b: JointName;
  /** Radius at `a`, and at `b` if it tapers. */
  r: number;
  r2?: number;
  part: Part;
  side?: Side;
  /** Front-to-back squash for the torso (1 = round). */
  flat?: number;
}

const limbBones = (s: Side): Bone[] => [
  { a: `${s}Shoulder`, b: `${s}Elbow`, r: 0.052, r2: 0.042, part: 'arm', side: s },
  { a: `${s}Elbow`, b: `${s}Wrist`, r: 0.041, r2: 0.03, part: 'arm', side: s },
  { a: `${s}Wrist`, b: `${s}Hand`, r: 0.034, part: 'arm', side: s },
  { a: `${s}Hip`, b: `${s}Knee`, r: 0.078, r2: 0.056, part: 'leg', side: s },
  { a: `${s}Knee`, b: `${s}Ankle`, r: 0.055, r2: 0.038, part: 'leg', side: s },
  { a: `${s}Heel`, b: `${s}Toe`, r: FOOT_R, part: 'leg', side: s },
];

/** What to draw: a rounded segment between two joints. The head is a ball of HEAD_R at `head`. */
export const BONES: Bone[] = [
  { a: 'lHip', b: 'rHip', r: 0.088, part: 'torso', flat: 0.85 },
  { a: 'pelvis', b: 'spine', r: 0.118, r2: 0.105, part: 'torso', flat: 0.72 },
  { a: 'spine', b: 'chest', r: 0.105, r2: 0.13, part: 'torso', flat: 0.72 },
  { a: 'chest', b: 'neck', r: 0.135, r2: 0.07, part: 'torso', flat: 0.7 },
  { a: 'lShoulder', b: 'rShoulder', r: 0.072, part: 'torso', flat: 0.9 },
  { a: 'neck', b: 'head', r: 0.048, part: 'head' },
  ...limbBones('l'),
  ...limbBones('r'),
];

// ----- Small vector and matrix kit (row-major 3×3) -----------------------------------

export type Mat3 = [number, number, number, number, number, number, number, number, number];
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b));
export const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
export const mixV = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function norm(a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 {
  const l = len(a);
  return l < 1e-9 ? fallback : scale(a, 1 / l);
}

export const rotX = (deg: number): Mat3 => {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
export const rotY = (deg: number): Mat3 => {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
export const rotZ = (deg: number): Mat3 => {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
export function mul(a: Mat3, b: Mat3): Mat3 {
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
export const apply = (m: Mat3, v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const fromAxes = (x: Vec3, y: Vec3, z: Vec3): Mat3 => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];

// ----- Poses ------------------------------------------------------------------------

const LIMB0: Limb = { shFlex: 0, shAbd: 0, shRot: 0, elbow: 0, hipFlex: 0, hipAbd: 0, hipRot: 0, knee: 0, ankle: 0 };
const LIMB_KEYS = Object.keys(LIMB0) as (keyof Limb)[];

/** Standing tall, arms by the sides. Pass parts to change; `both` sets the same limb angles on both sides. */
export function pose(p: Partial<Omit<Pose, 'l' | 'r'>> & { both?: Partial<Limb>; l?: Partial<Limb>; r?: Partial<Limb> } = {}): Pose {
  const { both, l, r, ...rest } = p;
  return { root: [0, STAND_Y, 0], pitch: 0, yaw: 0, roll: 0, spine: 0, chest: 0, neck: 0, ...rest, l: { ...LIMB0, ...both, ...l }, r: { ...LIMB0, ...both, ...r } };
}

const sign = (s: Side) => (s === 'l' ? 1 : -1);

/** The ball joint used for both the shoulder and the hip: lift to the side, lift forward, then twist. */
const ball = (s: Side, flex: number, abd: number, rot: number): Mat3 => mul(mul(rotZ(sign(s) * abd), rotX(-flex)), rotY(sign(s) * rot));

/** Inverse of `ball`: the three angles of a rotation matrix (exact, also at the poles). */
function unball(s: Side, m: Mat3): [flex: number, abd: number, rot: number] {
  const u: Vec3 = [-m[1], -m[4], -m[7]]; // where the bone points
  const flex = Math.asin(clamp(u[2], -1, 1)) * DEG;
  const abd = Math.hypot(u[0], u[1]) < 1e-6 ? 0 : sign(s) * Math.atan2(u[0], -u[1]) * DEG;
  const twist = mul(transpose(mul(rotZ(sign(s) * abd), rotX(-flex))), m);
  return [flex, abd, sign(s) * Math.atan2(twist[2], twist[0]) * DEG];
}

interface Frames {
  pelvis: Mat3;
  chest: Mat3;
  neck: Mat3;
  joints: Pick<Joints, 'pelvis' | 'spine' | 'chest' | 'neck' | 'head'>;
}

function torso(p: Pose): Frames {
  const pelvis = mul(mul(rotY(p.yaw), rotX(p.pitch)), rotZ(p.roll));
  const lumbar = mul(pelvis, rotX(p.spine));
  const chest = mul(lumbar, rotX(p.chest));
  const neck = mul(chest, rotX(p.neck));
  const spineAt = add(p.root, apply(pelvis, [0, LEN.pelvisToSpine, 0]));
  const chestAt = add(spineAt, apply(lumbar, [0, LEN.spineToChest, 0]));
  const neckAt = add(chestAt, apply(chest, [0, LEN.chestToNeck, 0]));
  const headAt = add(neckAt, apply(neck, [0, LEN.neckToHead, 0]));
  return { pelvis, chest, neck, joints: { pelvis: [...p.root], spine: spineAt, chest: chestAt, neck: neckAt, head: headAt } };
}

const shoulderAt = (f: Frames, s: Side): Vec3 => add(f.joints.chest, apply(f.chest, [sign(s) * LEN.shoulderX, LEN.shoulderY, 0]));
const hipAt = (f: Frames, s: Side): Vec3 => add(f.joints.pelvis, apply(f.pelvis, [sign(s) * LEN.hipX, LEN.hipY, 0]));

/** Forward kinematics: where every joint is, in metres. */
export function fk(p: Pose): Joints {
  const f = torso(p);
  const out = { ...f.joints } as Joints;
  for (const s of ['l', 'r'] as const) {
    const a = p[s];
    const sh = shoulderAt(f, s);
    const upper = mul(f.chest, ball(s, a.shFlex, a.shAbd, a.shRot));
    const elbow = add(sh, apply(upper, [0, -LEN.upperArm, 0]));
    const fore = mul(upper, rotX(-a.elbow));
    const wrist = add(elbow, apply(fore, [0, -LEN.forearm, 0]));
    out[`${s}Shoulder`] = sh;
    out[`${s}Elbow`] = elbow;
    out[`${s}Wrist`] = wrist;
    out[`${s}Hand`] = add(wrist, apply(fore, [0, -LEN.hand, 0]));

    const hip = hipAt(f, s);
    const thigh = mul(f.pelvis, ball(s, a.hipFlex, a.hipAbd, a.hipRot));
    const knee = add(hip, apply(thigh, [0, -LEN.thigh, 0]));
    const shin = mul(thigh, rotX(a.knee));
    const ankle = add(knee, apply(shin, [0, -LEN.shin, 0]));
    const foot = mul(shin, rotX(-a.ankle));
    out[`${s}Hip`] = hip;
    out[`${s}Knee`] = knee;
    out[`${s}Ankle`] = ankle;
    out[`${s}Heel`] = add(ankle, apply(foot, [0, -LEN.footDrop, -LEN.heelBack]));
    out[`${s}Toe`] = add(ankle, apply(foot, [0, -LEN.footDrop, LEN.toeFwd]));
  }
  return out;
}

/** The chest's side axis (its left), for renderers that flatten the torso front to back. */
export function sideAxis(p: Pose): Vec3 {
  return apply(torso(p).chest, [1, 0, 0]);
}

// ----- Reaching (used to write poses: "hands on the bar", "feet on the floor") ------------

/** Two-bone solve from `from` to `to`; returns the middle joint and the end actually reached. */
function twoBone(from: Vec3, to: Vec3, l1: number, l2: number, pole: Vec3): { midAt: Vec3; endAt: Vec3; bend: Vec3 } {
  const d = sub(to, from);
  const reach = clamp(len(d), Math.abs(l1 - l2) + 0.005, l1 + l2 - 0.002);
  const dir = norm(d, [0, -1, 0]);
  let bend = norm(sub(pole, scale(dir, dot(pole, dir))), [0, 0, 0]);
  if (len(bend) < 0.5) bend = norm(cross(dir, [1, 0, 0]), [0, 0, 1]);
  const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return { midAt: add(add(from, scale(dir, along)), scale(bend, out)), endAt: add(from, scale(dir, reach)), bend };
}

/** Angles for a two-bone limb whose first bone points along `u` and second along `f`. `hinge` is +1 if the joint bends toward the bone's local +z (elbow), −1 for −z (knee). */
function limbAngles(s: Side, parent: Mat3, u: Vec3, f: Vec3, bendDir: Vec3, hinge: 1 | -1): { angles: [number, number, number]; bendDeg: number; world: Mat3 } {
  const c = clamp(dot(u, f), -1, 1);
  const y = scale(u, -1);
  // The second bone leaves the first on the side opposite the middle joint's bulge.
  let z = sub(f, scale(u, c));
  z = len(z) > 1e-5 ? norm(z) : norm(sub(scale(bendDir, -1), scale(u, -dot(bendDir, u))), [0, 0, 1]);
  if (hinge < 0) z = scale(z, -1);
  const world = fromAxes(cross(y, z), y, z);
  return { angles: unball(s, mul(transpose(parent), world)), bendDeg: Math.acos(c) * DEG, world };
}

/** Put a hand at `target` (world), with the elbow pointing toward `pole` (a world direction). Out of reach = arm straight toward it. */
export function reachArm(p: Pose, s: Side, target: Vec3, pole: Vec3): Pose {
  const f = torso(p);
  const sh = shoulderAt(f, s);
  const k = twoBone(sh, target, LEN.upperArm, LEN.forearm + LEN.hand, pole);
  const u = norm(sub(k.midAt, sh));
  const { angles, bendDeg } = limbAngles(s, f.chest, u, norm(sub(k.endAt, k.midAt)), k.bend, 1);
  return { ...p, [s]: { ...p[s], shFlex: angles[0], shAbd: angles[1], shRot: angles[2], elbow: bendDeg } };
}

/**
 * Put an ankle at `target` (world), with the knee pointing toward `pole`. `toeDown` tilts the foot: 0 = flat on the
 * floor, 90 = toes pointing straight down, negative = toes up.
 */
export function reachLeg(p: Pose, s: Side, target: Vec3, pole: Vec3, toeDown = 0): Pose {
  const f = torso(p);
  const hip = hipAt(f, s);
  const k = twoBone(hip, target, LEN.thigh, LEN.shin, pole);
  const u = norm(sub(k.midAt, hip));
  const { angles, bendDeg, world } = limbAngles(s, f.pelvis, u, norm(sub(k.endAt, k.midAt)), k.bend, -1);
  // Ankle: the toe direction is the shin frame's (0, sin a, cos a); solve for its height.
  const shin = mul(world, rotX(bendDeg));
  const A = shin[4], B = shin[5];
  const R = Math.hypot(A, B);
  let ankle = 0;
  if (R > 1e-6) {
    const base = Math.atan2(A, B), off = Math.acos(clamp(-Math.sin(toeDown * RAD) / R, -1, 1));
    // Two answers give that height; take the one whose toes point the way the body faces.
    const ahead = (a: number) => dot(apply(shin, [0, Math.sin(a), Math.cos(a)]), [f.pelvis[2], f.pelvis[5], f.pelvis[8]]);
    const a1 = base + off, a2 = base - off;
    const a = ahead(a1) >= ahead(a2) ? a1 : a2;
    ankle = Math.atan2(Math.sin(a), Math.cos(a)) * DEG;
  }
  return { ...p, [s]: { ...p[s], hipFlex: angles[0], hipAbd: angles[1], hipRot: angles[2], knee: bendDeg, ankle } };
}

/** Slide the whole body so that `joint` lands on `target`. */
export function pin(p: Pose, joint: JointName | ((j: Joints) => Vec3), target: Vec3): Pose {
  const j = fk(p);
  const at = typeof joint === 'function' ? joint(j) : j[joint];
  return { ...p, root: add(p.root, sub(target, at)) };
}

// ----- Blending ---------------------------------------------------------------------

/** Smooth start and stop. */
export const ease = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

type Quat = [number, number, number, number]; // x, y, z, w

function toQuat(m: Mat3): Quat {
  const tr = m[0] + m[4] + m[8];
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4];
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    q = [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    q = [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s];
  }
  return q;
}

function fromQuat([x, y, z, w]: Quat): Mat3 {
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Quat = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  d = Math.abs(d);
  let ka = 1 - t, kb = t;
  if (d < 0.9995) {
    const th = Math.acos(d), sn = Math.sin(th);
    ka = Math.sin((1 - t) * th) / sn;
    kb = Math.sin(t * th) / sn;
  }
  const q: Quat = [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb];
  const l = Math.hypot(...q);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

const num = (a: number, b: number, t: number) => a + (b - a) * t;
/** Blend two angles the short way round. */
const turn = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

function mixLimb(s: Side, a: Limb, b: Limb, t: number): Limb {
  const out = {} as Limb;
  for (const k of LIMB_KEYS) out[k] = num(a[k], b[k], t);
  // Ball joints blend as rotations, so the arm or leg takes the short way and never flips at a pole.
  const sh = unball(s, fromQuat(slerp(toQuat(ball(s, a.shFlex, a.shAbd, a.shRot)), toQuat(ball(s, b.shFlex, b.shAbd, b.shRot)), t)));
  const hip = unball(s, fromQuat(slerp(toQuat(ball(s, a.hipFlex, a.hipAbd, a.hipRot)), toQuat(ball(s, b.hipFlex, b.hipAbd, b.hipRot)), t)));
  [out.shFlex, out.shAbd, out.shRot] = sh;
  [out.hipFlex, out.hipAbd, out.hipRot] = hip;
  return out;
}

/** Straight blend from a to b, t in 0..1 (no easing). */
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    root: mixV(a.root, b.root, t),
    pitch: turn(a.pitch, b.pitch, t),
    yaw: turn(a.yaw, b.yaw, t),
    roll: turn(a.roll, b.roll, t),
    spine: num(a.spine, b.spine, t),
    chest: num(a.chest, b.chest, t),
    neck: num(a.neck, b.neck, t),
    l: mixLimb('l', a.l, b.l, t),
    r: mixLimb('r', a.r, b.r, t),
  };
}

/** Blend from a to b with a smooth start and stop. */
export const lerpPose = (a: Pose, b: Pose, t: number): Pose => mixPose(a, b, ease(t));

// ----- The body map's figure ------------------------------------------------------------
// One relaxed standing figure and a rounded shape per muscle, shared by the 3D body model and the 2D map.

/** Arms a little away from the sides so the torso and arms read separately. */
export const BODY_POSE: Pose = pose({ both: { shAbd: 17, elbow: 6, hipAbd: 3.5 } });

/** Torso outline from crotch to neck: [height, half-width] in metres. Front to back it is TORSO_DEPTH as deep. */
export const TORSO: [y: number, halfWidth: number][] = [
  [0.885, 0.03], [0.905, 0.1], [0.94, 0.15], [0.99, 0.168], [1.05, 0.16], [1.11, 0.142], [1.17, 0.14], [1.25, 0.158], [1.33, 0.178],
  [1.4, 0.188], [1.44, 0.18], [1.468, 0.135], [1.49, 0.075], [1.515, 0.054], [1.57, 0.05],
];
export const TORSO_DEPTH = 0.6;

/** A rounded muscle shape: centre, radii (across, along, front-to-back) and a tilt about the front-back axis in degrees. */
export interface Blob {
  muscle: Muscle;
  at: Vec3;
  r: Vec3;
  tilt: number;
}

/** Every muscle shape on BODY_POSE. Shapes with z > 0 sit on the front, z < 0 on the back. */
export function bodyShapes(): Blob[] {
  const j = fk(BODY_POSE);
  const out: Blob[] = [];
  const both = (muscle: Muscle, at: Vec3, r: Vec3, tilt = 0) => {
    out.push({ muscle, at, r, tilt });
    out.push({ muscle, at: [-at[0], at[1], at[2]], r, tilt: -tilt });
  };
  /** A shape lying along a bone: `t` of the way from a to b, pushed `z` forward (or back). */
  const along = (muscle: Muscle, a: SideJoint, b: SideJoint, t: number, z: number, r: Vec3) => {
    const p = mixV(j[a], j[b], t), d = sub(j[b], j[a]);
    out.push({ muscle, at: [p[0], p[1], p[2] + z], r, tilt: Math.atan2(d[0], -d[1]) * DEG });
  };
  both('chest', [0.082, 1.352, 0.078], [0.092, 0.066, 0.042], 8);
  for (const [y, z] of [[1.236, 0.079], [1.168, 0.078], [1.1, 0.08]]) both('abs', [0.04, y, z], [0.038, 0.032, 0.02]);
  out.push({ muscle: 'abs', at: [0, 1.025, 0.083], r: [0.06, 0.04, 0.02], tilt: 0 });
  both('obliques', [0.118, 1.15, 0.04], [0.034, 0.1, 0.058], -6);
  both('shoulders', [0.212, 1.432, 0], [0.068, 0.082, 0.074], 17);
  both('lats', [0.118, 1.24, -0.062], [0.066, 0.145, 0.04], 13);
  out.push({ muscle: 'upperBack', at: [0, 1.385, -0.078], r: [0.105, 0.115, 0.034], tilt: 0 });
  both('upperBack', [0.085, 1.468, -0.03], [0.085, 0.036, 0.048], -16);
  both('lowerBack', [0.042, 1.085, -0.068], [0.038, 0.09, 0.026]);
  both('glutes', [0.084, 0.955, -0.07], [0.086, 0.082, 0.068]);
  for (const s of ['l', 'r'] as const) {
    along('biceps', `${s}Shoulder`, `${s}Elbow`, 0.55, 0.02, [0.04, 0.095, 0.04]);
    along('triceps', `${s}Shoulder`, `${s}Elbow`, 0.5, -0.022, [0.042, 0.105, 0.04]);
    along('forearms', `${s}Elbow`, `${s}Wrist`, 0.36, 0, [0.044, 0.105, 0.044]);
    along('quads', `${s}Hip`, `${s}Knee`, 0.47, 0.026, [0.072, 0.185, 0.06]);
    along('hamstrings', `${s}Hip`, `${s}Knee`, 0.52, -0.03, [0.066, 0.165, 0.052]);
    along('calves', `${s}Knee`, `${s}Ankle`, 0.3, -0.024, [0.05, 0.115, 0.046]);
  }
  return out;
}
