# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Fitness Tracker: a personal, mobile-first PWA (React 19 + Vite + zustand, TypeScript) for home workouts (bodyweight, a loaded backpack, a forearm trainer), waking at 6 am and sleep, with an AI coach. Sister app of Fuel Log (`GAMECHANGER1725/fuel-log`), which it reads for food. No backend: data lives in localStorage; optional sync goes through a private GitHub Gist. Deployed to GitHub Pages at `/Fitness-Tracker/`, the same origin as Fuel Log (`/fuel-log/`).

## Commands

```bash
npm run dev          # http://localhost:5173
npm test             # vitest run (tests/**/*.test.ts, pure logic only, no DOM)
npx vitest run tests/sleep.test.ts -t "Samsung"   # one file / one test by name
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + vite build
npm run preview      # production build at http://localhost:4173/Fitness-Tracker/
```

There is no linter. CI (`.github/workflows/deploy.yml`) runs `npm test` then `npm run build` on every push to `main` and publishes to Pages, so a push to `main` is a deploy.

## Architecture

**Single store, local-first.** `src/lib/store.ts` is one zustand store persisted as `fitness-v1`, holding `AppData` (`types.ts`). `dataOf()` strips the actions. Anything from storage, backups or the gist goes through `normalize()` in `backup.ts`; `DEFAULT_DATA` has the owner's stats built in (no onboarding).

**Training.** `exercises.ts` is the library: each exercise sits on a ladder (`ladder`, `step`) and lists its equipment (`bw`, `pack`, `grip`). `program.ts` holds the default upper/lower week and `slotsFor` (deload and easy-day set cuts). `progress.ts` is the pure rule set:
- `progressSlot`/`applySession` (double progression: +2 kg for backpack moves, harder variation for bodyweight ones, then the rep range; step back after two short sessions);
- `records`;
- `guardProgram` (the limits on any AI or proposed change);
- `diffPrograms`;
- `deloadDue`.

Finishing a workout (`finishWorkout` in the store) runs progression and logs a `ProgramChange` (with `before`, so it can be undone).

**Sleep.** `sleep.ts`:
- a `Night` is keyed by the morning you woke up (`nightKey`: bed + 12 h);
- `durationMin`, `wakeStreak`, `sleepStats`;
- `guardBedtime` (±30 min a week, inside 8–10 h before the wake target);
- the Samsung Health CSV importer (`samsungNights`, `mergeImported`), which matches columns by name suffix.

**Fuel Log link.** `fuel.ts` reads Fuel Log read-only:
- its zustand save `fuel-log-v3` on this device (`parseFuelStore`, plus `fuelAi` for its AI keys and `fuelToken` for its gist token);
- its gist file `fuel-log-sync.json` (`parseFuelGist`);
- `mergeFuel` joins the two by entry id.

`sync.ts` keeps the result in `useFuel` (`refreshFuel`: local every time, gist at most every 5 min). If Fuel Log's storage format changes, update `fuel.ts` and its tests.

**Readiness.** `readiness.ts` scores 0–100 from last night, yesterday's food and recent load. It sets the Easy band, which cuts sets by about 25%.

**AI coach.** `ai.ts` is Fuel Log's provider code without the food-photo parts (DeepSeek via TokenHarbor plus a Gemini fallback, `complete`, `jsonRule`, `parseJson`). `coach.ts`:
- `snapshot()` covers training, sleep, Fuel and readiness;
- prompts and schemas for the weekly check-in (program + sleep), morning briefing, tonight's plan, post-workout, swap and chat;
- pure parsers (`parseReview`, `parseTonight`, `parseSwap`, …) that route everything through the guards;
- the `useCoach` store (per device);
- `currentAi()` uses this app's own keys if set, else Fuel Log's (`aiConfig`).

**Sync.** `sync.ts` is adapted from Fuel Log's: its own gist file `fitness-tracker-sync.json`, and it auto-connects once with Fuel Log's token if present. `syncdoc.ts` holds the merge rules:
- sessions: union by id, newer `upd` wins;
- nights: per date, newer `m` wins;
- deletions: in `tomb`, session ids and `night:<date>`;
- profile, settings, program and log: newest `mod` wins.

Per-device fields (AI keys and models, `aiFirst`, theme, `active` workout, `seen`) stay out of the gist: `LOCAL_ONLY` in `store.ts` and `toDoc`/`applyDoc` encode this. Docs are key-sorted so equal docs compare equal.

**Reminders.** `reminders.ts` handles wind-down, workout and wake nudges via the service worker (`public/sw-extra.js` opens the tab named in `data.path`). They only fire while the app is alive. The on/off flag is per device.

**UI.** A hash router (`useRoute` in `components/ui.tsx`) serves Today, Train (tabs Plan/History/Exercises/Badges), Workout (player), Sleep, Fuel, Coach and Profile, plus `Lock`. Lock uses the same passcode hash as Fuel Log, and an unlocked Fuel Log on the same phone counts. `components/data.ts` has the shared hooks (`useReadiness`, `useFuelData`, `useWeight`).

**Look.** `styles.css` comes from the Claude Design canvas "Fuel Log + Fitness Tracker redesign". The "Shared base" section is identical in Fuel Log's `styles.css`, so keep the two in step. Tokens: mint `--acc` for training, indigo `--sleep*` for sleep, ember `--fuel*` for anything from Fuel Log.

## Conventions

- Dates are local `yyyy-MM-dd` strings (`dates.ts`, copied from Fuel Log), parsed at noon. Use those helpers, not `toISOString()`.
- Display locale is `en-AU`. The user is 15, so programming and coach advice stay conservative and every AI change goes through a guard in code.
- `ponytail:` comments mark deliberate simplifications and their known ceiling.
- Tests are logic-only (`tests/*.test.ts`). Keep new logic in `src/lib/` as pure functions. Run them in a non-UTC zone too (`TZ=Australia/Sydney npm test`).
