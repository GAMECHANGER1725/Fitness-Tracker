// Passcode lock, same code and hash as Fuel Log (copied from its auth.ts). Keeps casual snoopers out.
// ponytail: client-side only, so it isn't real security (a 4-digit code in a public repo can be
// brute-forced). Only the salted hash is stored here so the code isn't readable at a glance.

import { create } from 'zustand';

const HASH = '355cc6f9a4c55dac49b483d943adf5baba22beb448deb5b455e5a25308610671'; // sha256("fuel-log:" + code)
const KEY = 'fitness-unlocked';
/** Signed in to Fuel Log on this phone counts too (same passcode). */
const FUEL_KEY = 'fuel-log-unlocked';
export const CODE_LENGTH = 4;

export async function hashCode(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fuel-log:${code}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const checkPasscode = async (code: string) => (await hashCode(code)) === HASH;

const read = () => {
  try {
    return localStorage.getItem(KEY) === '1' || (localStorage.getItem(KEY) === null && localStorage.getItem(FUEL_KEY) === '1');
  } catch {
    return false;
  }
};
const write = (on: boolean) => {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.setItem(KEY, '0');
  } catch {
    /* storage blocked: stays signed in for this session only */
  }
};

/** Signed in stays on across restarts until "Log out". */
export const useAuth = create<{ unlocked: boolean; unlock: (code: string) => Promise<boolean>; lock: () => void }>((set) => ({
  unlocked: read(),
  unlock: async (code) => {
    const ok = await checkPasscode(code);
    if (ok) {
      write(true);
      set({ unlocked: true });
    }
    return ok;
  },
  lock: () => {
    write(false);
    set({ unlocked: false });
  },
}));
