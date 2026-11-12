// The interactive body model: a neutral figure (torso lathe, rounded limbs, head) with one rounded shape per
// muscle on top, all from rig.ts so the 2D map matches it. Drag to turn it, tap a muscle to pick it.
// Renders on demand only (drag, colour change, resize): no animation loop. Loaded only through a dynamic import.

import { AmbientLight, DirectionalLight, Group, HemisphereLight, LatheGeometry, Mesh, MeshLambertMaterial, PerspectiveCamera, Quaternion, Raycaster, Scene, SphereGeometry, Vector2, Vector3 } from 'three';
import { BODY_POSE, BONES, HEAD_R, TORSO, TORSO_DEPTH, bodyShapes, dist, fk } from '../lib/rig';
import type { Muscle } from '../lib/types';
import { MAX_DPR, capsule, colour, disposeAll, makeRenderer, stats } from './common';

export interface BodyScene {
  setColors(muscles: Partial<Record<Muscle, string>>, body: string): void;
  setSize(width: number, height: number, dpr?: number): void;
  onPick(cb: (m: Muscle | null) => void): void;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);

export function createBodyScene(canvas: HTMLCanvasElement): BodyScene {
  const renderer = makeRenderer(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 30);
  stats.born('body');
  scene.add(new HemisphereLight(0xffffff, 0x667788, 1.45), new AmbientLight(0xffffff, 0.3));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(1.5, 3, 4);
  const rim = new DirectionalLight(0xffffff, 0.7);
  rim.position.set(-2, 2, -3);
  scene.add(key, rim);

  const fig = new Group();
  scene.add(fig);
  const skin = new MeshLambertMaterial();
  const j = fk(BODY_POSE);

  // Torso: a lathe from the outline, squashed front to back.
  const torso = new Mesh(new LatheGeometry(TORSO.map(([y, w]) => new Vector2(w, y)), 24), skin);
  torso.scale.z = TORSO_DEPTH;
  fig.add(torso);
  const head = new Mesh(new SphereGeometry(HEAD_R, 20, 14), skin);
  head.scale.set(0.92, 1.1, 1);
  head.position.set(...j.head);
  fig.add(head);
  const neck = BONES.find((b) => b.a === 'neck')!;
  const q = new Quaternion();
  for (const b of BONES) {
    if (b.part === 'torso' && b !== neck) continue;
    const a = j[b.a], c = j[b.b];
    const m = new Mesh(capsule(dist(a, c), b.r * 0.92, (b.r2 ?? b.r) * 0.92, 12, 4), skin);
    m.position.set(...a);
    m.quaternion.copy(q.setFromUnitVectors(UP, new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize()));
    fig.add(m);
  }

  // Muscles: one shared sphere, one material per muscle.
  const ball = new SphereGeometry(1, 18, 12);
  const mats = new Map<Muscle, MeshLambertMaterial>();
  const pickable: Mesh[] = [];
  for (const s of bodyShapes()) {
    let mat = mats.get(s.muscle);
    if (!mat) mats.set(s.muscle, (mat = new MeshLambertMaterial()));
    const m = new Mesh(ball, mat);
    m.position.set(...s.at);
    m.scale.set(...s.r);
    m.rotation.z = (s.tilt * Math.PI) / 180;
    m.userData.muscle = s.muscle;
    fig.add(m);
    pickable.push(m);
  }

  // ----- Camera and turning -----
  let yaw = 0.35, pitch = 0.05, aspect = 1, dead = false, raf = 0;
  const target = new Vector3(0, 0.98, 0);
  function aim() {
    const d = 4.6 * Math.max(1, 0.62 / aspect);
    camera.aspect = aspect;
    camera.position.set(0, target.y + Math.sin(pitch) * d, Math.cos(pitch) * d);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    fig.rotation.y = yaw;
  }
  function draw() {
    if (dead || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (dead) return;
      renderer.render(scene, camera);
      stats.frame(renderer);
    });
  }

  let pickCb: ((m: Muscle | null) => void) | null = null;
  let down: { x: number; y: number; id: number; moved: boolean } | null = null;
  const ray = new Raycaster();
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    // Mostly vertical drags belong to the page scroll (touch-action: pan-y), so only turn on sideways ones.
    if (!down.moved && Math.abs(dy) > Math.abs(dx) && e.pointerType === 'touch') return (down = null), undefined;
    if (!down.moved) canvas.setPointerCapture?.(e.pointerId);
    down.moved = true;
    yaw += dx * 0.012;
    pitch = Math.max(-0.35, Math.min(0.45, pitch + dy * 0.004));
    down.x = e.clientX;
    down.y = e.clientY;
    aim();
    draw();
  };
  const onUp = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const tap = !down.moved;
    down = null;
    if (!tap || !pickCb) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickable, false)[0];
    pickCb((hit?.object.userData.muscle as Muscle) ?? null);
  };
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  aim();
  return {
    setColors(muscles, body) {
      skin.color.copy(colour(body));
      for (const [m, mat] of mats) mat.color.copy(colour(muscles[m] ?? body));
      draw();
    },
    setSize(w, h, dpr = window.devicePixelRatio || 1) {
      renderer.setPixelRatio(Math.min(dpr, MAX_DPR));
      renderer.setSize(Math.max(1, w), Math.max(1, h), false);
      aspect = Math.max(1, w) / Math.max(1, h);
      aim();
      draw();
    },
    onPick(cb) {
      pickCb = cb;
    },
    dispose() {
      if (dead) return;
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      pickCb = null;
      disposeAll(scene, renderer);
      stats.died();
    },
  };
}
