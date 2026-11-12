import { describe, expect, it } from 'vitest';
import { ANKLE_Y, BONES, FOOT_R, JOINTS, LEN, STAND_Y, dist, fk, lerpPose, mixPose, pose, reachArm, reachLeg, type Joints, type Pose } from '../src/lib/rig';
import { DEMOS, DEMO_IDS, anchorAt, demoSecs, phasePose, phaseStart, sampleDemo } from '../src/lib/demos';
import { EXERCISES } from '../src/lib/exercises';

const IDS = ['pushup', 'incline-pushup', 'diamond-pushup', 'pike-pushup', 'chair-dip', 'pack-row', 'one-arm-row', 'pack-curl', 'squat', 'rdl', 'split-squat', 'bulgarian', 'glute-bridge', 'single-leg-bridge', 'wall-sit', 'calf-raise', 'dead-bug', 'plank'];

/** Bones whose two ends sit on one rigid segment, with their length. */
const RIGID: [keyof Joints, keyof Joints, number][] = (['l', 'r'] as const).flatMap((s): [keyof Joints, keyof Joints, number][] => [
  [`${s}Shoulder`, `${s}Elbow`, LEN.upperArm],
  [`${s}Elbow`, `${s}Wrist`, LEN.forearm],
  [`${s}Wrist`, `${s}Hand`, LEN.hand],
  [`${s}Hip`, `${s}Knee`, LEN.thigh],
  [`${s}Knee`, `${s}Ankle`, LEN.shin],
  [`${s}Heel`, `${s}Toe`, LEN.heelBack + LEN.toeFwd],
]);
RIGID.push(['pelvis', 'spine', LEN.pelvisToSpine], ['spine', 'chest', LEN.spineToChest], ['chest', 'neck', LEN.chestToNeck], ['neck', 'head', LEN.neckToHead], ['lShoulder', 'rShoulder', LEN.shoulderX * 2], ['lHip', 'rHip', LEN.hipX * 2]);

/** Every demo sampled through its whole loop. */
function frames(id: string, step = 0.05): { t: number; j: Joints; pose: Pose }[] {
  const d = DEMOS[id];
  const out = [];
  for (let t = 0; t < demoSecs(d); t += step) {
    const p = sampleDemo(d, t).pose;
    out.push({ t, j: fk(p), pose: p });
  }
  return out;
}

