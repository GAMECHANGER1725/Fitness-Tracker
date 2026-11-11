// Small inline-SVG charts (no library). They measure their own width, so text stays the same size on any screen.

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { daysBetween, fmtDate } from '../lib/dates';
import './charts.css';

export interface ChartPoint {
  date: string;
  v: number;
}

export interface ChartSeries {
  name: string;
  /** Any CSS colour, e.g. "var(--acc)". */
  color: string;
  points: ChartPoint[];
}

/** One arm measurement day (the shape of measures.Gap). */
export interface ChartGap {
  date: string;
  left: number;
  right: number;
  /** Right minus left, cm. */
  gap: number;
}

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(326);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => el.clientWidth > 0 && setW(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const round = (v: number) => +v.toFixed(6);

/** A padded range and 3–5 round tick values for it. */
export function scaleFor(values: number[], yPad = 0.15): { lo: number; hi: number; ticks: number[] } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max) * 0.1, 1);
  let lo = min - span * yPad;
  const hi = max + span * yPad;
  if (min >= 0 && lo < 0) lo = 0;
  const raw = (hi - lo) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  let a = Math.floor(lo / step) * step;
  let b = Math.ceil(hi / step) * step;
  if (Math.round((b - a) / step) > 4) {
    step *= 2;
    a = Math.floor(lo / step) * step;
    b = Math.ceil(hi / step) * step;
  }
  const ticks: number[] = [];
  for (let t = a; t <= b + step / 1000; t += step) ticks.push(round(t));
  return { lo: round(a), hi: round(b), ticks };
}

const textW = (s: string, px = 6.4) => s.length * px;

/**
 * Lines over time. Tap or drag to read a point; arrow keys work too.
 * `format` writes a value with its unit ("60.2 kg"); `tickFormat` is for the axis (defaults to `format`).
 */
