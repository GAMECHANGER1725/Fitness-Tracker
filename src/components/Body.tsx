// The body map. 3D (drag to turn, tap a muscle) when the phone can do it; otherwise a flat front-and-back map
// drawn from the same shapes (rig.bodyShapes), so both always agree. The 3D code is only fetched when used,
// and the 2D map shows while it loads, so the box is never empty.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BODY_POSE, BONES, HEAD_R, TORSO, bodyShapes, fk } from '../lib/rig';
import { MUSCLES, MUSCLE_LABEL } from '../lib/exercises';
import { HEAT_LABEL, heat, type Volume } from '../lib/muscles';
import type { Muscle } from '../lib/types';
import { markSlow, mixHex, use3d, useTokens } from './use3d';
import './body.css';

type Scale = 'heat' | 'focus';

/** Fill for each muscle, and the neutral body colour, from the theme tokens. */
function palette(t: (n: string) => string, volume: Volume, scale: Scale) {
  const body = mixHex(t('--s3'), t('--ink'), 0.12);
  const none = mixHex(t('--s3'), t('--ink'), 0.26);
  const acc = t('--acc');
  const steps = [none, mixHex(none, acc, 0.38), mixHex(none, acc, 0.7), acc, t('--warn')];
  const fill = {} as Record<Muscle, string>;
  for (const m of MUSCLES) {
    const v = volume[m] ?? 0;
    fill[m] = scale === 'heat' ? steps[heat(v)] : v >= 1 ? acc : v > 0 ? mixHex(none, acc, 0.45) : none;
  }
  return { body, fill, steps };
}

export function BodyMap({ volume, scale = 'heat', onPick, height = 320 }: { volume: Volume; scale?: Scale; onPick?: (m: Muscle | null) => void; height?: number }) {
  const want3d = use3d();
  const t = useTokens();
  const { body, fill, steps } = palette(t, volume, scale);
  const [pick, setPick] = useState<Muscle | null>(null);
  const [ready, setReady] = useState(false);
  const choose = (m: Muscle | null) => {
    setPick(m);
    onPick?.(m);
  };
  return (
    <div className="bodymap">
      <div className="bodymap-stage" style={{ height }}>
        {want3d && <Body3D fill={fill} body={body} onPick={choose} onReady={setReady} />}
        {(!want3d || !ready) && <Body2D fill={fill} body={body} onPick={choose} pick={pick} />}
      </div>
      {pick && (
        <p className="small" style={{ textAlign: 'center' }}>
          <span className="bold">{MUSCLE_LABEL[pick]}</span> <span className="mut">· {+(volume[pick] ?? 0).toFixed(1)} {scale === 'heat' ? 'hard sets' : (volume[pick] ?? 0) >= 1 ? 'main muscle' : (volume[pick] ?? 0) > 0 ? 'helps' : 'not used'}</span>
        </p>
      )}
      {scale === 'heat' ? (
        <div className="bodymap-legend" aria-label="Colour key">
          {HEAT_LABEL.map((l, i) => (
            <span key={l}>
              <i style={{ background: steps[i] }} />
              {l}
            </span>
          ))}
        </div>
      ) : (
        <div className="bodymap-legend" aria-label="Colour key">
          <span><i style={{ background: t('--acc') }} />Main</span>
          <span><i style={{ background: mixHex(mixHex(t('--s3'), t('--ink'), 0.26), t('--acc'), 0.45) }} />Helps</span>
        </div>
      )}
    </div>
  );
}

type SceneApi = import('../three/BodyScene').BodyScene;

