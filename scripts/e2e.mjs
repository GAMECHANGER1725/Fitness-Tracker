// End-to-end check in a real browser at phone size: a home-version save is migrated, onboarding is clicked
// through, a full gym session is logged, and the data is checked afterwards.
//   node scripts/e2e.mjs http://localhost:5173 [screenshot-dir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

// Playwright may be installed globally rather than in this repo.
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });

const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+11:00`).getTime();
function homeSave() {
  const S = (exerciseId, sets, low, high, restS = 90, loadKg = 0) => ({ exerciseId, sets, low, high, restS, loadKg });
  const days = [
    { id: 'upper-a', name: 'Upper A', slots: [S('pushup', 4, 8, 15), S('pack-row', 4, 10, 15, 90, 8), S('pack-curl', 3, 10, 15, 60, 4)] },
    { id: 'lower-a', name: 'Lower A', slots: [S('pack-squat', 4, 10, 15, 90, 6), S('pack-rdl', 3, 10, 15, 90, 6), S('plank', 3, 30, 60, 45)] },
  ];
  const program = { days, week: ['upper-a', 'lower-a', null, 'upper-a', 'lower-a', null, null], deloadUntil: null };
  const sessions = {};
  ['2026-10-27', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'].forEach((date, i) => {
    const d = days[i % 2];
    const start = at(date, '16:30');
    sessions[`h${i}`] = { id: `h${i}`, date, dayId: d.id, name: d.name, start, end: start + 2_400_000, upd: start, feel: 4, sets: d.slots.flatMap((s, j) => Array.from({ length: s.sets }, (_, k) => ({ id: `h${i}-${j}-${k}`, exerciseId: s.exerciseId, reps: s.exerciseId === 'pushup' ? 3 : s.exerciseId === 'plank' ? 60 : s.low + 1, loadKg: s.loadKg, rpe: 8, at: start + j * 1000 + k }))) };
  });
  const nights = {};
  for (let d = 1; d <= 11; d++) {
    const k = `2026-11-${String(d).padStart(2, '0')}`;
    nights[k] = { date: k, bed: at(k, '00:00') - 2.75 * 3_600_000, wake: at(k, '06:04'), quality: 4, source: 'tap', m: 5 };
  }
  return { state: { v: 1, profile: { name: 'Vaidik', age: 15, sex: 'male', heightCm: 182, weightKg: 58.3, packMaxKg: 15, hasGrip: true }, settings: { wakeTarget: '06:00', sleepGoalH: 8.5, bedtime: '21:15', workoutTime: '16:30', theme: 'auto' }, program, programLog: [], sessions, nights, active: null, seen: { badges: [] }, tomb: {}, mod: at('2026-11-10', '17:30') }, version: 1 };
}

const fail = (m) => {
  console.error('FAIL:', m);
  process.exitCode = 1;
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Australia/Sydney', locale: 'en-AU', hasTouch: true, isMobile: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitness-v1')));

// --- Wed 11 Nov 2026, 7 pm: open the new version on top of the home save -------------------------
await page.clock.install({ time: new Date('2026-11-11T19:00:00+11:00') });
await page.addInitScript((save) => {
  if (!localStorage.getItem('fitness-unlocked')) {
    localStorage.setItem('fitness-unlocked', '1');
    localStorage.setItem('fitness-v1', save);
  }
}, JSON.stringify(homeSave()));
await page.goto(url);
await page.getByRole('heading', { name: 'Welcome to the gym plan' }).waitFor();
await shot('01-welcome');
if (!(await page.getByText('9 home workouts and 11 nights').count())) fail('migration summary missing');
if (!(await page.evaluate(() => !!localStorage.getItem('fitness-v1-home-backup')))) fail('home backup not kept');

await page.getByRole('button', { name: 'Set up my plan' }).click();
await shot('02-you');
await page.getByRole('button', { name: 'Next' }).click();
if (!(await page.getByRole('button', { name: 'Next' }).isDisabled())) fail('chin-ups should be required');
await shot('03-baselines');
await page.getByRole('button', { name: /Not sure yet/ }).click();
await page.getByRole('button', { name: 'Next' }).click();
await shot('04-schedule');
await page.getByRole('button', { name: 'Next' }).click();
await shot('05-ready');
await page.getByRole('button', { name: /Got it/ }).click();
await page.getByRole('button', { name: 'Start', exact: true }).click();
await page.getByRole('heading', { name: 'Gym starts soon' }).waitFor();
await shot('06-today-before');

let d = (await data()).state;
if (!d.onboarded || d.v !== 2) fail('not onboarded / not v2');
if (Object.keys(d.sessions).length !== 9) fail(`home sessions lost: ${Object.keys(d.sessions).length}`);
const base = d.measures['2026-11-11'];
if (!base || base.pushups !== 3.5 || base.plankS !== 90 || base.pullups !== 0 || base.chinups !== 0 || base.weightKg !== 60) fail(`baselines wrong: ${JSON.stringify(base)}`);
if (d.program.start !== '2026-11-12' || d.program.week[3] !== 'upper-b') fail('programme start/week wrong');
if (d.profile.age !== 14) fail('age');

// --- Other pages ---------------------------------------------------------------------------------
for (const [hash, name] of [['train', '07-train-plan'], ['train?tab=body', '08-train-body'], ['train?tab=moves', '09-train-moves'], ['train?tab=history', '10-train-history'], ['train?tab=guide', '11-train-guide'], ['progress', '12-progress'], ['profile', '13-profile'], ['sleep', '14-sleep'], ['coach', '15-coach']]) {
  await page.goto(`${url}/#/${hash}`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: hash !== 'train?tab=body' });
}
await page.goto(`${url}/#/train?tab=moves`);
await page.getByRole('button', { name: /One-arm dumbbell curl/ }).click();
await page.waitForTimeout(1500);
await shot('16-exercise-info');
await page.keyboard.press('Escape');

