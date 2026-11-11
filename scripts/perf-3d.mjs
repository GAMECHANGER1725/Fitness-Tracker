// 3D performance budget check at phone size with a 4× slower CPU.
//   node scripts/perf-3d.mjs http://localhost:5173
// Measures: frame rate of a form demo over 5 s, draw calls and triangles, time to the first 3D frame, JS heap,
// WebGL contexts left after opening 20 demos in a row, and that pages without 3D never download the 3D code.
// Headless Chromium draws WebGL in software (SwiftShader), so a phone with a GPU will do better than this.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const BUDGET = { fps: 30, calls: 100, triangles: 30_000 };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
const check = (ok, line) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
  if (!ok) failed = true;
};

async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('fitness-unlocked', '1');
    if (!localStorage.getItem('fitness-v1')) localStorage.setItem('fitness-v1', JSON.stringify({ state: { v: 2, onboarded: true, settings: { view3d: 'on' } }, version: 2 }));
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { ctx, page, cdp };
}

// 1. Pages without 3D must not fetch it.
{
  const { ctx, page } = await phone();
  const files = [];
  page.on('request', (r) => files.push(r.url()));
  for (const h of ['today', 'train', 'progress', 'workout']) {
    await page.goto(`${url}/#/${h}`);
    await page.waitForTimeout(1200);
  }
  const three = files.filter((f) => /three|BodyScene|DemoScene/i.test(f));
  check(!three.length, `no 3D code on Today, Plan, Progress or the logger${three.length ? `: ${three.join(', ')}` : ''}`);
  await ctx.close();
}

// 2. A form demo: first frame, frame rate, draw calls.
for (const id of ['goblet-squat', 'lat-pulldown']) {
  const { ctx, page } = await phone();
  const t0 = Date.now();
  await page.goto(`${url}/#/lab?demo=${id}`);
  await page.waitForFunction(() => window.__perf3d?.firstFrameMs != null, null, { timeout: 30_000 });
  const first = Date.now() - t0;
  await page.waitForTimeout(1500);
  const fps = await page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        const start = performance.now();
        const tick = (now) => (now - start < 5000 ? (n++, requestAnimationFrame(tick)) : done((n * 1000) / (now - start)));
        requestAnimationFrame(tick);
      }),
  );
  const p = await page.evaluate(() => window.__perf3d);
  const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  console.log(`\n${id}: first 3D frame ${first} ms after navigation · ${fps.toFixed(1)} fps · pixel ratio ${p.dpr} · heap ${(heap / 1e6).toFixed(1)} MB`);
  check(p.calls <= BUDGET.calls, `${p.calls} draw calls (budget ${BUDGET.calls})`);
  check(p.triangles <= BUDGET.triangles, `${p.triangles} triangles (budget ${BUDGET.triangles})`);
  console.log(`${fps >= BUDGET.fps ? 'ok  ' : 'note'} ${fps.toFixed(1)} fps in software rendering (target ${BUDGET.fps}; the app drops to 2D below 20)`);
  await ctx.close();
}

// 3. The body model.
{
  const { ctx, page } = await phone();
  await page.goto(`${url}/#/lab?only=body`);
  await page.waitForFunction(() => window.__perf3d?.firstFrameMs != null, null, { timeout: 30_000 });
  const p = await page.evaluate(() => window.__perf3d);
  console.log('\nbody model:');
  check(p.calls <= BUDGET.calls, `${p.calls} draw calls (budget ${BUDGET.calls})`);
  check(p.triangles <= BUDGET.triangles, `${p.triangles} triangles (budget ${BUDGET.triangles})`);
  const before = p.frames;
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => window.__perf3d.frames);
  check(after === before, `renders on demand only (${after - before} frames while idle)`);
  await ctx.close();
}

// 4. Open and close 20 demos: every scene must be released.
{
  const { ctx, page } = await phone();
  await page.goto(`${url}/#/lab?demo=pushup`);
  await page.waitForFunction(() => window.__perf3d?.firstFrameMs != null, null, { timeout: 30_000 });
  const ids = ['pushup', 'chinup', 'lat-pulldown', 'seated-row', 'db-row', 'chest-press', 'db-press', 'shoulder-press', 'db-curl', 'pushdown'];
  for (let i = 0; i < 20; i++) {
    await page.evaluate((h) => (location.hash = h), `/lab?demo=${ids[i % ids.length]}&n=${i}`);
    await page.waitForTimeout(500);
  }
  const p = await page.evaluate(() => window.__perf3d);
  console.log('\n20 demos in a row:');
  check(p.live <= 1, `${p.made} scenes made, ${p.live} still alive`);
  await ctx.close();
}

await browser.close();
console.log(failed ? '\n3D BUDGET: FAILED' : '\n3D BUDGET: OK');
process.exitCode = failed ? 1 : 0;