function Body3D({ fill, body, onPick, onReady }: { fill: Record<Muscle, string>; body: string; onPick: (m: Muscle | null) => void; onReady: (r: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const colours = useRef({ fill, body });
  colours.current = { fill, body };

  useEffect(() => {
    let gone = false;
    let ro: ResizeObserver | null = null;
    import('../three/BodyScene')
      .then(({ createBodyScene }) => {
        if (gone || !box.current) return;
        // A fresh canvas each time: a canvas whose context was released can't be drawn on again.
        const el = document.createElement('canvas');
        el.className = 'bodymap-canvas';
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', '3D body. Drag sideways to turn it, tap a muscle.');
        box.current.appendChild(el);
        const s = createBodyScene(el);
        api.current = s;
        s.onPick((m) => pickRef.current(m));
        s.setColors(colours.current.fill, colours.current.body);
        const fit = () => s.setSize(el.clientWidth, el.clientHeight);
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(el);
        onReady(true);
      })
      .catch(() => {
        markSlow(); // couldn't load or start: use 2D
      });
    return () => {
      gone = true;
      ro?.disconnect();
      api.current?.dispose();
      api.current = null;
      box.current?.replaceChildren();
      onReady(false);
    };
  }, []);

  useEffect(() => {
    api.current?.setColors(fill, body);
  }, [JSON.stringify(fill), body]);

  return <div ref={box} className="bodymap-box" />;
}

// ----- 2D: the same figure drawn flat, front and back -------------------------------------

interface Flat {
  limbs: { a: [number, number]; b: [number, number]; w: number }[];
  torso: string;
  head: [number, number];
  front: { m: Muscle; x: number; y: number; rx: number; ry: number; tilt: number }[];
  back: { m: Muscle; x: number; y: number; rx: number; ry: number; tilt: number }[];
}

let flat: Flat | null = null;
/** Project the body once: x across, y down; the front view is mirrored (the figure faces you). */
function flatBody(): Flat {
  if (flat) return flat;
  const j = fk(BODY_POSE);
  const Y = (y: number) => 1.86 - y;
  const limbs = BONES.filter((b) => b.part !== 'torso').map((b) => ({ a: [j[b.a][0], Y(j[b.a][1])] as [number, number], b: [j[b.b][0], Y(j[b.b][1])] as [number, number], w: (b.r + (b.r2 ?? b.r)) * 0.92 }));
  const pts = [...TORSO.map(([y, w]) => `${w.toFixed(3)},${Y(y).toFixed(3)}`), ...[...TORSO].reverse().map(([y, w]) => `${(-w).toFixed(3)},${Y(y).toFixed(3)}`)];
  const shapes = bodyShapes();
  const front = shapes.filter((s) => s.at[2] > -0.005).map((s) => ({ m: s.muscle, x: s.at[0], y: Y(s.at[1]), rx: s.r[0], ry: s.r[1], tilt: s.tilt }));
  const back = shapes.filter((s) => s.at[2] < 0.005).map((s) => ({ m: s.muscle, x: s.at[0], y: Y(s.at[1]), rx: s.r[0], ry: s.r[1], tilt: s.tilt }));
  return (flat = { limbs, torso: pts.join(' '), head: [j.head[0], Y(j.head[1])], front, back });
}

function Body2D({ fill, body, onPick, pick }: { fill: Record<Muscle, string>; body: string; onPick: (m: Muscle | null) => void; pick: Muscle | null }) {
  const f = useMemo(flatBody, []);
  const view = (side: 'front' | 'back', dx: number) => {
    const mirror = side === 'front' ? -1 : 1; // from the front, the figure's left is on your right
    return (
      <g transform={`translate(${dx} 0) scale(${mirror} 1)`}>
        {f.limbs.map((l, i) => (
          <line key={i} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke={body} strokeWidth={l.w} strokeLinecap="round" />
        ))}
        <polygon points={f.torso} fill={body} />
        <ellipse cx={f.head[0]} cy={f.head[1]} rx={HEAD_R * 0.92} ry={HEAD_R * 1.1} fill={body} />
        {f[side].map((s, i) => (
          <ellipse
            key={i}
            cx={s.x}
            cy={s.y}
            rx={s.rx}
            ry={s.ry}
            transform={`rotate(${-s.tilt} ${s.x} ${s.y})`}
            fill={fill[s.m]}
            stroke={pick === s.m ? 'var(--ink)' : 'none'}
            strokeWidth={0.008}
            onClick={(e) => (e.stopPropagation(), onPick(pick === s.m ? null : s.m))}
            style={{ cursor: 'pointer' }}
          >
            <title>{MUSCLE_LABEL[s.m]}</title>
          </ellipse>
        ))}
      </g>
    );
  };
  return (
    <svg className="bodymap-svg" viewBox="-0.5 -0.02 2 1.92" role="img" aria-label="Body map, front and back" onClick={() => onPick(null)}>
      {view('front', 0)}
      {view('back', 1)}
      <text x={0} y={1.89} className="bodymap-cap">Front</text>
      <text x={1} y={1.89} className="bodymap-cap">Back</text>
    </svg>
  );
}
