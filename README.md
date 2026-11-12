# Fitness Tracker

A personal, mobile-first PWA for **gym training**, **waking up at 6 am** and **sleep**, with an **AI coach**. It's the sister app of [Fuel Log](https://gamechanger1725.github.io/fuel-log/): it reads your food from Fuel Log, uses the same AI key and passcode, and syncs through a private GitHub Gist. No account, no server, and the data stays on your devices. It works offline once installed.

**Live app:** https://gamechanger1725.github.io/Fitness-Tracker/ (after the one-time setup below)

It started as a home-workout tracker (27 Oct 2026). The gym version keeps everything logged before it: see [Moving from the home version](#moving-from-the-home-version).

## Tabs

- **Today:** an **I'm up** button, a **readiness score**, the block week you're in (intro, build 1–4, lighter), today's session with **Start**, the weekly check-in or 4-week retest when one is due, rest-day guidance, what's left to eat, and the week at a glance.
- **Train:**
  - **Plan:** your gym days and start time, each day's exercises (sets, reps, weight, rest), add or swap exercises, undo the last change.
  - **Body:** a 3D body you can turn, coloured by the hard sets each muscle got this week, in the planned week, or on one day.
  - **Moves:** every exercise with form cues, common mistakes, the muscles it works and, for the main 15, an animated 3D form demo.
  - **History** of every workout (home ones included) and a **Guide** (safety, warm-up, cool-down, rest days, eating, sleep).
  - **Workout logger:** made for one hand at the gym. Weight, reps and **Log set** sit at the bottom of the screen, the rest timer starts by itself, and every exercise shows **today's target** and **last time**. Reps in reserve per set, left/right reps for one-arm work, a hold timer for planks, swap an exercise, "something hurts", and a summary with new bests.
- **Progress:** benchmarks (push-ups, plank, chin-ups, pull-ups) with a **retest every 4 weeks**, weekly **bodyweight** and **arm measurements** with a left-vs-right gap chart, lift bests, a week streak and badges.
- **Sleep:** **Going to sleep** and **I'm up** buttons, editable nights, Samsung Health import, the last 7 nights against your goal, insights and **Tonight's plan** from the coach.
- **Coach:** the weekly check-in, today's briefing and **Ask your coach**.

Fuel (your food from Fuel Log) opens from its card on Today and from Progress. Profile (top-right button) has your stats, gym settings, wake, sleep and gym times, AI keys, sync, reminders, theme, backup and log out.

## The gym plan

Built for a 14-year-old beginner on a lean bulk who wants bigger arms: **technique first, machines and dumbbells, 8–15 reps, 1–3 reps left in the tank, no maxing out**.

- **4 days (default Mon, Tue, Thu, Fri, about an hour):** Upper A, Lower A, Upper B, Lower B. Push, pull, legs and core are all covered, with direct arm work on both upper days. With 2–3 gym days it switches to two full-body sessions. It won't schedule more than 4 days.
- **The arm gap:** curls and rows are done one arm at a time, the smaller arm first, and the other arm is told to match its reps.
- **Ladders from your starting numbers:**
  - push-ups: incline → knee → full;
  - first strict pull-up: chin-up negatives → chin-ups → pull-up negatives → pull-ups, with the assisted pull-up machine and the lat pulldown every week;
  - plank: never past 2 minutes, then shoulder taps → long-lever plank → ball roll-out.
- **Blocks:** the first week is an intro (2 light sets to learn the movements and find your weights), then 4 build weeks, then a lighter week. Then 4 build + 1 lighter, on repeat.

**Progression is automatic** (double progression). Each set aims for one more rep than last time. When every set reaches the top of the range with at least a rep left, the weight goes up by the smallest jump (dumbbells 1 kg under 10 kg, then 2.5 kg; machines 5 kg, or 2.5 kg if you set that in Profile) and the reps start again from the bottom. The plan follows the weight you actually lifted. Two sessions in a row under the range step back.

The starting weights are cautious guesses. On your first go at an exercise, pick a weight you could lift about 15 times and stop at the top of the range.

**If something hurts, stop that exercise.** Book the gym's free induction and ask a trainer to check your form. This app is general guidance, not medical advice.

## 3D

The body model and the form demos are built in code (three.js, no downloaded models) and only load when you open them, so the logger never waits for them. If the phone has no WebGL, asks for reduced motion, or measures under 20 frames a second, the app shows flat 2D versions instead (a front/back body map, and a figure you step through pose by pose). Profile → Gym → "3D body and form demos" forces either one.

## The AI coach

It uses the **same key as Fuel Log** (DeepSeek through TokenHarbor, or Gemini). On a phone where Fuel Log has a key, there's nothing to set up. It knows the gym library, your block week, benchmarks and arm gap. Everything it suggests goes through limits in code (`src/lib/progress.ts`, `src/lib/sleep.ts`):

- **Weekly check-in** (by itself, once a week): reads two weeks of workouts, sleep and Fuel Log, then updates your program (swaps, sets, rep ranges, a lighter week; the weights stay with the progression rules) and your **bedtime**, with 3 training and food focus points and 3 sleep habits.
  - The limits: only exercises from the gym library, 1–4 sets, loaded work at 5+ reps, weights moving one step at most, at most 20 hard sets a week per area, weekly volume up 20% at most, and bedtime moving at most 30 min a week within the 8–10 h window before 6:00.
  - You can undo a check-in, or turn off auto-apply.
- **Morning briefing:** how you slept, what to do today and how hard, and a food tip.
- **Tonight's plan:** when to put the screens away, what to eat last (from what's left in Fuel Log) and lights-out.
- **After a workout:** what went well and what to eat next.
- **Swap an exercise** for a reason, and **Ask your coach** anything about training, sleep or food.

