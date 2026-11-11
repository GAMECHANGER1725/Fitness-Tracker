// A form demo for one exercise: the animated 3D mannequin (play/pause, tap a phase to stop on it) or, on phones
// that can't or shouldn't animate, the same poses drawn flat and stepped through by hand.
// Opened inside a sheet from the logger, so it mounts fast and cleans up everything on close.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BONES, HEAD_R, fk, type Joints, type Vec3 } from '../lib/rig';
import { DEMOS, anchorAt, phasePose, type Demo, type Prop } from '../lib/demos';
import { Icon } from './ui';
import { markSlow, mixHex, use3d, useTokens } from './use3d';
import './body.css';

export function FormDemo({ demo: id }: { demo: string }) {
  const demo = DEMOS[id];
  const want3d = use3d();
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(want3d);
  if (!demo) return null;
  const ph = demo.phases[phase];
  return (
    <div className="demo">
      <div className="demo-stage">
        {want3d ? <Demo3D demo={demo} playing={playing} phase={phase} onPhase={setPhase} /> : <Demo2D demo={demo} phase={phase} />}
        <span className="pill mut demo-tag">
          {phase + 1}/{demo.phases.length} · {ph.name}
        </span>
        {want3d && (
          <button className="btn sm icon demo-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
            <Icon name={playing ? 'pause' : 'play'} size={18} stroke={playing ? 3 : 2} fill={!playing} />
          </button>
        )}
      </div>
      <p className="bold demo-cue" aria-live="polite">{ph.cue}</p>
      <div className="row" role="group" aria-label="Phases" style={{ flexWrap: 'wrap', gap: 6 }}>
        {!want3d && (
          <button className="btn sm icon" aria-label="Previous phase" onClick={() => setPhase((phase - 1 + demo.phases.length) % demo.phases.length)}>
            <Icon name="left" size={18} />
          </button>
        )}
        {demo.phases.map((p, i) => (
          <button key={p.name + i} className="chip" aria-pressed={i === phase} onClick={() => (setPlaying(false), setPhase(i))}>
            {p.name}
          </button>
        ))}
        {!want3d && (
          <button className="btn sm icon" aria-label="Next phase" onClick={() => setPhase((phase + 1) % demo.phases.length)}>
            <Icon name="right" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

type SceneApi = import('../three/DemoScene').DemoScene;

function useDemoColours() {
  const t = useTokens();
  return {
    body: mixHex(t('--s3'), t('--ink'), 0.4),
    work: t('--acc'),
    pad: mixHex(t('--s3'), t('--ink'), 0.12),
    frame: t('--line2'),
    steel: t('--mut'),
    mat: t('--s3'),
    floor: mixHex(t('--s2'), t('--s3'), 0.6),
  };
}

function Demo3D({ demo, playing, phase, onPhase }: { demo: Demo; playing: boolean; phase: number; onPhase: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);
  const colours = useDemoColours();
  const latest = useRef({ playing, phase, colours, onPhase });
  latest.current = { playing, phase, colours, onPhase };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let gone = false;
    let ro: ResizeObserver | null = null;
    import('../three/DemoScene')
      .then(({ createDemoScene }) => {
        if (gone || !box.current) return;
        // A fresh canvas each time: a canvas whose context was released can't be drawn on again.
        const el = document.createElement('canvas');
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', `${demo.name} form demo`);
        box.current.appendChild(el);
        const s = createDemoScene(el, demo, { colors: latest.current.colours, onSlow: () => markSlow() });
        api.current = s;
        s.onPhase((i) => latest.current.onPhase(i));
        const fit = () => s.setSize(el.clientWidth, el.clientHeight);
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(el);
        if (latest.current.playing) s.play();
        else s.seekPhase(latest.current.phase);
        setReady(true);
      })
      .catch(() => markSlow());
    return () => {
      gone = true;
      ro?.disconnect();
      api.current?.dispose();
      api.current = null;
      box.current?.replaceChildren();
    };
  }, [demo.id]);

  useEffect(() => {
    const s = api.current;
    if (!s) return;
    if (playing) s.play();
    else s.seekPhase(phase);
  }, [playing, ready, playing ? -1 : phase]);

  useEffect(() => {
    api.current?.setColors(colours);
  }, [JSON.stringify(colours)]);

  return (
    <>
      {!ready && <Demo2D demo={demo} phase={phase} />}
      <div ref={box} className="demo-canvas" style={{ opacity: ready ? 1 : 0 }} />
    </>
  );
}

// ----- 2D: the same poses projected flat from the demo's camera angle ------------------------

interface Item {
  depth: number;
  el: React.ReactElement;
}

function Demo2D({ demo, phase }: { demo: Demo; phase: number }) {
  const colours = useDemoColours();
  const j = useMemo(() => fk(phasePose(demo, phase)), [demo, phase]);
  const c = demo.camera;
  const yaw = (c.yaw * Math.PI) / 180, pitch = (c.pitch * Math.PI) / 180;
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up: Vec3 = [-Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), -Math.sin(pitch) * Math.cos(yaw)];
  const toCam: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const P = (p: Vec3) => {
    const r: Vec3 = [p[0] - c.target[0], p[1] - c.target[1], p[2] - c.target[2]];
    return { x: dot(r, right), y: -dot(r, up), d: dot(r, toCam) };
  };
  const items: Item[] = [];
  const line = (a: Vec3, b: Vec3, w: number, color: string, key: string) => {
    const A = P(a), B = P(b);
    items.push({ depth: (A.d + B.d) / 2, el: <line key={key} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={color} strokeWidth={w} strokeLinecap="round" /> });
  };
  demo.props.forEach((p, i) => prop(p, j, i, P, line, items, colours));
  BONES.forEach((b, i) => line(j[b.a], j[b.b], (b.r + (b.r2 ?? b.r)) * (b.part === 'torso' ? 1.1 : 1.05), demo.work.includes(b.part) ? colours.work : colours.body, `b${i}`));
  const H = P(j.head);
  items.push({ depth: H.d, el: <circle key="head" cx={H.x} cy={H.y} r={HEAD_R} fill={colours.body} /> });
  items.sort((a, b) => a.depth - b.depth);
  // Fit: the same framing as the 3D camera (30° lens at `dist`).
  const half = Math.tan((15 * Math.PI) / 180) * c.dist;
  const floorY = P([c.target[0], 0, c.target[2]]).y;
  return (
    <svg viewBox={`${-half * 1.333} ${-half} ${half * 2.666} ${half * 2}`} role="img" aria-label={`${demo.name}: ${demo.phases[phase].name}`}>
      <ellipse cx={0} cy={floorY} rx={half * 1.1} ry={half * 0.12} fill={colours.floor} />
      {items.map((x) => x.el)}
    </svg>
  );
}

function prop(p: Prop, j: Joints, i: number, P: (v: Vec3) => { x: number; y: number; d: number }, line: (a: Vec3, b: Vec3, w: number, c: string, k: string) => void, items: Item[], col: Record<string, string>) {
  if (p.kind === 'rod') {
    const a = anchorAt(j, p.a), b = anchorAt(j, p.b);
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d) || 1;
    const e = (p.extend ?? 0) / l;
    const A: Vec3 = [a[0] - d[0] * e, a[1] - d[1] * e, a[2] - d[2] * e], B: Vec3 = [b[0] + d[0] * e, b[1] + d[1] * e, b[2] + d[2] * e];
    return line(A, B, Math.max(0.012, p.r * 2), p.tone === 'cable' ? col.frame : col.steel, `p${i}`);
  }
  if (p.kind === 'dumbbell') {
    const at = anchorAt(j, p.at);
    const ax: Vec3 = p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const end = (k: number): Vec3 => [at[0] + ax[0] * k, at[1] + ax[1] * k, at[2] + ax[2] * k];
    line(end(-0.1), end(0.1), 0.03, col.steel, `p${i}h`);
    line(end(-0.12), end(-0.08), 0.11, col.frame, `p${i}a`);
    line(end(0.08), end(0.12), 0.11, col.frame, `p${i}b`);
    return;
  }
  // A box: project its 8 corners and draw their outline (convex hull).
  const at = anchorAt(j, p.at);
  const pr = ((p.pitch ?? 0) * Math.PI) / 180, cs = Math.cos(pr), sn = Math.sin(pr);
  const rx = (v: Vec3): Vec3 => [v[0], v[1] * cs - v[2] * sn, v[1] * sn + v[2] * cs];
  const off = p.off ?? [0, 0, 0];
  const pts = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => {
    const v = rx([off[0] + (a * p.size[0]) / 2, off[1] + (b * p.size[1]) / 2, off[2] + (c * p.size[2]) / 2]);
    return P([at[0] + v[0], at[1] + v[1], at[2] + v[2]]);
  })));
  const hull = convexHull(pts);
  const depth = pts.reduce((s, q) => s + q.d, 0) / pts.length;
  items.push({ depth: depth - 0.3, el: <polygon key={`p${i}`} points={hull.map((q) => `${q.x},${q.y}`).join(' ')} fill={p.tone === 'mat' ? col.mat : p.tone === 'pad' ? col.pad : col.frame} /> });
}

function convexHull<T extends { x: number; y: number }>(pts: T[]): T[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: T, a: T, b: T) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: T[] = [], upper: T[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...s].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
