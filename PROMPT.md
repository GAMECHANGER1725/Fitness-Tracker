# My prompt for Claude

Copy everything in the box below into a new Claude Code session that has both repos (`GAMECHANGER1725/Fitness-Tracker` and `GAMECHANGER1725/fuel-log`). Replace the last line with what you want done.

```text
You're helping me with my two personal apps: Fitness Tracker (GAMECHANGER1725/Fitness-Tracker) and Fuel Log (GAMECHANGER1725/fuel-log). Read CLAUDE.md in each repo before you change anything.

About me
- Vaidik, 15, male, 182 cm, about 58–59 kg (Fuel Log has my latest weigh-in). Lean and on a bulk: gaining 0.25–0.5 kg a week, about 3,050 kcal and 115 g protein a day.
- Vegetarian (eggs and dairy OK, no meat or fish). Australian and Gujarati/Indian food. I don't take whey unless I turn it on in Fuel Log.
- At school on weekdays. I wake up at 6:00 every day, weekends too, so more sleep has to come from an earlier bedtime. My sleep goal is 8.5 h (lights out about 9:15 pm).
- I train at home only: bodyweight, a backpack I load with books or water bottles (up to about 15 kg), and a forearm trainer. No bar, bench or dumbbells.
- 4 workouts a week (upper/lower, Mon, Tue, Thu, Fri, about 40 min). My workout reminder is 4:30 pm.
- I have a Samsung Galaxy Watch. Sleep comes in through the Samsung Health CSV export, or I tap "Going to sleep" and "I'm up".

How my apps work (keep it this way unless I ask)
- Both are React + Vite + zustand PWAs on GitHub Pages at gamechanger1725.github.io (/fuel-log/ and /Fitness-Tracker/). No server: localStorage plus a private GitHub Gist for sync.
- Fitness Tracker reads Fuel Log read-only: on the same phone from localStorage (fuel-log-v3), elsewhere from Fuel Log's gist. Both apps use the same AI key (DeepSeek through TokenHarbor, Gemini as backup) and the same passcode.
- The AI coach only suggests. Code sets the limits: library exercises for my equipment only, at most 20 hard sets a week per area, volume up at most 20% at a time, bedtime moving at most 30 min a week inside 8–10 h before 6:00. Never add advice to cut calories, train to failure or take supplements; anything that hurts means "stop and see a doctor or physio".
- The design comes from Claude Design: one family (Bricolage Grotesque and Manrope, rounded cards, pill buttons, a floating nav). Fuel Log is warm (cocoa and ember). Fitness Tracker is cool (slate and mint, indigo for sleep, ember wherever food from Fuel Log shows). The "Shared base" part of styles.css is the same in both apps: change both or neither. For new screens, mock them up in Claude Design first.

How I like you to work
- Plan first and tell me the plan in plain words before big changes. Ask me if something is unclear.
- Keep new logic as pure functions in src/lib/ with tests. Run npm test (also with TZ=Australia/Sydney) and npm run build, then check it in the browser at phone size before you push.
- Push to a branch and open a draft PR. A push to main is a deploy.
- Update README.md and CLAUDE.md when behaviour changes. Use Australian English, keep it short and avoid jargon.

What I want now:
[WRITE YOUR REQUEST HERE, e.g. "Add a 10-minute stretching routine for rest days" or "The coach keeps moving my bedtime later, find out why"]
```

## Ideas for what to ask next

- "Read my last two weeks and tell me honestly how training, sleep and food are going."
- "Add a stretching or mobility routine for rest days."
- "Let me log body measurements (arms, chest, waist) in Fitness Tracker and show them next to my weight."
- "Show my reps and backpack weight over time as a chart for each exercise."
- "Add a timer mode for planks and wall sits with a countdown beep."
