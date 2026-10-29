import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { create } from 'zustand';
import { dataOf, useStore } from '../lib/store';
import { computeGame } from '../lib/game';
import { todayKey } from '../lib/dates';

// ----- Icons (inline stroke SVG, inherit colour) -------------------------------

const paths: Record<string, ReactNode> = {
  home: <path d="M4 11l8-6 8 6v8H4z" />,
  train: <path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  flame: <path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z" />,
  spark: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  user: <><circle cx="12" cy="9" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></>,
  play: <path d="M8 5v14l11-7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  refresh: <><path d="M20 11a8 8 0 00-14-4M4 4v4h4" /><path d="M4 13a8 8 0 0014 4M20 20v-4h-4" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  out: <path d="M7 17L17 7M9 7h8v8" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  send: <path d="M5 12h14M13 6l6 6-6 6" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  medal: <><circle cx="12" cy="14" r="6" /><path d="M8 3l4 5 4-5" /></>,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />,
};

export function Icon({ name, size = 22, stroke = 2, fill = false }: { name: keyof typeof paths | string; size?: number; stroke?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ----- Bits ----------------------------------------------------------------------

export function Bar({ value, max, color = 'var(--acc)', height = 8, label }: { value: number; max: number; color?: string; height?: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar" style={{ height }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** A progress ring with content in the middle. */
export function Ring({ size = 132, width = 12, frac, color = 'var(--acc)', track = 'var(--track)', children }: { size?: number; width?: number; frac: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={width} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(1, frac)) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .4s ease' }} />
      </svg>
      <div>{children}</div>
    </div>
  );
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

/** − / + around a number you can also type. */
export function Stepper({ value, onChange, step = 1, min = 0, max = 999, label, unit }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string; unit?: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 2) / 2)));
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
  }, [value]);
  return (
    <div className="row" style={{ background: 'var(--s2)', borderRadius: 999, padding: 5, justifyContent: 'space-between' }}>
      <button className="btn sm icon" style={{ background: 'var(--s3)', minHeight: 44, width: 44 }} aria-label={`Less ${label}`} onClick={() => set(value - step)}>
        <Icon name="minus" />
      </button>
      <span className="row" style={{ gap: 4, justifyContent: 'center' }}>
        <input
          className="num"
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const t = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
            setText(t);
            const v = parseFloat(t);
            if (v >= 0) set(v);
          }}
          onBlur={() => setText(String(value))}
          style={{ width: '3.2ch', textAlign: 'center', fontSize: 26, background: 'transparent', border: 0, color: 'var(--ink)' }}
        />
        {unit && <span className="mut small bold">{unit}</span>}
      </span>
      <button className="btn sm icon" style={{ background: 'var(--s3)', minHeight: 44, width: 44 }} aria-label={`More ${label}`} onClick={() => set(value + step)}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

// ----- Toast ---------------------------------------------------------------------

interface ToastAction {
  label: string;
  run: () => void;
}

export const useToast = create<{ msg: string | null; action: ToastAction | null; n: number; show: (msg: string, action?: ToastAction) => void }>((set) => ({
  msg: null,
  action: null,
  n: 0,
  show: (msg, action) => set((s) => ({ msg, action: action ?? null, n: s.n + 1 })),
}));
/** A short message; with `action` (like Undo) it stays a little longer and shows a button. */
export const toast = (msg: string, action?: ToastAction) => useToast.getState().show(msg, action);

export function Toast() {
  const { msg, action, n } = useToast();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!msg) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), action ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [msg, n]);
  if (!shown || !msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={n}>
      {msg}
      {action && (
        <button onClick={() => (action.run(), setShown(false))} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', fontWeight: 800, textDecoration: 'underline' }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// ----- Hooks ---------------------------------------------------------------------

/** Today's date key, refreshed each minute so the app rolls over at midnight. */
export function useToday(): string {
  const [k, setK] = useState(todayKey);
  useEffect(() => {
    const t = setInterval(() => setK(todayKey()), 60_000);
    return () => clearInterval(t);
  }, []);
  return k;
}

/** The current time, ticking every `ms`. */
export function useNow(ms = 1000): number {
  const [n, setN] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

export function useGame() {
  const today = useToday();
  const sessions = useStore((s) => s.sessions);
  const nights = useStore((s) => s.nights);
  const settings = useStore((s) => s.settings);
  return useMemo(() => computeGame(dataOf({ ...useStore.getState(), sessions, nights, settings }), today), [sessions, nights, settings, today]);
}

/** Minimal hash router: #/today, #/train?tab=plan, ... */
export function useRoute(): { path: string; params: URLSearchParams } {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => window.location.hash,
  );
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  return { path: path || 'today', params: new URLSearchParams(query) };
}

export const go = (to: string) => {
  window.location.hash = `/${to}`;
};

/** Page header: small line above a big title, with something on the right. */
export function Head({ over, title, right }: { over?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="head">
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        {over && <span className="mut small">{over}</span>}
        <h1 className="title">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export const ProfileLink = () => {
  const name = useStore((s) => s.profile.name);
  return (
    <a href="#/profile" aria-label="Profile and settings" className="btn icon" style={{ background: 'var(--s2)', flex: 'none' }}>
      <span className="bold">{name.slice(0, 1).toUpperCase() || 'Me'}</span>
    </a>
  );
};

/** Opens the phone's share sheet, or copies to the clipboard where there isn't one. */
export async function shareText(text: string) {
  try {
    if (navigator.share) return void (await navigator.share({ text }));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Couldn’t share from here');
  }
}
