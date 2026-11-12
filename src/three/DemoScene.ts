// The animated mannequin for a form demo: rounded segments along rig.BONES, moved by rig.fk + demos.sampleDemo,
// with the demo's gear, a floor disc and a soft shadow blob. Loaded only through a dynamic import.

import { AmbientLight, BoxGeometry, CircleGeometry, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, Quaternion, Scene, SphereGeometry, Vector3 } from 'three';
import { BONES, HEAD_R, dist, fk, sideAxis, type Bone, type Joints, type Pose, type Vec3 } from '../lib/rig';
import { anchorAt, phasePose, phaseStart, sampleDemo, type Demo, type Prop } from '../lib/demos';
import { MAX_DPR, capsule, colour, disposeAll, makeRenderer, stats, watchdog } from './common';

export interface DemoColors {
  /** The mannequin, and the limbs doing the work. */
  body: string;
  work: string;
  pad: string;
  frame: string;
  steel: string;
  mat: string;
  floor: string;
}

export interface DemoSceneOpts {
  colors: DemoColors;
  /** Called once if the scene can't hold 20 fps even at pixel ratio 1. */
  onSlow?: (fps: number) => void;
}

export interface DemoScene {
  play(): void;
  pause(): void;
  /** Stop on the end pose of phase i. */
  seekPhase(i: number): void;
  setSize(width: number, height: number, dpr?: number): void;
  setColors(c: DemoColors): void;
  /** Called whenever the phase on screen changes. */
  onPhase(cb: (i: number) => void): void;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);
const v = (a: Vec3) => new Vector3(a[0], a[1], a[2]);

