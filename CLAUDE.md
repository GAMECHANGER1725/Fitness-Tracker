# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Fitness Tracker: a personal, mobile-first PWA (React 19 + Vite + zustand, TypeScript) for gym training (a beginner plan on machines, dumbbells and cables), waking at 6 am and sleep, with an AI coach. Sister app of Fuel Log (`GAMECHANGER1725/fuel-log`), which it reads for food. No backend: data lives in localStorage; optional sync goes through a private GitHub Gist. Deployed to GitHub Pages at `/Fitness-Tracker/`, the same origin as Fuel Log (`/fuel-log/`). It was a home-workout tracker until 11 Nov 2026; `PLAN.md` records the gym rebuild.

## Commands

```bash
npm run dev          # http://localhost:5173
npm test             # vitest run (tests/**/*.test.ts, pure logic only, no DOM)
npx vitest run tests/progress.test.ts -t "ladder"   # one file / one test by name
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + vite build
npm run preview      # production build at http://localhost:4173/Fitness-Tracker/
node scripts/e2e.mjs http://localhost:5173       # browser walkthrough: migration, onboarding, a logged session
node scripts/perf-3d.mjs http://localhost:5173   # 3D budget check at phone size with 4× CPU throttle
```

There is no linter. CI (`.github/workflows/deploy.yml`) runs `npm test` then `npm run build` on every push to `main` and publishes to Pages, so a push to `main` is a deploy. `#/lab` is a dev page with every 3D view and its 2D fallback.

## Architecture

**Single store, local-first.** `src/lib/store.ts` is one zustand store persisted as `fitness-v1` (the key kept its name; persist version 2), holding `AppData` v2 (`types.ts`). `dataOf()` strips the actions. Anything from storage, backups or the gist goes through `normalize()` in `backup.ts`, which first runs `migrate()` (`migrate.ts`): a v1 home save keeps every session, night and setting, gets its home plan archived in `home`, a fresh gym plan and `onboarded: false`. Don't remove the `home: true` exercises from the library: old sessions point at them. `App.tsx` shows `Onboarding` until `onboarded`.

**Training.**
- `exercises.ts`: the library. Each exercise has a `load` kind (`db`, `machine`, `cable`, `assist`, `pack`, `none`), a cautious `startKg`, `primary`/`secondary` muscles, cues and mistakes, an optional form `demo`, and a ladder (`ladder`, `step`). `match` marks one-arm work logged per arm. `home` marks the old backpack moves (history only; `usable()` hides them).
- `program.ts`: `buildProgram(baselines, gymDays, start)` (upper/lower on 4 days, full body on 2–3, never more than 4), the ladder starting steps, `phaseOf` (intro week, build 1–4, deload, repeating from `program.start`) and `slotsFor` (intro, deload and easy-day versions of a day).
- `progress.ts`: the engine. `targetFor` gives today's weight and per-set reps from history; `progressSlot`/`applySession` run double progression after a session (smallest jump from `stepKg`, ladders with `MASTER`/`ENTRY` ranges, less help on the assisted pull-up, the plan follows the weight lifted, step back after two short sessions); `records`; `guardProgram` (the limits on any AI or proposed change); `diffPrograms`.
- `muscles.ts`: hard sets per muscle for a session, day or week (the body map).
- `measures.ts`: benchmarks and measurements (`AppData.measures`, one entry per date): series, bests, the arm gap, what's due (weekly, 4-weekly).
- `guide.ts`: warm-up, cool-down, rest-day, eating, sleep and safety text.

Finishing a workout (`finishWorkout` in the store) runs progression and logs a `ProgramChange` (with `before`, so it can be undone). Nothing progresses in a deload week.

**3D.** Everything that imports `three` lives in `src/three/` and is reached only by dynamic import from `components/Body.tsx` (`BodyMap`) and `components/FormDemo.tsx`. `rig.ts` (pure forward kinematics) and `demos.ts` (keyframes and phases) drive both the 3D mannequin and the 2D SVG fallback. `use3d.ts` decides 3D or 2D (setting `view3d`, WebGL, reduced motion, a measured slow flag). The workout logger must never import 3D code directly: it opens `ExerciseInfo` lazily. If 3D and the logger conflict, the logger wins.

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
- measures: per date, newer `m` wins;
- deletions: in `tomb`, session ids, `night:<date>` and `measure:<date>`;
- profile, settings, program, log, `onboarded` and `home`: newest `mod` wins. The doc is `v: 2`; a v1 doc is migrated on read.

Per-device fields (AI keys and models, `aiFirst`, theme, `view3d`, `active` workout, `seen`) stay out of the gist: `LOCAL_ONLY` in `store.ts` and `toDoc`/`applyDoc` encode this. Docs are key-sorted so equal docs compare equal.

**Reminders.** `reminders.ts` handles wind-down, workout and wake nudges via the service worker (`public/sw-extra.js` opens the tab named in `data.path`). They only fire while the app is alive. The on/off flag is per device.

**UI.** A hash router (`useRoute` in `components/ui.tsx`) serves Today, Train (tabs Plan/Body/Moves/History/Guide), Workout (the logger), Progress, Sleep, Fuel (off the nav bar, linked from Today), Coach and Profile, plus `Lock`, `Onboarding` and the dev page `Lab3d`. Lock uses the same passcode hash as Fuel Log, and an unlocked Fuel Log on the same phone counts. `components/data.ts` has the shared hooks (`useReadiness`, `useFuelData`, `useWeight`).

**Look.** `styles.css` comes from the Claude Design canvas "Fuel Log + Fitness Tracker redesign". The "Shared base" section is identical in Fuel Log's `styles.css`, so keep the two in step. Charts and 3D views keep their CSS in `components/charts.css` and `components/body.css`. Tokens: mint `--acc` for training, indigo `--sleep*` for sleep, ember `--fuel*` for anything from Fuel Log.

## Conventions

- Dates are local `yyyy-MM-dd` strings (`dates.ts`, copied from Fuel Log), parsed at noon. Use those helpers, not `toISOString()`.
- Display locale is `en-AU`. The user is 14 and new to the gym, so programming and coach advice stay conservative: machines and dumbbells, 8–15 reps, 1–3 reps in reserve, no one-rep-max tests, no supplement or weight-cutting content, and every AI change goes through a guard in code.
- `ponytail:` comments mark deliberate simplifications and their known ceiling.
- Tests are logic-only (`tests/*.test.ts`). Keep new logic in `src/lib/` as pure functions. Run them in a non-UTC zone too (`TZ=Australia/Sydney npm test`).
