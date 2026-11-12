# Gym rebuild plan

Branch: `gym-rebuild`. Nothing is pushed, merged or deployed until you say so.

## 1. What exists (kept)

- React 19 + Vite + zustand + TypeScript PWA, tests in vitest (logic only), deployed to GitHub Pages.
- One store in localStorage (`fitness-v1`), optional sync through a private gist, backup export/import.
- Home training: a bodyweight/backpack library on ladders, an upper/lower week, double progression.
- Sleep and wake tracking, Samsung Health import, readiness, the AI coach, reminders, the Fuel Log link.

**The stack and conventions stay.** Sleep, Fuel, Coach, sync, reminders and the lock screen keep working as they
do today. Fuel Log (`/home/user/fuel-log`) is not touched; the "Shared base" block of `styles.css` is not changed.

One new dependency: `three` (the 3D views). It is only ever loaded by a dynamic import.

## 2. Architecture

```
src/lib/            pure logic (tested)
  types.ts          AppData v2
  exercises.ts      gym library + the old home moves (kept so history still reads)
  muscles.ts        muscle groups, exercise → muscles, weekly volume per muscle
  program.ts        buildProgram() from onboarding answers, block phases (intro, build 1–4, deload)
  progress.ts       progression engine: targetFor() (today's weight and reps), progressSlot(), guards
  measures.ts       benchmarks, weekly weigh-in and arms, PRs, left/right gap, what's due
  migrate.ts        v1 (home) → v2 (gym), lossless
  backup.ts         normalize() for v2, export/import (v1 backups are migrated on import)
  guide.ts          warm-up, cool-down, rest days, sleep/food basics, safety text
  rig.ts            mannequin skeleton + forward kinematics (pure, shared by 3D and the 2D fallback)
  demos.ts          form demos: joint keyframes, phases, cues, common mistakes
src/three/          everything that imports three (lazy chunk)
src/components/     Body (3D or 2D), FormDemo (3D or 2D), charts (SVG)
src/pages/          Onboarding (new), Workout (new logger), Progress (new), Today, Train, Profile …
```

Navigation: Today · Train · Progress · Sleep · Coach. Fuel moves off the bar (five slots) and is opened from its
card on Today and from Progress. Train tabs: Plan · Body · Moves · History · Guide. Badges move to Progress.

## 3. Data model and migration

`AppData.v` goes 1 → 2. The localStorage key stays `fitness-v1` so the saved data is found; zustand's persist
version goes to 2.

New or changed:

| Field | What |
| --- | --- |
| `onboarded` | false after migration, so onboarding runs once |
| `profile.goal`, `profile.weakArm` | lean bulk / arms focus; which arm goes first |
| `settings.machineStepKg`, `settings.sessionMin` | smallest machine jump (default 5 kg), session length |
| `program.start` | first gym session; drives the block weeks |
| `Slot.loadKg` | now the working weight (per dumbbell, machine stack, or assistance) |
| `SetLog.rir`, `SetLog.repsR` | reps in reserve; right-arm reps for one-arm work (`reps` is the left/first side) |
| `measures` | one entry per date: weight, left/right arm, push-ups, plank, chin-ups, pull-ups |
| `home` | the old home programme and its change log, archived |

Migration (`migrate.ts`, run by `normalize()` for stored data, backups and the gist):

1. Every home session, set, night, setting and badge is kept as is. Old sets keep their `rpe`.
2. The home exercise ids stay in the library (flagged `home`), so History, bests and "last time" still work.
   Moves shared with the gym plan (push-up, incline push-up, plank, side plank, dead bug) keep their history.
3. The home programme and its change log move to `home` (read-only, shown in Profile).
4. A new gym programme is created; `onboarded = false`.
5. Before the first v2 write, the raw v1 save is copied to `fitness-v1-home-backup` in localStorage.
6. Sync: the gist doc goes to `v: 2`; v1 docs are read and migrated. A device still on the old build can't read a
   v2 doc (it shows a sync error until the PWA updates itself).

