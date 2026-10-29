// Workout player options, per device (localStorage `fitness-player`, not synced): a beep when rest ends,
// keeping the screen on during a workout, and moving on to the next exercise by itself.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PlayerPrefs {
  beep: boolean;
  awake: boolean;
  /** Move to the next exercise when the rest after its last set ends. */
  auto: boolean;
  set: (p: Partial<Pick<PlayerPrefs, 'beep' | 'awake' | 'auto'>>) => void;
}

export const usePlayer = create<PlayerPrefs>()(
  persist((set) => ({ beep: true, awake: true, auto: false, set: (p) => set(p) }), { name: 'fitness-player', partialize: ({ beep, awake, auto }) => ({ beep, awake, auto }) }),
);

let ctx: AudioContext | null = null;

/** Call from a tap (e.g. Log set) so the browser lets the later beep play. */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Two short tones. Silent if audio was never primed or isn't allowed. */
export function beep() {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  for (const [at, hz] of [[0, 880], [0.22, 1175]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.3, t + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.18);
    o.connect(g).connect(ctx.destination);
    o.start(t + at);
    o.stop(t + at + 0.2);
  }
}

/** Keeps the screen on while `on`; the browser drops the lock when the tab is hidden, so it's taken again on return. */
export function holdWakeLock(on: boolean): () => void {
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
  if (!on || !wl) return () => {};
  let lock: { release: () => Promise<void> } | null = null;
  let dead = false;
  const take = () => {
    if (document.visibilityState !== 'visible') return;
    wl.request('screen')
      .then((l) => (dead ? void l.release() : (lock = l)))
      .catch(() => {});
  };
  take();
  document.addEventListener('visibilitychange', take);
  return () => {
    dead = true;
    document.removeEventListener('visibilitychange', take);
    void lock?.release().catch(() => {});
  };
}
