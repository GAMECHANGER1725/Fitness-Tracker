// Hooks that join the store, Fuel Log and the derived numbers the pages share.

import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { useFuel } from '../lib/sync';
import { readiness } from '../lib/readiness';
import { weightOf } from '../lib/fuel';
import { useToday } from './ui';

export const useFuelData = () => useFuel((s) => s.data);

export function useReadiness() {
  const today = useToday();
  const night = useStore((s) => s.nights[today]);
  const goalH = useStore((s) => s.settings.sleepGoalH);
  const sessions = useStore((s) => s.sessions);
  const fuel = useFuelData();
  return useMemo(() => readiness({ today, night, goalH, fuel, targets: fuel?.targets ?? null, sessions }), [today, night, goalH, fuel, sessions]);
}

export function useWeight() {
  const fuel = useFuelData();
  const own = useStore((s) => s.profile.weightKg);
  return weightOf(fuel, own);
}