Tests: `tests/migrate.test.ts` (a realistic v1 save from 27 Oct → 11 Nov 2026 round-trips with nothing lost, is
idempotent, and works for backups and the gist).

## 4. Programme

For a 14-year-old first-timer: technique first, machines and dumbbells, 8–15 reps, 1–3 reps in reserve, no
maxing out, no barbell lifts in the default plan.

**Week (4 days, Mon/Tue/Thu/Fri, ~60 min):** two upper and two lower days so no area is trained hard two days
running. Across the week that's push, pull, legs and core roughly in balance, plus direct arm work on both
upper days. With 2 or 3 gym days the plan switches to two full-body days (A/B). 5+ days isn't offered.

| Day | Exercises (sets × reps) |
| --- | --- |
| Upper A (Mon) | Pull-up ladder step (chin-up negatives or chin-ups) 3 · Assisted pull-up 2×8–12 · Chest press machine 3×8–12 · Seated cable row 2×10–12 · Push-up ladder step 2×8–15 · One-arm DB curl 3×10–15 · Triceps pushdown 2×10–15 |
| Lower A (Tue) | Goblet squat 3×8–12 · Leg press 3×10–15 · DB Romanian deadlift 3×10–12 · Seated leg curl 2×10–15 · Calf raise 2×12–15 · Plank ladder step 3 · Dead bug 2×8–12 |
| Upper B (Thu) | Lat pulldown 3×10–12 · Shoulder press machine 3×8–12 · One-arm DB row 3×10–12 · Incline DB press 2×8–12 · One-arm cable curl 2×10–15 · Hammer curl 2×10–15 · Overhead rope extension 2×10–15 |
| Lower B (Fri) | Leg press 3×10–15 · DB split squat 2×8–12 · Back extension 2×10–15 · Leg extension 2×10–15 · Seated leg curl 2×10–15 · Calf raise 2×12–15 · Pallof press 2×8–12 · Side plank 2×20–40 s |

Weekly hard sets by pattern: push 14, pull 20, legs 17, hips and hamstrings 9, core 9 (69 in all, about 17 a
session). Pull is the biggest on purpose: it holds the pull-up work and the 7 direct biceps sets. Everything
sits at or under the guard's cap of 20 per pattern. The face pull stays in the library as a swap.

**Ladders (built from the baselines):**

- Push-up: incline push-up → knee push-up → push-up. 3.5 full reps → start on incline.
- First strict pull-up: chin-up negatives → chin-ups → pull-up negatives → pull-ups, with the assisted
  pull-up machine (less help over time) and the lat pulldown trained alongside every week. Chin-ups 0–2 →
  start on negatives; 3+ → chin-ups at about half your best.
- Plank: 1:30 already, so sets of 45–75 s, never past 2:00, then plank shoulder taps → long-lever plank →
  ball roll-out.

**Arm gap:** curls, rows and (later) other one-arm moves are done one arm at a time, left first; the right arm
is told to match the left's reps and never do more. Both arms use the same weight. Progress shows the gap.

**Block:** the week of the first session is an intro week (2 sets, extra reps in reserve, find your weights),
then 4 build weeks (reps in reserve 3 → 1–2, weights rise by double progression), then a deload week (about 60%
of the sets, about 10% lighter). Repeats: 4 build + 1 deload.

**Progression (`progress.ts`):** every set at the top of the range with at least 1 rep in reserve → the smallest
jump next time (dumbbells 1 kg under 10 kg and 2.5 kg above; machines and cables `machineStepKg`; assisted
pull-up: less help; bodyweight ladders: the next variation). Otherwise aim for one more rep per set. Two sessions
in a row under the range → step back. Hit the reps but with nothing left → repeat the weight.

Warm-up (5 min easy cardio, mobility, two lighter ramp-up sets), cool-down, rest-day guidance and the
sleep/eating/protein notes live in `guide.ts` and show on Today, in the logger and in Train → Guide.