// --- Thu 12 Nov, 6:30 am: the first gym session ---------------------------------------------------
await page.clock.setFixedTime(new Date('2026-11-12T06:30:00+11:00'));
await page.goto(`${url}/#/today`);
await page.reload();
await page.getByRole('heading', { name: 'Upper B' }).waitFor();
await shot('20-today-gymday');
await page.getByRole('button', { name: /Start workout/ }).click();
await page.getByRole('heading', { name: 'Warm-up first' }).waitFor();
await shot('21-warmup');
await page.getByRole('button', { name: /Warm, start/ }).click();
await shot('22-logger-first');

let logged = 0;
let clockMs = new Date('2026-11-12T06:38:00+11:00').getTime();
for (let guard = 0; guard < 60; guard++) {
  const finish = page.getByRole('button', { name: 'Finish workout' });
  if (await finish.count()) break;
  const skip = page.getByRole('button', { name: 'Skip rest' });
  if (await skip.count()) {
    if (logged === 1) await shot('23-rest-timer');
    await skip.click({ timeout: 2000 }).catch(() => {}); // the rest may run out by itself first
    continue;
  }
  const log = page.getByRole('button', { name: /^Log set/ });
  await log.waitFor();
  if (logged === 2) {
    // Change the weight and reps like a real set: +1 step, one rep fewer on the other arm.
    await page.getByRole('button', { name: /^More/ }).first().click();
  }
  await page.getByRole('button', { name: /^2 left/ }).click();
  if (logged === 4) await shot('24-logger-one-arm');
  await log.click();
  logged++;
  clockMs += 150_000;
  await page.clock.setFixedTime(new Date(clockMs));
}
await shot('25-logger-last');
await page.getByRole('button', { name: 'Finish workout' }).click();
await page.getByRole('button', { name: 'Good' }).click();
await shot('26-finish-sheet');
await page.getByRole('button', { name: 'Save workout' }).click();
await page.getByRole('heading', { name: 'Upper B done' }).waitFor();
await page.screenshot({ path: `${out}/27-summary.png`, fullPage: true });
await page.getByRole('link', { name: 'Done' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/28-today-after.png`, fullPage: true });

d = (await data()).state;
const gym = Object.values(d.sessions).find((s) => s.date === '2026-11-12');
if (!gym) fail('gym session not saved');
else {
  console.log(`session saved: ${gym.name}, ${gym.sets.length} sets, ${[...new Set(gym.sets.map((s) => s.exerciseId))].length} exercises`);
  if (gym.sets.length !== logged) fail(`sets ${gym.sets.length} vs logged ${logged}`);
  if (!gym.sets.every((s) => s.rir === 2)) fail('reps in reserve not saved');
  if (!gym.sets.some((s) => s.repsR != null)) fail('one-arm reps not saved');
}
if (Object.keys(d.sessions).length !== 10) fail('session count');
console.log('plan changes after session:', JSON.stringify(d.programLog.at(-1)?.lines ?? []));

// The second time round shows "last time" and a target built from it.
await page.clock.setFixedTime(new Date('2026-11-19T06:30:00+11:00'));
await page.goto(`${url}/#/today`);
await page.reload();
await page.getByRole('button', { name: /Start workout/ }).click();
await page.getByRole('button', { name: /Warm, start/ }).click();
if (!(await page.getByText(/12 Nov/).count())) fail('"last time" not shown');
await shot('30-next-week-target');
await page.goto(`${url}/#/train?tab=body`);
await page.waitForTimeout(2500);
await shot('31-body-week');

if (errors.length) fail(`console errors:\n${errors.join('\n')}`);
console.log(process.exitCode ? 'E2E FAILED' : `E2E OK: onboarding done, ${logged} sets logged`);
await browser.close();