export function LineChart({ series, format, tickFormat = format, height = 170, yPad = 0.15, label }: { series: ChartSeries[]; format: (v: number) => string; tickFormat?: (v: number) => string; height?: number; yPad?: number; label?: string }) {
  const [ref, W] = useWidth();
  const [pick, setPick] = useState<string | null>(null);
  const live = series.map((s) => ({ ...s, points: [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1)) })).filter((s) => s.points.length);
  const all = live.flatMap((s) => s.points);
  const dates = [...new Set(all.map((p) => p.date))].sort();
  const name = label ?? live.map((s) => s.name).join(' and ');

  if (!all.length)
    return (
      <div className="chart" ref={ref}>
        <div className="empty" role="img" aria-label={`${name || 'Chart'}: nothing logged yet`}>Nothing logged yet.</div>
      </div>
    );

  const summary = live
    .map((s) => {
      const a = s.points[0];
      const z = s.points.at(-1)!;
      return s.points.length > 1 ? `${s.name} went from ${format(a.v)} on ${fmtDate(a.date)} to ${format(z.v)} on ${fmtDate(z.date)}` : `${s.name} was ${format(a.v)} on ${fmtDate(a.date)}`;
    })
    .join('; ');

  // One day of data: a dot and a nudge, no axes.
  if (dates.length === 1) {
    const h = 96;
    return (
      <div className="chart" ref={ref}>
        <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`${label ? `${label}: ` : ''}${summary}. Log another to see a trend.`}>
          <line className="chart-grid" x1={0} x2={W} y1={52} y2={52} />
          {live.map((s, i) => {
            const x = W / 2 + (i - (live.length - 1) / 2) * 96;
            return (
              <g key={s.name}>
                <circle cx={x} cy={52} r={5.5} fill={s.color} stroke="var(--s1)" strokeWidth={2} />
                <text className="chart-end" x={x} y={34} textAnchor="middle" fill={s.color}>
                  {live.length > 1 ? `${s.name} ` : ''}
                  {format(s.points[0].v)}
                </text>
              </g>
            );
          })}
          <text className="chart-tick" x={W / 2} y={72} textAnchor="middle">{fmtDate(dates[0])}</text>
          <text className="chart-note" x={W / 2} y={90} textAnchor="middle">Log another to see a trend</text>
        </svg>
      </div>
    );
  }

  const { lo, hi, ticks } = scaleFor(all.map((p) => p.v), yPad);
  const d0 = dates[0];
  const days = daysBetween(d0, dates.at(-1)!) || 1;
  const ends = live.map((s) => format(s.points.at(-1)!.v));
  const left = Math.max(...ticks.map((t) => textW(tickFormat(t), 6.2))) + 8;
  const right = Math.max(...ends.map((t) => textW(t, 6.9))) + 10;
  const top = 10;
  const bottom = 22;
  const pw = Math.max(40, W - left - right);
  const ph = height - top - bottom;
  const x = (date: string) => left + (daysBetween(d0, date) / days) * pw;
  const y = (v: number) => top + ph - ((v - lo) / (hi - lo)) * ph;

  // Labels at the line ends, pushed apart so two series never sit on top of each other.
  const labels = live
    .map((s, i) => {
      const p = s.points.at(-1)!;
      return { i, text: ends[i], color: s.color, px: x(p.date), py: y(p.v), atEdge: x(p.date) > left + pw * 0.85, ly: y(p.v) };
    })
    .sort((a, b) => a.py - b.py);
  const edge = labels.filter((l) => l.atEdge);
  for (let i = 1; i < edge.length; i++) if (edge[i].ly - edge[i - 1].ly < 14) edge[i].ly = edge[i - 1].ly + 14;
  const over = edge.length ? edge.at(-1)!.ly - (top + ph) : 0;
  if (over > 0) for (const l of edge) l.ly -= over;

  const nearest = (clientX: number, el: SVGSVGElement) => {
    const px = clientX - el.getBoundingClientRect().left;
    let bestDate = dates[0];
    for (const d of dates) if (Math.abs(x(d) - px) < Math.abs(x(bestDate) - px)) bestDate = d;
    return bestDate;
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === 'pointermove' && e.pointerType !== 'mouse' && e.buttons === 0) return;
    setPick(nearest(e.clientX, e.currentTarget));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const i = pick ? dates.indexOf(pick) : -1;
    if (e.key === 'ArrowRight') setPick(dates[Math.min(dates.length - 1, i + 1)]);
    else if (e.key === 'ArrowLeft') setPick(dates[Math.max(0, i < 0 ? dates.length - 1 : i - 1)]);
    else if (e.key === 'Escape') setPick(null);
    else return;
    e.preventDefault();
  };
  const picked = pick && dates.includes(pick) ? pick : null;

  return (
    <div className="chart" ref={ref}>
      <div className="chart-read" aria-live="polite">
        {picked ? (
          <>
            <b>{fmtDate(picked, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
            {live.map((s) => {
              const p = s.points.find((q) => q.date === picked);
              return p ? (
                <span key={s.name} className="chart-key">
                  <i style={{ background: s.color }} />
                  {live.length > 1 ? `${s.name} ` : ''}
                  <b>{format(p.v)}</b>
                </span>
              ) : null;
            })}
          </>
        ) : live.length > 1 ? (
          live.map((s) => (
            <span key={s.name} className="chart-key">
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))
        ) : (
          <span>Tap the chart to read a point</span>
        )}
      </div>
      <svg
        width={W}
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        tabIndex={0}
        aria-label={`${label ? `${label}: ` : ''}${summary}.`}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPick(null)}
        onKeyDown={onKey}
        onBlur={() => setPick(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={left} x2={left + pw} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={left - 6} y={y(t) + 4} textAnchor="end">{tickFormat(t)}</text>
          </g>
        ))}
        <text className="chart-tick" x={left} y={height - 5} textAnchor="start">{fmtDate(d0)}</text>
        <text className="chart-tick" x={left + pw} y={height - 5} textAnchor="end">{fmtDate(dates.at(-1)!)}</text>
        {picked && <line className="chart-guide" x1={x(picked)} x2={x(picked)} y1={top} y2={top + ph} />}
        {live.map((s) => (
          <g key={s.name}>
            {s.points.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} />}
            {s.points.map((p, i) => {
              const last = i === s.points.length - 1;
              const on = p.date === picked;
              return <circle key={p.date} cx={x(p.date)} cy={y(p.v)} r={on ? 6 : last ? 4.5 : 3} fill={s.color} stroke="var(--s1)" strokeWidth={on || last ? 2 : 1.5} />;
            })}
          </g>
        ))}
        {labels.map((l) =>
          l.atEdge ? (
            <text key={l.i} className="chart-end" x={left + pw + 8} y={l.ly + 4} fill={l.color}>{l.text}</text>
          ) : (
            <text key={l.i} className="chart-end" x={l.px} y={Math.max(top + 10, l.py - 9)} textAnchor="middle" fill={l.color}>{l.text}</text>
          ),
        )}
      </svg>
    </div>
  );
}

const cm = (v: number) => `${+Math.abs(v).toFixed(1)} cm`;

/**
 * Left arm against right arm, one column per measuring day: two dots joined by a bar. The bar's length is the gap,
 * so shorter bars to the right mean the gap is closing. With a long log it shows the first day and the latest 9,
 * so the start is always there to compare with.
 */
