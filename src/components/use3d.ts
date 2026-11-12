// 3D or the flat 2D fallback? 3D only when the phone can do it well and nobody asked for less motion.
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';

export const SLOW_KEY = 'fitness-3d-slow';

let gl: boolean | null = null;
/** Can this browser make a WebGL context? Checked once. */
export function webglOk(): boolean {
  if (gl != null) return gl;
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') ?? c.getContext('webgl');
    gl = !!ctx;
    (ctx as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    gl = false;
  }
  return gl;
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const flaggedSlow = () => {
  try {
    return localStorage.getItem(SLOW_KEY) === '1';
  } catch {
    return false;
  }
};

/** Remember that 3D was too slow here, so next time starts in 2D. Cleared by choosing 3D or Auto in Profile. */
export function markSlow() {
  try {
    localStorage.setItem(SLOW_KEY, '1');
  } catch {
    /* storage blocked: 2D for this session only */
  }
  window.dispatchEvent(new Event('fitness-3d'));
}

function decide(setting: 'auto' | 'on' | 'off'): boolean {
  if (setting === 'off' || !webglOk()) return false;
  if (setting === 'on') return true;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return !reducedMotion() && !flaggedSlow() && !(nav.deviceMemory != null && nav.deviceMemory <= 2) && !nav.connection?.saveData;
}

/** True when the 3D views should be used on this device right now. */
export function use3d(): boolean {
  const setting = useStore((s) => s.settings.view3d);
  const [, bump] = useState(0);
  useEffect(() => {
    const again = () => bump((n) => n + 1);
    const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    mq?.addEventListener?.('change', again);
    window.addEventListener('fitness-3d', again);
    return () => {
      mq?.removeEventListener?.('change', again);
      window.removeEventListener('fitness-3d', again);
    };
  }, []);
  return decide(setting);
}

/** Colours from the CSS tokens, re-read when the theme changes. */
export function useTokens(): (name: string) => string {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    const mo = new MutationObserver(again);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener?.('change', again);
    return () => {
      mo.disconnect();
      mq.removeEventListener?.('change', again);
    };
  }, []);
  void tick;
  const cs = getComputedStyle(document.documentElement);
  return (name) => cs.getPropertyValue(name).trim() || '#888888';
}

/** Blend two hex colours: t = 0 gives a, 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const x = h.replace('#', '');
    const f = x.length === 3 ? x.split('').map((c) => c + c).join('') : x.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
  };
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
