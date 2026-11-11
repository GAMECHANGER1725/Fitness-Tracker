// v1 (home workouts, used from 27 Oct 2026) → v2 (gym). Nothing logged is dropped:
//  - sessions, sets, nights, settings, badges and tombstones are carried over untouched;
//  - the home exercise ids stay in the library (exercises.ts, `home`), so old workouts keep their names,
//    bests and "last time";
//  - the home programme and its change log are archived in `home`;
//  - a fresh gym programme replaces it and onboarding runs once.
// Works on raw, unvalidated data (storage, a backup file or the gist); backup.normalize() validates after.

import { DEFAULT_PROGRAM } from './program';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});

/** localStorage key of the untouched v1 save, written once before the first v2 write. */
export const HOME_BACKUP_KEY = 'fitness-v1-home-backup';

/** Is this raw save from before the gym rebuild? */
export const isV1 = (v: unknown): boolean => {
  const d = obj(v);
  return d.v === 1 || (d.v == null && ('sessions' in d || 'program' in d || 'nights' in d));
};

/** Turn a raw v1 save into raw v2. Anything already v2 (or empty) is returned as is. */
export function migrate(v: unknown, now = Date.now()): unknown {
  if (!isV1(v)) return v;
  const d = obj(v);
  const hadPlan = d.program != null;
  return {
    ...d,
    v: 2,
    onboarded: false,
    // The numbers given for the gym start (11 Nov 2026): 14 years old, 60 kg. Onboarding shows both to confirm.
    profile: { ...obj(d.profile), age: 14, weightKg: 60 },
    // Gym sessions are in the morning; the home plan's 4:30 pm reminder would be wrong. Editable in onboarding.
    settings: { ...obj(d.settings), workoutTime: '06:30' },
    measures: {},
    home: hadPlan ? { program: d.program, programLog: Array.isArray(d.programLog) ? d.programLog : [], at: now } : null,
    program: DEFAULT_PROGRAM,
    programLog: [],
    // A home workout left half done can't be resumed against the gym plan.
    active: null,
    mod: Math.max(typeof d.mod === 'number' ? d.mod : 0, now),
  };
}

/** Keep the untouched v1 save once, so the migration can always be checked or redone. */
export function keepHomeBackup(storage: Pick<Storage, 'getItem' | 'setItem'>, storeKey: string): boolean {
  try {
    const raw = storage.getItem(storeKey);
    if (!raw || storage.getItem(HOME_BACKUP_KEY)) return false;
    const state = obj(obj(JSON.parse(raw)).state);
    if (!isV1(state)) return false;
    storage.setItem(HOME_BACKUP_KEY, raw);
    return true;
  } catch {
    return false;
  }
}