export function GapChart({ gaps, height = 170, leftColor = 'var(--acc)', rightColor = 'var(--pro)' }: { gaps: ChartGap[]; height?: number; leftColor?: string; rightColor?: string }) {
  const [ref, W] = useWidth();
  const sorted = [...gaps].sort((a, b) => (a.date < b.date ? -1 : 1));
  const shown = sorted.length > 10 ? [sorted[0], ...sorted.slice(-9)] : sorted;
  if (!shown.length)
    return (
      <div className="chart" ref={ref}>
        <div className="empty" role="img" aria-label="Arm gap: nothing logged yet">Measure both arms to see the gap.</div>
      </div>
    );
  const first = shown[0];
  const last = shown.at(-1)!;
  // A tight scale in half or whole centimetres, so the bars are as long as the space allows.
  const vals = shown.flatMap((g) => [g.left, g.right]);
  const step = Math.max(...vals) - Math.min(...vals) <= 2 ? 0.5 : 1;
  const lo = Math.floor((Math.min(...vals) - 0.05) / step) * step;
  const hi = Math.max(lo + step * 2, Math.ceil((Math.max(...vals) + 0.05) / step) * step);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 0.001; t += hi - lo > step * 5 ? step * 2 : step) ticks.push(round(t));
  const left = Math.max(...ticks.map((t) => textW(String(t), 6.2))) + 8;
  const top = 20;
  const bottom = 22;
  const pw = W - left - 8;
  const ph = height - top - bottom;
  const col = pw / shown.length;
  const x = (i: number) => left + col * (i + 0.5);
  const y = (v: number) => top + ph - ((v - lo) / (hi - lo)) * ph;
  const bar = Math.min(8, Math.max(4, col * 0.25));
  const summary =
    shown.length > 1
      ? `Arm gap went from ${cm(first.gap)} on ${fmtDate(first.date)} to ${cm(last.gap)} on ${fmtDate(last.date)}. Left ${cm(last.left)}, right ${cm(last.right)}.`
      : `Arm gap was ${cm(last.gap)} on ${fmtDate(last.date)}. Left ${cm(last.left)}, right ${cm(last.right)}. Log another to see a trend.`;

  return (
    <div className="chart" ref={ref}>
      <div className="chart-read">
        <span>
          Gap now <b>{cm(last.gap)}</b>
          {shown.length > 1 && <> · was {cm(first.gap)} on {fmtDate(first.date)}</>}
        </span>
      </div>
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={left} x2={left + pw} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={left - 6} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {shown.map((g, i) => {
          const isLast = i === shown.length - 1;
          const yTop = Math.min(y(g.left), y(g.right));
          const yBot = Math.max(y(g.left), y(g.right));
          const showGap = isLast || i === 0 || col >= 26;
          return (
            <g key={g.date}>
              <line x1={x(i)} x2={x(i)} y1={yTop} y2={yBot} stroke={isLast ? 'var(--ink)' : 'var(--line2)'} strokeWidth={bar} strokeLinecap="round" />
              <circle cx={x(i)} cy={y(g.right)} r={isLast ? 5 : 4} fill={rightColor} stroke="var(--s1)" strokeWidth={1.5} />
              <circle cx={x(i)} cy={y(g.left)} r={isLast ? 5 : 4} fill={leftColor} stroke="var(--s1)" strokeWidth={1.5} />
              {showGap && (
                <text className={isLast ? 'chart-end' : 'chart-tick'} x={x(i)} y={yTop - 9} textAnchor="middle" fill={isLast ? 'var(--ink)' : undefined}>
                  {Math.abs(g.gap).toFixed(1)}
                </text>
              )}
            </g>
          );
        })}
        <text className="chart-tick" x={x(0)} y={height - 5} textAnchor={shown.length > 1 ? 'start' : 'middle'} dx={shown.length > 1 ? -col * 0.3 : 0}>{fmtDate(first.date)}</text>
        {shown.length > 1 && <text className="chart-tick" x={left + pw} y={height - 5} textAnchor="end">{fmtDate(last.date)}</text>}
      </svg>
      <div className="chart-read" style={{ marginTop: 6, marginBottom: 0 }} aria-hidden="true">
        <span className="chart-key"><i style={{ background: leftColor }} />Left</span>
        <span className="chart-key"><i style={{ background: rightColor }} />Right</span>
        <span className="chart-key"><i className="bar" />Bar = the gap, cm</span>
      </div>
    </div>
  );
}

/** A tiny trend line for a tile or a row. Decorative unless you pass `label`. */
export function Spark({ points, color = 'var(--acc)', width = 64, height = 26, label }: { points: ChartPoint[]; color?: string; width?: number; height?: number; label?: string }) {
  const pts = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
  if (!pts.length) return <svg className="spark" width={width} height={height} {...a11y} />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const days = daysBetween(pts[0].date, pts.at(-1)!.date) || 1;
  const pad = 4;
  const x = (p: ChartPoint) => (pts.length === 1 ? width - pad : pad + (daysBetween(pts[0].date, p.date) / days) * (width - pad * 2));
  const y = (p: ChartPoint) => (max === min ? height / 2 : height - pad - ((p.v - min) / (max - min)) * (height - pad * 2));
  const end = pts.at(-1)!;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} {...a11y}>
      {pts.length > 1 && <polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.75} points={pts.map((p) => `${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ')} />}
      <circle cx={x(end)} cy={y(end)} r={3} fill={color} />
    </svg>
  );
}
