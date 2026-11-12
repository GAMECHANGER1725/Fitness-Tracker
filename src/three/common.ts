// Shared bits for the two 3D scenes: the renderer, a tapered capsule, cleanup, the FPS watchdog and the numbers
// the performance script reads. Only ever loaded through a dynamic import.

import { BufferGeometry, Color, LatheGeometry, Material, Mesh, Object3D, Vector2, WebGLRenderer } from 'three';

export const MAX_DPR = 2;

export function makeRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

/** A rounded segment along +y from 0 to `len`, radius r1 at the bottom and r2 at the top. */
export function capsule(len: number, r1: number, r2 = r1, radial = 10, cap = 4): LatheGeometry {
  const pts: Vector2[] = [];
  for (let i = 0; i <= cap; i++) {
    const a = (-Math.PI / 2) * (1 - i / cap);
    pts.push(new Vector2(Math.cos(a) * r1, Math.sin(a) * r1));
  }
  for (let i = 0; i <= cap; i++) {
    const a = (Math.PI / 2) * (i / cap);
    pts.push(new Vector2(Math.cos(a) * r2, len + Math.sin(a) * r2));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new LatheGeometry(pts, radial);
}

export const colour = (css: string) => new Color(css);

/** Free every geometry and material under `root`, then the renderer and its WebGL context. */
export function disposeAll(root: Object3D, renderer: WebGLRenderer) {
  const geos = new Set<BufferGeometry>(), mats = new Set<Material>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) geos.add(m.geometry);
    if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
}

/**
 * FPS watchdog. Feed it every animated frame. Every ~2 s it looks at the average:
 * under 30 fps it asks for a lower pixel ratio (`onDip`); under 20 fps with nothing left to lower it calls `onSlow`
 * once, so the view can switch to 2D. Gaps (tab hidden, paused) are skipped, as is the first second (shader compile).
 */
export function watchdog(o: { onDip: () => boolean; onSlow: (fps: number) => void; windowMs?: number }) {
  const span = o.windowMs ?? 2000;
  let start = 0, last = 0, frames = 0, warm = 0, done = false;
  const reset = () => {
    start = 0;
    frames = 0;
  };
  return {
    reset,
    tick(now: number) {
      if (done) return;
      if (!warm) warm = now;
      if (now - warm < 1000) return;
      if (!start || now - last > 250) {
        start = now;
        frames = 0;
      } else frames++;
      last = now;
      if (now - start < span) return;
      const fps = (frames * 1000) / (now - start);
      reset();
      if (fps >= 30) return;
      if (o.onDip()) return; // lowered the pixel ratio: measure again
      if (fps < 20) {
        done = true;
        o.onSlow(fps);
      }
    },
  };
}

export interface Perf3d {
  kind: string;
  /** Frames drawn since the page loaded, over all scenes. */
  frames: number;
  /** Draw calls and triangles of the last frame. */
  calls: number;
  triangles: number;
  /** performance.now() of the first 3D frame. */
  firstFrameMs: number | null;
  /** Scenes alive now, and made in total (for the leak check). */
  live: number;
  made: number;
  dpr: number;
}

const lab = () => typeof location !== 'undefined' && location.hash.includes('lab');
const perf = (): Perf3d | null => {
  if (!lab()) return null;
  const w = window as unknown as { __perf3d?: Perf3d };
  return (w.__perf3d ??= { kind: '', frames: 0, calls: 0, triangles: 0, firstFrameMs: null, live: 0, made: 0, dpr: 1 });
};

/** Numbers for scripts/perf-3d.mjs, on window.__perf3d. Only on the lab page. */
export const stats = {
  born(kind: string) {
    const p = perf();
    if (p) (p.kind = kind), p.live++, p.made++;
  },
  died() {
    const p = perf();
    if (p) p.live--;
  },
  frame(renderer: WebGLRenderer) {
    const p = perf();
    if (!p) return;
    p.frames++;
    p.calls = renderer.info.render.calls;
    p.triangles = renderer.info.render.triangles;
    p.dpr = renderer.getPixelRatio();
    p.firstFrameMs ??= performance.now();
  },
};
