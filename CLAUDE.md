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

**Training.** `exercises.ts` is the library: each exercise sits on a ladder (`ladder`, `step`, with `easier`/`harder`) and lists its equipment (`bw`, `pack`, `grip`). `program.ts` holds the default upper/lower week, `slotsFor` (deload and easy-day set cuts), plan edits (`moveSlot`, `copyDay`, `deleteDay`), `nextPlanned` and `warmupFor`. `progress.ts` is the pure rule set:
- `progressSlot`/`applySession` (double progression: +2 kg for backpack moves, harder variation for bodyweight ones, then the rep range; step back after two short sessions);
- `records`;
- `guardProgram` (the limits on any AI or proposed change);
- `diffPrograms` (every kind of plan change must show up here, or `setProgram` drops it as "no change": sets, ranges, load, rest, order, names, the weekly schedule, added/deleted days, the lighter week);
- `deloadDue`;
- read-outs for the UI: `trendOf`, `vsLast`, `newRecords`, `sessionText`, `moveSession` (keeps clock times when a workout moves day).

Finishing a workout (`finishWorkout` in the store) runs progression and logs a `ProgramChange` (with `before`, so it can be undone).

**Sleep.** `sleep.ts`:
- a `Night` is keyed by the morning you woke up (`nightKey`: bed + 12 h);
- `durationMin`, `wakeStreak`, `sleepStats`;
- `guardBedtime` (±30 min a week, inside 8–10 h before the wake target);
- chart and Today helpers: `toBedtime`, `nightPos`, `pastAt`, `windDownEffect`;
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

`notes.ts` (`weekNotes`, `movesTrend`) gives Coach plain, rule-based notes that work without an AI key; `lastWeekReport` feeds the Monday-to-Wednesday recap card on Today.

**Sync.** `sync.ts` is adapted from Fuel Log's: its own gist file `fitness-tracker-sync.json`, and it auto-connects once with Fuel Log's token if present. `syncdoc.ts` holds the merge rules:
- sessions: union by id, newer `upd` wins;
- nights: per date, newer `m` wins;
- deletions: in `tomb`, session ids and `night:<date>`;
- profile, settings, program and log: newest `mod` wins.

Per-device fields (AI keys and models, `aiFirst`, theme, `active` workout, `seen`) stay out of the gist: `LOCAL_ONLY` in `store.ts` and `toDoc`/`applyDoc` encode this. Exercise notes (`profile.exNotes`), the wind-down steps (`profile.windDown`) and body measurements (`profile.measures`, `body.ts`) ride with the profile block; the ticks are on each night (`Night.done`). Other per-device prefs live outside the store in their own localStorage keys (`fitness-player`, `fitness-layout`, `fitness-sleep-span`, `fitness-news`, `fitness-recap`, `fitness-skip`, `fitness-feel`). Docs are key-sorted so equal docs compare equal.

**Reminders.** `reminders.ts` handles wind-down, workout and wake nudges via the service worker (`public/sw-extra.js` opens the tab named in `data.path`). They only fire while the app is alive. The master switch, each kind's switch and the wind-down lead (20/40/60 min) are per device in `fitness-reminders`.

**Per-device prefs outside the store.** `player.ts` (`fitness-player`: rest beep, vibration, wake lock, auto-advance), `layout.ts` (`fitness-layout`: hidden Today cards, accent, large text, start page (`startHash`, used in `main.tsx`), backup time and snooze, `backupDue`, quick night-note chips), `install.ts` (the install prompt). They're zustand stores or small localStorage helpers, never synced.

**UI.** A hash router (`useRoute` in `components/ui.tsx`) serves Today, Train (tabs Plan/History/Exercises/Badges), Workout (player), Sleep, Fuel, Coach and Profile, plus `Lock`. Lock uses the same passcode hash as Fuel Log, and an unlocked Fuel Log on the same phone counts. `components/data.ts` has the shared hooks (`useReadiness`, `useFuelData`, `useWeight`). `components/WhatsNew.tsx` opens once per device for each `NEWS_ID`; keep it to a handful of grouped points and bump the id when shipping something worth telling. Profile's cards are listed once in `SECTIONS`; `#/profile?open=<id>` (and Train's `?tab=moves&open=<exercise>`) open at a card, and `#/sleep?night=<date>` opens that night's sheet (`#/train?tab=history&past=1` opens *Log a workout I already did*; both drop the param once open), scrolling after App's scroll-to-top. `toast(msg, { label, run })` gives an Undo; prefer that to `confirm()` for anything reversible (a queued action toast is never covered by plain ones).

**Look.** `styles.css` comes from the Claude Design canvas "Fuel Log + Fitness Tracker redesign". The "Shared base" section is identical in Fuel Log's `styles.css`, so keep the two in step. Tokens: mint `--acc` for training (or the accent picked in Profile, via `data-accent`), indigo `--sleep*` for sleep, ember `--fuel*` for anything from Fuel Log. App-only overrides (accents, reduced motion, toast width, the Black theme's `data-black` surfaces on top of `data-theme="dark"`) go in the "Fitness only" section, not the shared base.

## Conventions

- Dates are local `yyyy-MM-dd` strings (`dates.ts`, copied from Fuel Log), parsed at noon. Use those helpers, not `toISOString()`.
- Display locale is `en-AU`. The user is 15, so programming and coach advice stay conservative and every AI change goes through a guard in code.
- `ponytail:` comments mark deliberate simplifications and their known ceiling.
- Tests are logic-only (`tests/*.test.ts`). Keep new logic in `src/lib/` as pure functions. Run them in a non-UTC zone too (`TZ=Australia/Sydney npm test`).