describe('rig', () => {
  it('stands 1.7 to 1.85 m tall on the floor', () => {
    const j = fk(pose());
    expect(j.head[1] + 0.105).toBeGreaterThan(1.7);
    expect(j.head[1] + 0.105).toBeLessThan(1.85);
    expect(j.pelvis[1]).toBeCloseTo(STAND_Y, 6);
    expect(j.lAnkle[1]).toBeCloseTo(ANKLE_Y, 6);
    expect(j.lToe[1]).toBeCloseTo(FOOT_R, 6);
    expect(j.lHeel[1]).toBeCloseTo(FOOT_R, 6);
    expect(j.lToe[2]).toBeGreaterThan(j.lHeel[2]); // faces +z
    expect(j.lShoulder[0]).toBeGreaterThan(0); // left is +x
  });

  it('has every joint, all finite, and bones between known joints', () => {
    const j = fk(pose({ pitch: 40, yaw: 20, spine: 10, both: { shFlex: 50, shAbd: 30, shRot: 20, elbow: 70, hipFlex: 60, hipAbd: 10, knee: 80, ankle: 10 } }));
    for (const n of JOINTS) expect(j[n].every(Number.isFinite), n).toBe(true);
    for (const b of BONES) {
      expect(JOINTS).toContain(b.a);
      expect(JOINTS).toContain(b.b);
      expect(b.r).toBeGreaterThan(0);
    }
  });

  it('bends joints the right way', () => {
    const j = fk(pose({ both: { elbow: 90, knee: 90 } }));
    expect(j.lHand[2]).toBeGreaterThan(j.lElbow[2] + 0.2); // forearm comes forward
    expect(j.lAnkle[2]).toBeLessThan(j.lKnee[2] - 0.3); // shin goes back
    const up = fk(pose({ both: { shFlex: 90 } }));
    expect(up.lHand[2]).toBeGreaterThan(0.5);
    const out = fk(pose({ both: { shAbd: 90 } }));
    expect(out.lHand[0]).toBeGreaterThan(0.7);
    expect(out.rHand[0]).toBeLessThan(-0.7);
    expect(fk(pose({ pitch: 90 })).head[2]).toBeGreaterThan(0.5); // leaning forward
  });

  it('is mirror-symmetric for a symmetric pose', () => {
    const j = fk(pose({ pitch: 25, spine: 5, both: { shFlex: 40, shAbd: 35, shRot: 25, elbow: 60, hipFlex: 50, hipAbd: 15, hipRot: 10, knee: 70, ankle: 5 } }));
    for (const n of ['Shoulder', 'Elbow', 'Wrist', 'Hand', 'Hip', 'Knee', 'Ankle', 'Heel', 'Toe'] as const) {
      const l = j[`l${n}`], r = j[`r${n}`];
      expect(l[0]).toBeCloseTo(-r[0], 9);
      expect(l[1]).toBeCloseTo(r[1], 9);
      expect(l[2]).toBeCloseTo(r[2], 9);
    }
  });

  it('reaches: the hand and the ankle land on the target', () => {
    const base = pose({ pitch: 30, yaw: 15 });
    const hand = fk(reachArm(base, 'l', [0.35, 1.1, 0.45], [1, -1, 0])).lHand;
    expect(dist(hand, [0.35, 1.1, 0.45])).toBeLessThan(1e-6);
    const leg = fk(reachLeg(base, 'r', [-0.2, ANKLE_Y + 0.15, 0.1], [0, 0, 1]));
    expect(dist(leg.rAnkle, [-0.2, ANKLE_Y + 0.15, 0.1])).toBeLessThan(1e-6);
    expect(leg.rToe[1]).toBeCloseTo(FOOT_R + 0.15, 2); // flat foot
    expect(leg.rHeel[1]).toBeCloseTo(FOOT_R + 0.15, 2);
    // Out of reach: the arm goes straight toward it and stays its own length.
    const far = fk(reachArm(pose(), 'r', [-3, 1.4, 0], [0, -1, 0]));
    expect(dist(far.rShoulder, far.rHand)).toBeLessThan(LEN.upperArm + LEN.forearm + LEN.hand);
  });

  it('blends: ends are exact, the middle is eased, and it is deterministic', () => {
    const a = pose(), b = pose({ root: [0, 0.5, 0.2], pitch: 40, both: { shFlex: 170, shAbd: 20, elbow: 90, hipFlex: 100, knee: 110 } });
    expect(fk(lerpPose(a, b, 0))).toEqual(fk(a));
    expect(fk(lerpPose(a, b, 1))).toEqual(fk(b));
    expect(lerpPose(a, b, 0.5).root[1]).toBeCloseTo((a.root[1] + b.root[1]) / 2, 9);
    expect(lerpPose(a, b, 0.25).root[1]).toBeGreaterThan(mixPose(a, b, 0.25).root[1]); // slow start
    expect(lerpPose(a, b, 0.37)).toEqual(lerpPose(a, b, 0.37));
    for (const t of [0.1, 0.5, 0.9]) {
      const j = fk(lerpPose(a, b, t));
      for (const [p, q, l] of RIGID) expect(dist(j[p], j[q])).toBeCloseTo(l, 6);
    }
  });
});

