# Fitness Tracker

A personal, mobile-first PWA for **home workouts**, **waking up at 6 am** and **sleep**, with an **AI coach**. It's the sister app of [Fuel Log](https://gamechanger1725.github.io/fuel-log/): it reads your food from Fuel Log, uses the same AI key and passcode, and syncs through a private GitHub Gist. No account, no server, and the data stays on your devices.

**Live app:** https://gamechanger1725.github.io/Fitness-Tracker/ (after the one-time setup below)

## Tabs

- **Today:** an **I'm up** button (on time = within 15 min of 6:00, with a streak), a **readiness score** (sleep last night + yesterday's food from Fuel Log + recent training) that says Go hard, Normal or Take it easy, the coach's morning briefing, today's workout with **Start**, what's left to eat, and the week at a glance.
- **Train:**
  - **Plan:** an upper/lower split on Mon, Tue, Thu and Fri, about 40 minutes each. Change the days, sets, rep ranges, backpack weight and rest, add or swap exercises, and undo the last change.
  - **History** of every workout, **Exercises** (about 40 moves with form cues and your best set), and **Badges**.
  - **Workout player:** guided sets, reps (or seconds) and backpack kg, how hard each set felt, a rest timer that buzzes, swap an exercise (or ask the coach for a swap, e.g. "my wrist hurts"), and a summary with new bests.
- **Sleep:** **Going to sleep** and **I'm up** buttons, editable nights, a 1–5 rating, Samsung Health import (stages and sleep score from your Galaxy Watch), the last 7 nights against your goal, insights (sleep debt, bedtime consistency, weekend drift, late meals from Fuel Log vs sleep quality, sleep after workouts) and **Tonight's plan** from the coach.
- **Fuel:** today's calories, protein, carbs and fat from Fuel Log, protein per kg, your weight trend, training days vs rest days, and the last 7 days, with a button to open Fuel Log.
- **Coach:** the weekly check-in, today's briefing and **Ask your coach**.

Profile (top-right button) has your stats, equipment (backpack max kg, forearm trainer), wake, sleep and workout times, AI keys, sync, reminders, theme, backup and log out.

## Built for home: bodyweight, a backpack and a forearm trainer

Every exercise works without a bar, bench or dumbbells. A loaded backpack (books or water bottles: 1 L = 1 kg) adds weight to rows, squats, Romanian deadlifts, hip thrusts, curls and push-ups.

**Progression is automatic.** When every set reaches the top of the rep range without grinding, the next session steps up:

1. backpack exercises add 2 kg (up to the max you set);
2. bodyweight exercises move to a harder variation (incline push-up → push-up → backpack push-up → decline → archer);
3. if neither is possible, the rep range moves up.

Two sessions in a row under the range step back. Every fifth week of steady training, a lighter week is suggested.

## The AI coach

It uses the **same key as Fuel Log** (DeepSeek through TokenHarbor, or Gemini). On a phone where Fuel Log has a key, there's nothing to set up. Everything it suggests goes through limits in code (`src/lib/progress.ts`, `src/lib/sleep.ts`):

- **Weekly check-in** (by itself, once a week): reads two weeks of workouts, sleep and Fuel Log, then updates your program (swaps, sets, reps, backpack weight, a lighter week) and your **bedtime**, with 3 training and food focus points and 3 sleep habits.
  - The limits: only exercises from the home library, 1–5 sets, at most 20 hard sets a week per area, weekly volume up 20% at most, and bedtime moving at most 30 min a week within the 8–10 h window before 6:00.
  - You can undo a check-in, or turn off auto-apply.
- **Morning briefing:** how you slept, what to do today and how hard, and a food tip.
- **Tonight's plan:** when to put the screens away, what to eat last (from what's left in Fuel Log) and lights-out.
- **After a workout:** what went well and what to eat next.
- **Swap an exercise** for a reason, and **Ask your coach** anything about training, sleep or food.

The coach is for a 15-year-old: no training to failure as a habit, no calorie cutting, no supplements beyond food, and "stop and see a doctor or physio" if something hurts.

## Link with Fuel Log

Both apps live on `gamechanger1725.github.io`, so on the same phone this app reads Fuel Log's saved data directly (food log, targets, weigh-ins, AI keys, GitHub token). On another device it reads Fuel Log's sync gist with the same GitHub token. It never writes to Fuel Log.

## Sync between devices

**Profile → Sync.** On a phone where Fuel Log already syncs, Fitness Tracker uses its token by itself. Otherwise paste a GitHub token with only the **gist** permission ([make one](https://github.com/settings/tokens/new?scopes=gist&description=Fitness%20Tracker%20sync)). Workouts, nights, your plan and settings sync through their own secret gist, `fitness-tracker-sync.json`. Merging works per item, so nothing logged on two devices is lost, and deletions stay deleted. AI keys, theme and a workout in progress stay on each device.

## Samsung Health (Galaxy Watch)

Samsung Health has no web API, so the import uses its data export:

1. In Samsung Health, open the menu, then **Settings → Download personal data → Download**.
2. In the app, open **Sleep → Samsung Health → Choose CSV files**.
3. Pick `com.samsung.shealth.sleep.*.csv`, plus `com.samsung.health.sleep_stage.*.csv` for stages.

Nights you typed in yourself are kept, and so are your ratings.

## Reminders

Turn them on in **Profile → Reminders**:

- wind down 40 min before lights-out;
- your workout on planned days;
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
npm test             # logic tests
npm run build && npm run preview   # http://localhost:4173/Fitness-Tracker/
```

## Design

The design comes from a Claude Design canvas shared with Fuel Log: one family (Bricolage Grotesque and Manrope, rounded cards, pill buttons, a floating nav) with two identities. Fuel Log is warm cocoa and ember. Fitness Tracker is deep slate and mint, indigo for sleep, and Fuel Log's ember wherever your food shows up.