export function createDemoScene(canvas: HTMLCanvasElement, demo: Demo, opts: DemoSceneOpts): DemoScene {
  const renderer = makeRenderer(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 40);
  stats.born('demo');

  // Light: soft sky and ground, one key light from the camera's upper left.
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 1.5), new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xffffff, 1.9);
  scene.add(key);

  const mats = {
    body: new MeshLambertMaterial(),
    work: new MeshLambertMaterial(),
    pad: new MeshLambertMaterial(),
    frame: new MeshLambertMaterial(),
    steel: new MeshLambertMaterial(),
    mat: new MeshLambertMaterial(),
    floor: new MeshBasicMaterial(),
    shadow: new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthWrite: false }),
  };
  function setColors(c: DemoColors) {
    for (const k of ['body', 'work', 'pad', 'frame', 'steel', 'mat', 'floor'] as const) mats[k].color.copy(colour(c[k]));
    draw();
  }

  // ----- Floor and shadow -----
  const disc = new CircleGeometry(1, 40);
  const floor = new Mesh(disc, mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.scale.setScalar(1.9);
  floor.position.set(demo.camera.target[0], 0, demo.camera.target[2]);
  scene.add(floor);
  const shadows = [1, 0.78, 0.56].map((k, i) => {
    const m = new Mesh(disc, mats.shadow);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002 + i * 0.001;
    m.userData.k = k;
    scene.add(m);
    return m;
  });

  // ----- Mannequin: one mesh per bone, geometry shared between left and right -----
  const j0 = fk(demo.phases[0].pose);
  const geos = new Map<string, ReturnType<typeof capsule>>();
  const body = new Group();
  scene.add(body);
  const bones = BONES.map((b: Bone) => {
    const len = dist(j0[b.a], j0[b.b]);
    const gk = `${len.toFixed(4)}|${b.r}|${b.r2 ?? b.r}`;
    let g = geos.get(gk);
    if (!g) geos.set(gk, (g = capsule(len, b.r, b.r2 ?? b.r)));
    const mesh = new Mesh(g, demo.work.includes(b.part) ? mats.work : mats.body);
    if (b.flat) mesh.scale.z = b.flat;
    body.add(mesh);
    return { b, mesh };
  });
  const head = new Mesh(new SphereGeometry(HEAD_R, 16, 12), mats.body);
  head.scale.set(0.94, 1.08, 1);
  body.add(head);

  // ----- Gear -----
  const box = new BoxGeometry(1, 1, 1);
  const rod = new CylinderGeometry(1, 1, 1, 10);
  const plate = new CylinderGeometry(0.058, 0.058, 0.055, 12);
  const gear = new Group();
  scene.add(gear);
  const AXIS = { x: new Vector3(1, 0, 0), y: UP, z: new Vector3(0, 0, 1) };
  const moving = (a: Prop extends infer P ? (P extends { at: infer A } ? A : never) : never) => typeof a === 'string';
  const props = demo.props.map((p) => {
    if (p.kind === 'box') {
      const m = new Mesh(box, mats[p.tone ?? 'frame']);
      m.scale.set(...p.size);
      m.rotation.x = ((p.pitch ?? 0) * Math.PI) / 180;
      gear.add(m);
      const off = v(p.off ?? [0, 0, 0]).applyEuler(m.rotation);
      return { live: moving(p.at), place: (j: Joints) => m.position.copy(v(anchorAt(j, p.at))).add(off) };
    }
    if (p.kind === 'rod') {
      const m = new Mesh(rod, mats[p.tone === 'cable' ? 'frame' : 'steel']);
      gear.add(m);
      const d = new Vector3();
      return {
        live: typeof p.a === 'string' || typeof p.b === 'string',
        place: (j: Joints) => {
          const a = v(anchorAt(j, p.a)), b = v(anchorAt(j, p.b));
          d.subVectors(b, a);
          const l = d.length() || 1e-3;
          m.position.addVectors(a, b).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(UP, d.divideScalar(l));
          m.scale.set(p.r, l + 2 * (p.extend ?? 0), p.r);
        },
      };
    }
    const g = new Group();
    const handle = new Mesh(rod, mats.steel);
    handle.scale.set(0.014, 0.2, 0.014);
    const ends = [-0.1, 0.1].map((y) => {
      const e = new Mesh(plate, mats.frame);
      e.position.y = y;
      return e;
    });
    g.add(handle, ...ends);
    g.quaternion.setFromUnitVectors(UP, AXIS[p.axis]);
    gear.add(g);
    return { live: moving(p.at), place: (j: Joints) => g.position.copy(v(anchorAt(j, p.at))) };
  });

  // ----- Posing -----
  const m4 = new Matrix4(), x = new Vector3(), y = new Vector3(), z = new Vector3(), side = new Vector3(), q = new Quaternion();
  let first = true;
  function apply(pose: Pose) {
    const j = fk(pose);
    side.copy(v(sideAxis(pose)));
    for (const { b, mesh } of bones) {
      const a = j[b.a];
      mesh.position.set(a[0], a[1], a[2]);
      y.set(j[b.b][0] - a[0], j[b.b][1] - a[1], j[b.b][2] - a[2]).normalize();
      if (b.flat) {
        // Keep the flat side facing front: x follows the chest's side axis (or the spine, for bones that run sideways).
        x.copy(Math.abs(y.dot(side)) > 0.9 ? v(j.neck).sub(v(j.pelvis)).normalize() : side);
        z.crossVectors(x, y).normalize();
        x.crossVectors(y, z);
        mesh.quaternion.setFromRotationMatrix(m4.makeBasis(x, y, z));
      } else mesh.quaternion.copy(q.setFromUnitVectors(UP, y));
    }
    head.position.set(...j.head);
    head.quaternion.setFromUnitVectors(UP, y.set(j.head[0] - j.neck[0], j.head[1] - j.neck[1], j.head[2] - j.neck[2]).normalize());
    for (const p of props) if (p.live || first) p.place(j);
    first = false;
    // Shadow blob: an ellipse under everything the body covers.
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const n of ['head', 'pelvis', 'lHand', 'rHand', 'lToe', 'rToe', 'lHeel', 'rHeel', 'lShoulder', 'rShoulder'] as const) {
      x0 = Math.min(x0, j[n][0]);
      x1 = Math.max(x1, j[n][0]);
      z0 = Math.min(z0, j[n][2]);
      z1 = Math.max(z1, j[n][2]);
    }
    for (const s of shadows) {
      s.position.x = (x0 + x1) / 2;
      s.position.z = (z0 + z1) / 2;
      s.scale.set(((x1 - x0) / 2 + 0.16) * s.userData.k, ((z1 - z0) / 2 + 0.16) * s.userData.k, 1);
    }
  }

  // ----- Camera -----
  let aspect = 1;
  function aim() {
    const c = demo.camera, yaw = (c.yaw * Math.PI) / 180, pitch = (c.pitch * Math.PI) / 180;
    // Narrow canvases step back so wide movements (push-up, plank) still fit.
    const d = c.dist * Math.max(1, 1.15 / aspect);
    camera.aspect = aspect;
    camera.position.set(c.target[0] + d * Math.sin(yaw) * Math.cos(pitch), c.target[1] + d * Math.sin(pitch), c.target[2] + d * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(...c.target);
    camera.updateProjectionMatrix();
    key.position.copy(camera.position).add(new Vector3(0, 3, 0)).addScaledVector(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), -2.5);
  }

  // ----- Loop: runs only while playing, on screen and in a visible tab -----
  let t = 0, last = 0, raf = 0, playing = false, onScreen = true, dead = false, phase = -1, cap = MAX_DPR, size = { w: 1, h: 1, dpr: 1 };
  let phaseCb: ((i: number) => void) | null = null;
  const dog = watchdog({
    onDip() {
      if (cap <= 1 || size.dpr <= 1) return false;
      cap = cap > 1.5 ? 1.5 : 1;
      setSize(size.w, size.h);
      return true;
    },
    onSlow: (fps) => opts.onSlow?.(fps),
  });
  function draw() {
    if (dead) return;
    renderer.render(scene, camera);
    stats.frame(renderer);
  }
  function setPhase(i: number) {
    if (i !== phase) phaseCb?.((phase = i));
  }
  function frame(now: number) {
    raf = 0;
    if (dead || !playing) return;
    t += Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = sampleDemo(demo, t);
    apply(s.pose);
    setPhase(s.phase);
    draw();
    dog.tick(now);
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    const run = playing && onScreen && !document.hidden && !dead;
    if (run && !raf) {
      last = performance.now();
      dog.reset();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((e) => ((onScreen = e[e.length - 1].isIntersecting), sync()));
  io?.observe(canvas);
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);

  function setSize(w: number, h: number, dpr = window.devicePixelRatio || 1) {
    size = { w: Math.max(1, w), h: Math.max(1, h), dpr };
    renderer.setPixelRatio(Math.min(dpr, cap));
    renderer.setSize(size.w, size.h, false);
    aspect = size.w / size.h;
    aim();
    draw();
  }

  setColors(opts.colors);
  apply(demo.phases[0].pose);
  aim();

  return {
    play() {
      playing = true;
      sync();
    },
    pause() {
      playing = false;
      sync();
    },
    seekPhase(i) {
      const n = demo.phases.length, k = ((i % n) + n) % n;
      playing = false;
      sync();
      t = phaseStart(demo, k) + demo.phases[k].secs; // carry on from here on play
      apply(phasePose(demo, k));
      setPhase(k);
      draw();
    },
    setSize,
    setColors,
    onPhase(cb) {
      phaseCb = cb;
    },
    dispose() {
      if (dead) return;
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      phaseCb = null;
      disposeAll(scene, renderer);
      stats.died();
    },
  };
}