describe('demos', () => {
  it('has the home demos, and every exercise demo resolves', () => {
    expect([...DEMO_IDS].sort()).toEqual([...IDS].sort());
    const used = EXERCISES.filter((e) => e.demo);
    expect(used.length).toBeGreaterThanOrEqual(IDS.length);
    for (const e of used) expect(DEMOS[e.demo!], `${e.id} → ${e.demo}`).toBeDefined();
    for (const id of IDS) expect(used.some((e) => e.demo === id), `${id} is used`).toBe(true);
  });

  it('has 2–4 named phases with a cue each, and lowers slower than it lifts', () => {
    for (const id of IDS) {
      const d = DEMOS[id];
      expect(d.phases.length, id).toBeGreaterThanOrEqual(2);
      expect(d.phases.length, id).toBeLessThanOrEqual(4);
      for (const p of d.phases) {
        expect(p.name.length, id).toBeGreaterThan(1);
        expect(p.name.length, id).toBeLessThanOrEqual(10);
        expect(p.cue.length, id).toBeGreaterThan(10);
        expect(p.cue.length, id).toBeLessThanOrEqual(90);
        expect(p.secs, id).toBeGreaterThan(0);
      }
      expect(demoSecs(d), id).toBeGreaterThan(3);
      expect(demoSecs(d), id).toBeLessThanOrEqual(8);
    }
    const secs = (id: string, name: string) => DEMOS[id].phases.find((p) => p.name === name)!.secs;
    for (const id of ['pushup', 'incline-pushup', 'diamond-pushup', 'pike-pushup', 'chair-dip']) expect(secs(id, 'Lower'), id).toBeGreaterThan(secs(id, 'Press'));
    for (const id of ['squat', 'rdl', 'split-squat', 'bulgarian']) expect(secs(id, id === 'rdl' ? 'Hinge' : 'Lower'), id).toBeGreaterThan(secs(id, 'Stand up'));
    expect(secs('pack-curl', 'Lower')).toBeGreaterThan(secs('pack-curl', 'Curl'));
    expect(secs('pack-row', 'Lower')).toBeGreaterThan(secs('pack-row', 'Pull'));
  });

  it('keeps every bone its length and every joint above the floor, all the way round', () => {
    for (const id of IDS) {
      for (const f of frames(id)) {
        for (const [a, b, l] of RIGID) expect(dist(f.j[a], f.j[b]), `${id} ${a}-${b} @${f.t.toFixed(2)}`).toBeCloseTo(l, 5);
        for (const n of JOINTS) {
          expect(Number.isFinite(f.j[n][1]), `${id} ${n}`).toBe(true);
          expect(f.j[n][1], `${id} ${n} @${f.t.toFixed(2)}`).toBeGreaterThan(0.02);
        }
      }
    }
  });

  it('loops and moves smoothly', () => {
    for (const id of IDS) {
      const d = DEMOS[id];
      const total = demoSecs(d);
      const same = (a: Joints, b: Joints) => JOINTS.forEach((n) => expect(dist(a[n], b[n]), `${id} ${n}`).toBeLessThan(1e-6));
      same(fk(sampleDemo(d, 0).pose), fk(sampleDemo(d, total).pose));
      same(fk(sampleDemo(d, total * 3 + 0.4).pose), fk(sampleDemo(d, 0.4).pose));
      expect(sampleDemo(d, -0.3).phase).toBe(d.phases.length - 1);
      // No joint jumps: under 4 m/s between samples 1/60 s apart, including across the loop point.
      let prev = fk(sampleDemo(d, -1 / 60).pose);
      for (let t = 0; t <= total; t += 1 / 60) {
        const j = fk(sampleDemo(d, t).pose);
        for (const n of JOINTS) expect(dist(j[n], prev[n]), `${id} ${n} @${t.toFixed(2)}`).toBeLessThan(4 / 60);
        prev = j;
      }
      d.phases.forEach((p, i) => {
        expect(phasePose(d, i)).toBe(p.pose);
        const end = fk(sampleDemo(d, phaseStart(d, i) + p.secs - 1e-6).pose);
        for (const n of JOINTS) expect(dist(end[n], fk(p.pose)[n])).toBeLessThan(1e-3);
      });
    }
  });

  it('keeps feet flat on the floor in the standing demos', () => {
    for (const id of ['squat', 'rdl', 'pack-curl', 'pack-row']) {
      for (const f of frames(id)) {
        for (const n of ['lHeel', 'lToe', 'rHeel', 'rToe'] as const) expect(Math.abs(f.j[n][1] - FOOT_R), `${id} ${n} @${f.t.toFixed(2)}`).toBeLessThan(0.02);
      }
    }
    for (const id of ['split-squat', 'bulgarian']) {
      for (const f of frames(id)) {
        expect(Math.abs(f.j.lHeel[1] - FOOT_R), id).toBeLessThan(0.012);
        expect(f.j.rHeel[1], id).toBeGreaterThan(0.12);
        expect(f.j.rKnee[1], id).toBeGreaterThan(0.06);
      }
    }
    for (const f of frames('split-squat')) expect(Math.abs(f.j.rToe[1] - FOOT_R)).toBeLessThan(0.02);
    for (const f of frames('bulgarian')) expect(Math.abs(f.j.rToe[1] - (0.45 + FOOT_R))).toBeLessThan(0.02);
    // Calf raise: toes stay on the step edge while the heels drop below it and rise above it.
    const cf = frames('calf-raise');
    for (const f of cf) expect(Math.abs(f.j.lToe[1] - (0.18 + FOOT_R))).toBeLessThan(0.005);
    expect(Math.min(...cf.map((f) => f.j.lHeel[1]))).toBeLessThan(0.18 + FOOT_R - 0.03);
    expect(Math.max(...cf.map((f) => f.j.lHeel[1]))).toBeGreaterThan(0.18 + FOOT_R + 0.06);
  });

  it('is mirror-symmetric where the exercise is', () => {
    for (const id of ['pushup', 'incline-pushup', 'diamond-pushup', 'pike-pushup', 'chair-dip', 'pack-row', 'pack-curl', 'squat', 'rdl', 'glute-bridge', 'wall-sit', 'calf-raise', 'plank']) {
      for (const f of frames(id, 0.21)) {
        for (const n of ['Elbow', 'Hand', 'Knee', 'Toe'] as const) {
          const l = f.j[`l${n}`], r = f.j[`r${n}`];
          expect(l[0], `${id} ${n}`).toBeCloseTo(-r[0], 4);
          expect(l[1], `${id} ${n}`).toBeCloseTo(r[1], 4);
          expect(l[2], `${id} ${n}`).toBeCloseTo(r[2], 4);
        }
      }
    }
  });

  it('shows safe technique', () => {
    // Flat back everywhere: no demo rounds the spine.
    for (const id of IDS) for (const f of frames(id, 0.2)) expect(Math.abs(f.pose.spine) + Math.abs(f.pose.chest), id).toBeLessThan(1e-9);
    // No joint bends backwards or past its range.
    for (const id of IDS)
      for (const f of frames(id, 0.1))
        for (const s of ['l', 'r'] as const) {
          expect(f.pose[s].elbow, `${id} elbow`).toBeGreaterThanOrEqual(0);
          expect(f.pose[s].elbow, `${id} elbow`).toBeLessThan(160);
          expect(f.pose[s].knee, `${id} knee`).toBeGreaterThanOrEqual(0);
          expect(f.pose[s].knee, `${id} knee`).toBeLessThan(150);
        }
    // Hands stay planted.
    for (const id of ['pushup', 'incline-pushup', 'diamond-pushup', 'pike-pushup', 'chair-dip']) {
      const h0 = fk(DEMOS[id].phases[0].pose).lHand;
      for (const f of frames(id)) expect(dist(f.j.lHand, h0), `${id} @${f.t.toFixed(2)}`).toBeLessThan(0.02);
    }
    // Push-ups: one straight line from shoulders to ankles (hips neither sag nor pike).
    for (const id of ['pushup', 'incline-pushup', 'diamond-pushup']) {
      for (const f of frames(id, 0.2)) {
        const along = (f.j.pelvis[2] - f.j.lAnkle[2]) / (f.j.lShoulder[2] - f.j.lAnkle[2]);
        const line = f.j.lAnkle[1] + (f.j.lShoulder[1] - f.j.lAnkle[1]) * along;
        expect(Math.abs(f.j.pelvis[1] - line), id).toBeLessThan(0.06);
      }
    }
    const low = fk(DEMOS.pushup.phases[2].pose);
    const flare = (Math.atan2(low.lElbow[0] - low.lShoulder[0], low.lShoulder[2] - low.lElbow[2]) * 180) / Math.PI;
    expect(flare).toBeGreaterThan(25);
    expect(flare).toBeLessThan(65);
    for (const id of ['pushup', 'incline-pushup', 'pike-pushup', 'chair-dip']) for (const p of DEMOS[id].phases) expect(p.pose.l.elbow, id).toBeGreaterThan(3);
    // Chair dip: no deeper than about 90° at the elbow.
    expect(DEMOS['chair-dip'].phases[2].pose.l.elbow).toBeLessThan(100);
    expect(DEMOS['chair-dip'].phases[2].pose.l.elbow).toBeGreaterThan(70);
    // Squat: knees track over the toes, thighs about level at the bottom, chest up.
    for (const f of frames('squat', 0.2)) {
      expect(f.j.lKnee[0]).toBeGreaterThan(Math.min(f.j.lHip[0], f.j.lAnkle[0]) - 0.005);
      expect(f.pose.pitch).toBeLessThan(45);
    }
    const deep = fk(DEMOS.squat.phases[2].pose);
    expect(deep.lHip[1]).toBeLessThan(deep.lKnee[1] + 0.08);
    for (const id of ['split-squat', 'bulgarian']) {
      const b = fk(DEMOS[id].phases[2].pose);
      expect(b.lKnee[2], id).toBeLessThan(b.lToe[2] + 0.04);
    }
    // RDL and the row: a hinge with soft knees and hips back, the bag close.
    const rdl = DEMOS.rdl.phases[2].pose, rj = fk(rdl);
    expect(rdl.l.knee).toBeGreaterThan(8);
    expect(rdl.l.knee).toBeLessThan(40);
    expect(rj.pelvis[2]).toBeLessThan(-0.15);
    expect(rj.lHand[2]).toBeLessThan(0.25);
    for (const f of frames('pack-row', 0.2)) expect(f.pose.l.knee).toBeLessThan(40);
    for (const f of frames('one-arm-row', 0.2)) {
      expect(f.pose.yaw).toBe(0);
      expect(f.pose.roll).toBe(0);
      expect(Math.abs(f.j.chest[1] - f.j.pelvis[1])).toBeLessThan(0.12);
    }
    // Bridge: hips up to a straight line from shoulders to knees, not arched past it.
    for (const id of ['glute-bridge', 'single-leg-bridge']) {
      const top = fk(DEMOS[id].phases[2].pose);
      const along = (top.pelvis[2] - top.lShoulder[2]) / (top.lKnee[2] - top.lShoulder[2]);
      const line = top.lShoulder[1] + (top.lKnee[1] - top.lShoulder[1]) * along;
      expect(top.pelvis[1] - line, id).toBeLessThan(0.05);
      expect(top.pelvis[1] - line, id).toBeGreaterThan(-0.08);
    }
    // Wall sit: thighs about level, knees over the ankles, back on the wall.
    const ws = fk(DEMOS['wall-sit'].phases[2].pose);
    expect(Math.abs(ws.lHip[1] - ws.lKnee[1])).toBeLessThan(0.08);
    expect(Math.abs(ws.lKnee[2] - ws.lAnkle[2])).toBeLessThan(0.1);
    // Dead bug and plank.
    const db = fk(DEMOS['dead-bug'].phases[0].pose);
    expect(Math.abs(db.lKnee[2] - db.lHip[2])).toBeLessThan(0.05);
    const pl = fk(DEMOS.plank.phases[2].pose);
    expect(Math.abs(pl.lElbow[2] - pl.lShoulder[2])).toBeLessThan(0.08);
  });

  it('places gear on real anchors', () => {
    for (const id of IDS) {
      const d = DEMOS[id];
      const j = fk(d.phases[0].pose);
      for (const p of d.props) {
        const pts = p.kind === 'rod' ? [anchorAt(j, p.a), anchorAt(j, p.b)] : [anchorAt(j, p.at)];
        for (const v of pts) expect(v.every(Number.isFinite), `${id} ${p.kind}`).toBe(true);
      }
      expect(d.camera.dist).toBeGreaterThan(2);
      expect(d.work.length).toBeGreaterThan(0);
    }
  });
});