The coach is for a teenager: no training to failure, no one-rep-max tests, no calorie cutting, no supplements beyond food, and "stop and see a doctor or physio" if something hurts.

## Link with Fuel Log

Both apps live on `gamechanger1725.github.io`, so on the same phone this app reads Fuel Log's saved data directly (food log, targets, weigh-ins, AI keys, GitHub token). On another device it reads Fuel Log's sync gist with the same GitHub token. It never writes to Fuel Log.

## Sync between devices

**Profile → Sync.** On a phone where Fuel Log already syncs, Fitness Tracker uses its token by itself. Otherwise paste a GitHub token with only the **gist** permission ([make one](https://github.com/settings/tokens/new?scopes=gist&description=Fitness%20Tracker%20sync)). Workouts, nights, measurements, your plan and settings sync through their own secret gist, `fitness-tracker-sync.json`. Merging works per item, so nothing logged on two devices is lost, and deletions stay deleted. AI keys, theme, the 3D setting and a workout in progress stay on each device.

## Moving from the home version

Opening the gym version on a phone that has the home version's data migrates it once:

- every workout, set, night, setting and badge is kept as it was;
- the home exercises stay in the library (marked "at home" in History, "Before the gym" in Moves and Progress), so old bests and "last time" still work;
- the home plan and its change log are archived (Profile → Gym → "Your home plan");
- an untouched copy of the old save is kept on the phone under `fitness-v1-home-backup`;
- old backup files and the old sync file are migrated when they're read.

Then onboarding asks for your baselines (push-ups, plank, pull-ups, chin-ups, weight, arms), goal and gym days. The baselines become the first entries in Progress.

## Backup

**Profile → Backup → Export** saves everything (without the AI keys) as a JSON file; **Import** loads one, from either version.

## Samsung Health (Galaxy Watch)

Samsung Health has no web API, so the import uses its data export:

1. In Samsung Health, open the menu, then **Settings → Download personal data → Download**.
2. In the app, open **Sleep → Samsung Health → Choose CSV files**.
3. Pick `com.samsung.shealth.sleep.*.csv`, plus `com.samsung.health.sleep_stage.*.csv` for stages.

Nights you typed in yourself are kept, and so are your ratings.

## Reminders

Turn them on in **Profile → Reminders**:

- wind down 40 min before lights-out;
- your gym session on planned days;
- a nudge if "I'm up" isn't logged 15 minutes after the wake target.

Like Fuel Log, they only fire while the app is open or alive in the background (there's no push server).

## One-time setup

1. Make the repo public (**Settings → General → Danger zone → Change visibility**). Free GitHub Pages needs a public repo.
2. Turn on Pages: **Settings → Pages → Source: GitHub Actions**.
3. Merge to `main`. Every push to `main` runs the tests, builds and deploys.
4. Open the live link on your phone, add it to the home screen, and enter your Fuel Log passcode.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # logic tests (also: TZ=Australia/Sydney npm test)
npm run build && npm run preview   # http://localhost:4173/Fitness-Tracker/

# Browser checks (Playwright + Chromium needed), against a running dev server:
node scripts/e2e.mjs http://localhost:5173       # migration → onboarding → a full logged session
node scripts/perf-3d.mjs http://localhost:5173   # 3D frame rate, draw calls and lazy-loading at phone size, 4× CPU throttle
```

`PLAN.md` has the design: data model and migration, the programme, the 3D approach and the assumptions made.

## Design

The design comes from a Claude Design canvas shared with Fuel Log: one family (Bricolage Grotesque and Manrope, rounded cards, pill buttons, a floating nav) with two identities. Fuel Log is warm cocoa and ember. Fitness Tracker is deep slate and mint, indigo for sleep, and Fuel Log's ember wherever your food shows up.