## 5. 3D

- `three` only, procedural geometry, no downloaded assets.
- **Body model:** a low-poly figure made of one mesh per muscle group over a neutral body. Drag to rotate.
  Colours: by this week's hard sets per muscle (logged), or the muscles of one day or one exercise.
- **Form demos:** a capsule mannequin on a joint rig. `rig.ts` (pure) does the forward kinematics; `demos.ts`
  holds keyframes, phases, cues and mistakes for the ~15 main exercises. Simple props (bench, dumbbells, cable).
- **2D fallback:** the same rig drawn as an SVG figure (step through the phases, no motion) and an SVG
  front/back body map. Used when WebGL is missing, with `prefers-reduced-motion`, when the 3D view measures
  under 20 fps, or when "3D views" is off in Profile.
- **Budget:** the logger and the first paint load no 3D code (checked from the build output). 3D chunk under
  200 kB gzip. Pixel ratio capped at 2, under 100 draw calls, the body model only renders when it changes,
  demos pause when off screen. Target 30 fps at 4× CPU throttle on a 390×844 viewport.
- If 3D and the logger ever conflict, the logger wins: 3D sits behind a button in the logger, never inline.

## 6. Assumptions (my calls)

1. Age 14, 60 kg (your message) replace the stored 15 and 58.3 kg; onboarding shows them to confirm.
2. Gym days default to Mon, Tue, Thu, Fri (your old plan) at 6:30 am; the first session is Thu 12 Nov 2026,
   which lands on Upper B.
3. Because training days come in pairs, the week is upper/lower rather than four full-body days. With 2–3 days
   it is full-body.
4. Starting weights are cautious guesses for a 60 kg beginner. The first session says "find a weight you could
   do about 15 times and stop at the top of the range".
5. Machines move in 5 kg steps unless you change it in Profile.
6. Times and dates use the phone's clock (Sydney for you), like the rest of the app. Tests run in
   `Australia/Sydney` too.
7. Baselines are dated the day you finish onboarding; the first retest is due 4 weeks later.
8. Arm circumference is optional in onboarding (you may not have a tape handy).
9. Fuel leaves the bottom bar to make room for Progress.
10. The AI coach keeps working with the gym library and the same code guards; it never sees the home moves.
11. Maximum 4 gym days a week.

## 7. Results (checked 11 Nov 2026)

- **Tests:** 145 logic tests pass, in UTC and in `Australia/Sydney` (progression engine, block weeks, guards,
  migration, sync, measurements, rig and demos).
- **Browser walkthrough** (`scripts/e2e.mjs`, 390×844, Sydney time): a realistic home save from 27 Oct is
  migrated (9 workouts and 11 nights kept, backup copy written), onboarding is clicked through, a full Upper B
  session is logged on Thu 12 Nov (14 sets with reps in reserve and left/right reps), and the next week shows
  "last time" and a target built from it. No console errors.
- **3D budget** (`scripts/perf-3d.mjs`, 4× CPU throttle, software WebGL): form demos 26–30 draw calls, about
  3,900 triangles, 60 fps, first frame about 1.2–1.4 s after opening; body model 49 draw calls, about 17,500
  triangles, no frames drawn while idle; 20 demos opened in a row leave 1 scene alive. Today, Plan, Progress and
  the logger download no 3D code.
- **Bundle:** three.js and the scenes are a lazy chunk of about 125 kB gzip (budget 200 kB).
- **Safety review of the programme:** every loaded exercise sits at 8–15 reps (the assisted pull-up was moved
  from 6–10 to 8–12 in this review); reps in reserve never drop below 1; holds stop at 2:00; deload weights are
  one real jump lighter (so the stack has them); no more than 4 gym days, and "train anyway" stops at 4 a week;
  the coach prompt no longer allows any supplement and gives no calorie or protein numbers of its own.
