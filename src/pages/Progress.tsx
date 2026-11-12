import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, fmtDate, todayKey } from '../lib/dates';
import { BENCHMARKS, METRIC_LABEL, armGaps, baseline, best, change, due, fmtMetric, freshBests, gainNote, gapTrend, latest, series, weeklyGain, type Metric, type Point } from '../lib/measures';
import { countReps, records, usedLoad, type Best } from '../lib/progress';
import { EX, loadText } from '../lib/exercises';
import { phaseOf } from '../lib/program';
import type { Exercise, Measure, Session } from '../lib/types';
import { Head, Icon, ProfileLink, Sheet, toast, useGame, useRoute, useToday } from '../components/ui';
import { useFuelData } from '../components/data';
import { GapChart, LineChart, Spark } from '../components/charts';
import '../components/charts.css';

type Kind = 'weekly' | 'retest';
interface Open {
  kind: Kind;
  /** Set when editing an entry that is already in the log. */
  date?: string;
}

const LEFT = 'var(--acc)';
const RIGHT = 'var(--pro)';
const plain = (v: number) => String(+v.toFixed(1));
const longDate = (k: string) => fmtDate(k, { weekday: 'short', day: 'numeric', month: 'short' });
const signed = (metric: Metric, v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtMetric(metric, Math.abs(v))}`;
const inDays = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
const isBench = (m: Partial<Measure>) => BENCHMARKS.some((k) => m[k] != null);

export default function Progress() {
  const today = useToday();
  const measures = useStore((s) => s.measures);
  const { params } = useRoute();
  const [open, setOpen] = useState<Open | null>(null);

  // Deep links: #/progress?log=weekly and #/progress?log=retest open the sheet.
  const log = params.get('log');
  useEffect(() => {
    if (log === 'weekly' || log === 'retest') setOpen({ kind: log });
  }, [log]);
  const close = () => {
    setOpen(null);
    if (window.location.hash.includes('log=')) {
      // Drop the query so the sheet doesn't come back, and tell the router (replaceState is silent).
      window.history.replaceState(null, '', '#/progress');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  };

  return (
    <main>
      <Head over="Benchmarks, body and bests" title="Progress" right={<ProfileLink />} />
      <div className="page">
        <DueCard today={today} measures={measures} onOpen={(kind) => setOpen({ kind })} />
        <Totals measures={measures} />
        <Benchmarks measures={measures} onRetest={() => setOpen({ kind: 'retest' })} />
        <Bodyweight measures={measures} today={today} onAdd={() => setOpen({ kind: 'weekly' })} />
        <Arms measures={measures} onAdd={() => setOpen({ kind: 'weekly' })} />
        <Lifts />
        <BadgeGrid />
        <LogList measures={measures} onOpen={setOpen} />
      </div>
      {open?.kind === 'weekly' && <WeeklySheet date={open.date} onClose={close} />}
      {open?.kind === 'retest' && <RetestSheet date={open.date} onClose={close} />}
    </main>
  );
}

// ----- Due now -------------------------------------------------------------------

function DueCard({ today, measures, onOpen }: { today: string; measures: Record<string, Measure>; onOpen: (k: Kind) => void }) {
  const program = useStore((s) => s.program);
  const d = due(measures, today);
  const none = Object.keys(measures).length === 0;
  const lighter = phaseOf(program, today).kind === 'deload';

  if (!d.weekly && !d.retest) {
    const n = d.retestIn ?? 0;
    return (
      <p className="small mut" style={{ padding: '0 4px' }}>
        Next retest {inDays(n)} · {d.retestOn ? longDate(d.retestOn) : ''}
        {lighter && n <= 7 ? '. This is a lighter week, so it is a good time to retest early.' : ''}
      </p>
    );
  }

  return (
    <section className="card soft prog-due stack" style={{ gap: 12 }} aria-label="Due now">
      <span className="small bold" style={{ color: 'var(--acc)' }}>Due now</span>
      {d.retest && (
        <div className="stack" style={{ gap: 8 }}>
          <div>
            <h2 className="h2">{none ? 'Log your starting numbers' : '4-week retest'}</h2>
            <p className="small mut">
              Push-ups, plank, chin-ups and pull-ups, plus your weight and arms. About 10 minutes.
              {lighter ? ' This is a lighter week, so it is a good time for it.' : ''}
            </p>
          </div>
          <button className="btn primary block" onClick={() => onOpen('retest')}>
            <Icon name="medal" size={20} /> {none ? 'Add starting numbers' : 'Do the retest'}
          </button>
        </div>
      )}
      {d.weekly && (
        <div className="stack" style={{ gap: 8 }}>
          {d.retest ? (
            <p className="small mut">Short on time? Just do the weekly check-in for now.</p>
          ) : (
            <div>
              <h2 className="h2">Weekly check-in</h2>
              <p className="small mut">Bodyweight and both arms. Takes a minute.</p>
            </div>
          )}
          <button className={`btn block ${d.retest ? '' : 'primary'}`} style={d.retest ? { background: 'var(--s1)' } : undefined} onClick={() => onOpen('weekly')}>
            <Icon name="plus" size={20} /> Log weight and arms
          </button>
        </div>
      )}
      {!d.weekly && d.retest && d.retestOn && !none && <p className="small mut">Was due {longDate(d.retestOn)}. No rush: pick a day you feel fresh.</p>}
    </section>
  );
}

// ----- Streak and totals ---------------------------------------------------------

function Totals({ measures }: { measures: Record<string, Measure> }) {
  const g = useGame();
  const sessions = useStore((s) => s.sessions);
  const pbs = useMemo(() => {
    const lifts = Object.keys(records(sessions)).filter((id) => EX[id]).length;
    const bench = BENCHMARKS.filter((k) => (best(measures, k)?.v ?? 0) > (baseline(measures, k)?.v ?? 0)).length;
    return lifts + bench;
  }, [sessions, measures]);
  const tile = (n: number, label: string) => (
    <div className="tile">
      <p className="num" style={{ fontSize: 28 }}>{n}</p>
      <span className="small mut">{label}</span>
    </div>
  );
  return (
    <section className="grid3" aria-label="Streak and totals">
      {tile(g.weeks, g.weeks === 1 ? 'week in a row' : 'weeks in a row')}
      {tile(g.sessions, g.sessions === 1 ? 'workout' : 'workouts')}
      {tile(pbs, pbs === 1 ? 'personal best' : 'personal bests')}
    </section>
  );
}

// ----- Benchmarks ----------------------------------------------------------------

function Benchmarks({ measures, onRetest }: { measures: Record<string, Measure>; onRetest: () => void }) {
  const [openId, setOpenId] = useState<Metric | null>(null);
  const any = BENCHMARKS.some((k) => latest(measures, k));
  return (
    <section className="card stack" style={{ gap: 4 }} aria-label="Benchmarks">
      <div className="between" style={{ marginBottom: 4 }}>
        <h2 className="h2">Benchmarks</h2>
        <span className="small mut">Retest every 4 weeks</span>
      </div>
      {!any && (
        <div className="empty stack">
          <span>No benchmarks yet. Test your push-ups, plank, chin-ups and pull-ups once, then again every 4 weeks.</span>
          <button className="btn primary" onClick={onRetest}>Add starting numbers</button>
        </div>
      )}
      {any &&
        BENCHMARKS.map((k) => {
          const s = series(measures, k);
          const first = s[0];
          const last = s.at(-1);
          const top = best(measures, k);
          const diff = change(measures, k);
          const isOpen = openId === k;
          return (
            <div key={k} className="item" style={{ display: 'block', padding: 0 }}>
              <button className="prog-row" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : k)}>
                <span className="grow">
                  <span className="bold">{METRIC_LABEL[k]}</span>
                  <span className="small mut">
                    {!last || !first ? 'Not tested yet' : s.length === 1 ? `Start: ${fmtMetric(k, first.v)} · ${fmtDate(first.date)}` : `${fmtMetric(k, first.v)} → ${fmtMetric(k, last.v)}`}
                  </span>
                </span>
                {top?.fresh ? (
                  <span className="pill"><Icon name="medal" size={14} /> New best</span>
                ) : diff === 0 ? (
                  <span className="pill mut">Same</span>
                ) : null}
                {s.length > 1 && <Spark points={s} />}
                <span className={`prog-chev ${isOpen ? 'open' : ''}`}><Icon name="right" size={18} /></span>
              </button>
              {isOpen && (
                <div className="prog-open stack">
                  <LineChart label={METRIC_LABEL[k]} series={[{ name: METRIC_LABEL[k], color: 'var(--acc)', points: s }]} format={(v) => fmtMetric(k, v)} height={150} />
                  {top && diff != null && (
                    <p className="small mut">
                      Best {fmtMetric(k, top.v)} on {fmtDate(top.date)} · {diff > 0 ? `up ${fmtMetric(k, diff)} since you started` : diff === 0 ? 'same as your start' : 'a bit under your start, which happens. Sleep and food change a test day a lot'}
                      {k === 'plankS' && top.v >= 120 ? '. 2:00 is the cap: harder plank versions come next, not longer holds.' : '.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      {any && <PullupGoal measures={measures} />}
    </section>
  );
}

function PullupGoal({ measures }: { measures: Record<string, Measure> }) {
  const pulls = series(measures, 'pullups');
  const got = pulls.find((p) => p.v >= 1);
  const chins = latest(measures, 'chinups')?.v ?? 0;
  const stage = got ? 3 : chins >= 5 ? 2 : chins >= 1 ? 1 : 0;
  const text = got
    ? `You did it on ${fmtDate(got.date)}. Next: add clean reps, one at a time.`
    : chins >= 5
      ? `${plain(chins)} chin-ups, so you are close. Keep working the negatives, the assisted machine and the lat pulldown.`
      : chins >= 1
        ? `${plain(chins)} chin-up${chins === 1 ? '' : 's'} so far. Build to 5, and keep working the negatives, the assisted machine and the lat pulldown.`
        : 'First step is one chin-up. Keep working the negatives, the assisted machine and the lat pulldown.';
  return (
    <div className="tile stack" style={{ gap: 8, marginTop: 8, padding: 14, opacity: 1 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="medal" style={{ width: 40, height: 40, borderRadius: 14, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: got ? 'var(--acc)' : 'var(--s3)', color: got ? 'var(--on-acc)' : 'var(--mut)' }}>
          <Icon name={got ? 'check' : 'medal'} size={20} />
        </span>
        <div className="grow">
          <span className="bold">First strict pull-up</span>
          <span className="small mut" style={{ display: 'block' }}>{got ? 'Unlocked' : 'Goal · locked'}</span>
        </div>
      </div>
      <div className="steps" role="img" aria-label={got ? 'Goal reached' : `Stage ${stage + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <i key={i} className={got || i < stage ? 'done' : i === stage ? 'now' : ''} />
        ))}
      </div>
      <p className="small">{text}</p>
    </div>
  );
}

// ----- Bodyweight ----------------------------------------------------------------

function Bodyweight({ measures, today, onAdd }: { measures: Record<string, Measure>; today: string; onAdd: () => void }) {
  const fuel = useFuelData();
  const own = series(measures, 'weightKg');
  const from = own.length ? addDays(own[0].date, -28) : addDays(today, -90);
  const fromFuel: Point[] = useMemo(() => (fuel?.weighIns ?? []).filter((w) => w.date >= from && w.date <= today).map((w) => ({ date: w.date, v: w.kg })), [fuel, from, today]);
  // One trend from both apps; this app's entry wins on the same date.
  const merged = useMemo(() => {
    const by = new Map<string, number>();
    for (const p of fromFuel) by.set(p.date, p.v);
    for (const p of own) by.set(p.date, p.v);
    return [...by].map(([date, v]) => ({ date, v })).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [fromFuel, own]);
  const last = merged.at(-1);
  const start = own[0] ?? merged[0];
  const diff = last && start && last.date !== start.date ? +(last.v - start.v).toFixed(1) : null;
  const perWeek = weeklyGain(merged, today);

  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Bodyweight">
      <div className="between">
        <h2 className="h2">Bodyweight</h2>
        <button className="btn sm" onClick={onAdd}><Icon name="plus" size={16} /> Weigh in</button>
      </div>
      {!last ? (
        <p className="empty">No weigh-ins yet. Weigh yourself on the same morning each week, before breakfast.</p>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <p className="num prog-big">{plain(last.v)}<span className="small mut" style={{ fontFamily: 'var(--font)', marginLeft: 4 }}>kg</span></p>
            {diff != null && <span className={`pill ${diff > 0 ? '' : 'mut'}`}>{diff === 0 ? 'Same as your start' : `${signed('weightKg', diff)} since ${fmtDate(start.date)}`}</span>}
          </div>
          <LineChart
            label="Bodyweight"
            series={[
              { name: 'This app', color: 'var(--acc)', points: own },
              { name: 'Fuel Log', color: 'var(--fuel)', points: fromFuel },
            ]}
            format={(v) => fmtMetric('weightKg', v)}
            tickFormat={plain}
          />
          <div className="tile">
            <span className="bold">{perWeek == null ? 'Trend' : `${perWeek > 0 ? '+' : perWeek < 0 ? '−' : ''}${Math.abs(perWeek)} kg a week`}</span>
            <span className="small mut" style={{ display: 'block' }}>{gainNote(perWeek)}</span>
          </div>
        </>
      )}
      <a href="#/fuel" className="small bold row" style={{ color: 'var(--fuel)', textDecoration: 'none', minHeight: 32, gap: 4 }}>
        Food and targets in Fuel Log <Icon name="out" size={16} />
      </a>
    </section>
  );
}

// ----- Arms ----------------------------------------------------------------------

function Arms({ measures, onAdd }: { measures: Record<string, Measure>; onAdd: () => void }) {
  const weak = useStore((s) => s.profile.weakArm);
  const l = series(measures, 'armL');
  const r = series(measures, 'armR');
  const gaps = armGaps(measures);
  const trend = gapTrend(gaps);
  const g = gaps.at(-1);
  const first = gaps[0];
  const lastL = l.at(-1);
  const lastR = r.at(-1);
  const side = weak === 'right' ? 'right' : 'left';

  if (!lastL && !lastR)
    return (
      <section className="card stack" style={{ gap: 12 }} aria-label="Arms">
        <h2 className="h2">Arms</h2>
        <div className="empty stack" style={{ gap: 10 }}>
          <span>No arm measurements yet. Grab a soft tape measure once a week:</span>
          <ul className="prog-how">
            <li>Flex your arm and measure around the widest point of the upper arm.</li>
            <li>Keep the tape snug, not tight.</li>
            <li>Measure both arms, at the same time of day each week.</li>
          </ul>
          <button className="btn primary" onClick={onAdd}><Icon name="plus" size={18} /> Add arm measurements</button>
        </div>
      </section>
    );

  const gapText = !g ? 'Measure both arms on the same day to see the gap.' : g.gap === 0 ? 'Both arms measure the same.' : `${g.gap > 0 ? 'Right' : 'Left'} is ${plain(Math.abs(g.gap))} cm bigger`;
  const trendText =
    trend === 'closing'
      ? `The gap is closing: ${plain(Math.abs(first.gap))} cm on ${fmtDate(first.date)}, ${plain(Math.abs(g!.gap))} cm now. Starting with your ${side} arm is working.`
      : trend === 'widening'
        ? `The gap has grown a little since ${fmtDate(first.date)} (${plain(Math.abs(first.gap))} → ${plain(Math.abs(g!.gap))} cm). Keep starting with your ${side} arm and match its reps with the other.`
        : trend === 'same'
          ? `The gap is about the same as on ${fmtDate(first.date)}. Arms change slowly, so give it a few more weeks.`
          : g
            ? 'Measure again next week to see which way the gap is going.'
            : '';
  const arm = (label: string, p: Point | undefined, color: string, s: Point[]) => {
    const up = s.length > 1 ? +(s.at(-1)!.v - s[0].v).toFixed(1) : null;
    return (
      <div className="tile">
        <span className="small bold row" style={{ gap: 6 }}>
          <i style={{ width: 9, height: 9, borderRadius: 999, background: color, flex: 'none' }} />
          {label}
        </span>
        <p className="num" style={{ fontSize: 28 }}>{p ? plain(p.v) : '–'}<span className="small mut" style={{ fontFamily: 'var(--font)', marginLeft: 4 }}>cm</span></p>
        <span className="small mut">{up == null ? 'First measure' : up === 0 ? 'Same as your start' : `${signed('armL', up)} since start`}</span>
      </div>
    );
  };

  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Arms">
      <div className="between">
        <h2 className="h2">Arms</h2>
        <button className="btn sm" onClick={onAdd}><Icon name="plus" size={16} /> Measure</button>
      </div>
      <div className="grid2">
        {arm('Left', lastL, LEFT, l)}
        {arm('Right', lastR, RIGHT, r)}
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="bold">{gapText}</span>
          {trend && <span className={`pill ${trend === 'closing' ? '' : 'mut'}`}>{trend === 'closing' ? 'Closing' : trend === 'widening' ? 'Wider' : 'About the same'}</span>}
        </div>
        {trendText && <p className="small mut">{trendText}</p>}
      </div>
      <LineChart
        label="Arm size"
        series={[
          { name: 'Left', color: LEFT, points: l },
          { name: 'Right', color: RIGHT, points: r },
        ]}
        format={(v) => fmtMetric('armL', v)}
        tickFormat={plain}
      />
      {gaps.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Left against right</span>
          <GapChart gaps={gaps} leftColor={LEFT} rightColor={RIGHT} />
        </div>
      )}
    </section>
  );
}

// ----- Lift bests ----------------------------------------------------------------

const unitOf = (ex: Exercise) => (ex.unit === 'secs' ? 's' : 'reps');
const bestText = (ex: Exercise, b: Pick<Best, 'reps' | 'loadKg'>) => [`${b.reps} ${ex.unit === 'secs' ? 's' : b.reps === 1 ? 'rep' : 'reps'}`, loadText(ex, b.loadKg)].filter(Boolean).join(' · ');

/** One point per training day for an exercise: the weight most sets used and the best set's reps (or seconds). */
function liftHistory(sessions: Record<string, Session>, id: string): { date: string; load: number; reps: number }[] {
  const by = new Map<string, { date: string; load: number; reps: number }>();
  for (const s of Object.values(sessions).sort((a, b) => a.start - b.start)) {
    const sets = s.sets.filter((x) => x.exerciseId === id);
    if (sets.length) by.set(s.date, { date: s.date, load: usedLoad(sets), reps: Math.max(...sets.map(countReps)) });
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function Lifts() {
  const sessions = useStore((s) => s.sessions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showHome, setShowHome] = useState(false);
  const all = useMemo(
    () =>
      Object.entries(records(sessions))
        .filter(([id]) => EX[id])
        .map(([id, b]) => ({ id, ex: EX[id], b }))
        .sort((a, b) => (a.b.date === b.b.date ? a.ex.name.localeCompare(b.ex.name) : a.b.date < b.b.date ? 1 : -1)),
    [sessions],
  );
  const gym = all.filter((x) => !x.ex.home);
  const home = all.filter((x) => x.ex.home);

  const row = ({ id, ex, b }: (typeof all)[number]) => {
    const isOpen = openId === id;
    return (
      <div key={id} className="item" style={{ display: 'block', padding: 0 }}>
        <button className="prog-row" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : id)}>
          <span className="grow">
            <span className="bold">{ex.name}</span>
            <span className="small mut">{bestText(ex, b)} · {fmtDate(b.date)}</span>
          </span>
          <span className={`prog-chev ${isOpen ? 'open' : ''}`}><Icon name="right" size={18} /></span>
        </button>
        {isOpen && <LiftCharts ex={ex} sessions={sessions} />}
      </div>
    );
  };

  return (
    <section className="card stack" style={{ gap: 4 }} aria-label="Lift bests">
      <div className="between" style={{ marginBottom: 4 }}>
        <h2 className="h2">Lift bests</h2>
        <span className="small mut">Best set of each lift</span>
      </div>
      {!gym.length && <p className="empty">Your best set for each gym lift shows up here after your first workout. Clean reps count, heavy ugly ones don’t.</p>}
      {gym.map(row)}
      {home.length > 0 && (
        <div className="item" style={{ display: 'block', padding: 0 }}>
          <button className="prog-row" aria-expanded={showHome} onClick={() => setShowHome(!showHome)}>
            <span className="grow">
              <span className="bold">Before the gym</span>
              <span className="small mut">{home.length} best{home.length === 1 ? '' : 's'} from your home workouts</span>
            </span>
            <span className={`prog-chev ${showHome ? 'open' : ''}`}><Icon name="right" size={18} /></span>
          </button>
          {showHome && <div style={{ paddingLeft: 12 }}>{home.map(row)}</div>}
        </div>
      )}
    </section>
  );
}

function LiftCharts({ ex, sessions }: { ex: Exercise; sessions: Record<string, Session> }) {
  const hist = useMemo(() => liftHistory(sessions, ex.id), [sessions, ex.id]);
  const loaded = ex.loadable && hist.some((h) => h.load > 0);
  const unit = unitOf(ex);
  if (hist.length < 2)
    return (
      <div className="prog-open">
        <p className="small mut">One session so far. Do it again and a chart shows up here.</p>
      </div>
    );
  return (
    <div className="prog-open stack" style={{ gap: 10 }}>
      {loaded && (
        <div>
          <span className="label">{ex.load === 'assist' ? 'Help from the machine (less is better)' : 'Weight used'}</span>
          <LineChart label={`${ex.name} weight`} series={[{ name: 'Weight', color: 'var(--acc)', points: hist.map((h) => ({ date: h.date, v: h.load })) }]} format={(v) => `${plain(v)} kg`} tickFormat={plain} height={130} />
        </div>
      )}
      <div>
        <span className="label">{unit === 's' ? 'Longest hold each session' : 'Best set each session'}</span>
        <LineChart label={`${ex.name} ${unit === 's' ? 'seconds' : 'reps'}`} series={[{ name: unit === 's' ? 'Seconds' : 'Reps', color: 'var(--pro)', points: hist.map((h) => ({ date: h.date, v: h.reps })) }]} format={(v) => `${plain(v)} ${unit}`} tickFormat={plain} height={130} />
      </div>
      {loaded && <p className="small mut">When the weight goes up, reps drop back for a bit. That is the plan working.</p>}
    </div>
  );
}

// ----- Badges (moved here from Train) --------------------------------------------

function BadgeGrid() {
  const g = useGame();
  const earned = g.badges.filter((b) => b.earned).length;
  return (
    <section className="card stack" style={{ gap: 14 }} aria-label="Badges">
      <div className="between">
        <h2 className="h2">Badges</h2>
        <span className="small mut">{earned} of {g.badges.length}</span>
      </div>
      <div className="grid3" style={{ rowGap: 18 }}>
        {g.badges.map((b) => (
          <div key={b.id} className={`badge ${b.earned ? '' : 'locked'}`}>
            <span className="medal">
              <Icon name="medal" size={26} />
            </span>
            <span className="small bold">{b.name}</span>
            <span className="small mut" style={{ fontSize: 12 }}>{b.how}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ----- Log -----------------------------------------------------------------------

function entryText(m: Measure): string {
  const parts: string[] = [];
  if (m.weightKg != null) parts.push(fmtMetric('weightKg', m.weightKg));
  if (m.armL != null) parts.push(`L ${fmtMetric('armL', m.armL)}`);
  if (m.armR != null) parts.push(`R ${fmtMetric('armR', m.armR)}`);
  if (m.pushups != null) parts.push(`${fmtMetric('pushups', m.pushups)} push-ups`);
  if (m.plankS != null) parts.push(`plank ${fmtMetric('plankS', m.plankS)}`);
  if (m.chinups != null) parts.push(`${fmtMetric('chinups', m.chinups)} chin-ups`);
  if (m.pullups != null) parts.push(`${fmtMetric('pullups', m.pullups)} pull-ups`);
  return parts.join(' · ');
}

function LogList({ measures, onOpen }: { measures: Record<string, Measure>; onOpen: (o: Open) => void }) {
  const [all, setAll] = useState(false);
  const list = Object.values(measures).sort((a, b) => (a.date < b.date ? 1 : -1));
  const firstDate = list.at(-1)?.date;
  const shown = all ? list : list.slice(0, 6);
  return (
    <section className="card stack" style={{ gap: 4 }} aria-label="Measurement log">
      <div className="between" style={{ marginBottom: 4 }}>
        <h2 className="h2">Log</h2>
        <span className="small mut">Tap an entry to edit</span>
      </div>
      {!list.length && <p className="empty">Nothing logged yet.</p>}
      {shown.map((m) => (
        <div key={m.date} className="item" style={{ display: 'block', padding: 0 }}>
          <button className="prog-row" aria-label={`Edit ${longDate(m.date)}`} onClick={() => onOpen({ kind: isBench(m) ? 'retest' : 'weekly', date: m.date })}>
            <span className="grow">
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="bold">{fmtDate(m.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {m.date === firstDate && list.length > 0 && isBench(m) ? <span className="pill mut">Start</span> : isBench(m) ? <span className="pill mut">Retest</span> : null}
              </span>
              <span className="small mut">{entryText(m)}</span>
            </span>
            <span className="prog-chev"><Icon name="pencil" size={16} /></span>
          </button>
        </div>
      ))}
      {list.length > 6 && (
        <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
      <div className="grid2" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => onOpen({ kind: 'weekly' })}><Icon name="plus" size={18} /> Check-in</button>
        <button className="btn" onClick={() => onOpen({ kind: 'retest' })}><Icon name="plus" size={18} /> Retest</button>
      </div>
    </section>
  );
}

// ----- Sheets --------------------------------------------------------------------

type NumKey = Exclude<Metric, 'plankS'>;
/** `from` is where − and + start when the box is empty and there is no last value. */
const LIMITS: Record<NumKey, { min: number; max: number; step: number; unit: string; from: number }> = {
  weightKg: { min: 25, max: 200, step: 0.1, unit: 'kg', from: 60 },
  armL: { min: 15, max: 60, step: 0.1, unit: 'cm', from: 27 },
  armR: { min: 15, max: 60, step: 0.1, unit: 'cm', from: 27 },
  pushups: { min: 0, max: 200, step: 0.5, unit: 'reps', from: 0 },
  chinups: { min: 0, max: 60, step: 1, unit: 'reps', from: 0 },
  pullups: { min: 0, max: 60, step: 1, unit: 'reps', from: 0 },
};
const PLANK_CAP = 120;

/** A typed number: undefined when empty, null when it isn't a sensible value. */
function parseNum(text: string, key: NumKey): number | undefined | null {
  const t = text.trim().replace(',', '.');
  if (!t) return undefined;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const { min, max, step } = LIMITS[key];
  const v = +(Math.round(parseFloat(t) / step) * step).toFixed(2);
  return v < min || v > max ? null : v;
}

const clean = (t: string) => t.replace(',', '.').replace(/[^\d.]/g, '');
const str = (v: number | undefined) => (v == null ? '' : String(v));

function NumField({ k, label, value, onChange, last, stepper }: { k: NumKey; label: string; value: string; onChange: (v: string) => void; last?: number; stepper?: boolean }) {
  const { min, max, step, unit, from } = LIMITS[k];
  const bad = parseNum(value, k) === null;
  const nudge = (dir: number) => {
    const cur = parseNum(value, k);
    const base = typeof cur === 'number' ? cur + dir * step : (last ?? from);
    onChange(String(+Math.min(max, Math.max(min, base)).toFixed(1)));
  };
  const input = (
    <input className="input" style={{ textAlign: stepper ? 'center' : undefined }} type="text" inputMode="decimal" autoComplete="off" aria-label={`${label}, ${unit}`} aria-invalid={bad} placeholder={last != null ? `Last ${plain(last)}` : unit} value={value} onFocus={(e) => e.target.select()} onChange={(e) => onChange(clean(e.target.value))} />
  );
  return (
    <div className="field">
      <span>{label} <span style={{ fontWeight: 500 }}>· {unit}</span></span>
      {stepper ? (
        <div className="row">
          <button type="button" className="btn icon" style={{ flex: 'none', minHeight: 52, width: 52 }} aria-label={`Less ${label}`} onClick={() => nudge(-1)}><Icon name="minus" /></button>
          {input}
          <button type="button" className="btn icon" style={{ flex: 'none', minHeight: 52, width: 52 }} aria-label={`More ${label}`} onClick={() => nudge(1)}><Icon name="plus" /></button>
        </div>
      ) : (
        input
      )}
      {bad && <small className="prog-err" role="alert">Between {min} and {max} {unit}.</small>}
    </div>
  );
}

/** The newest value of a metric logged before `date` (for "Last 60.2" hints). */
const lastBefore = (measures: Record<string, Measure>, metric: Metric, date: string) => series(measures, metric).filter((p) => p.date < date).at(-1)?.v;

type Vals = Record<NumKey, string> & { plankM: string; plankSec: string };
function valsOf(m: Measure | undefined): Vals {
  return {
    weightKg: str(m?.weightKg),
    armL: str(m?.armL),
    armR: str(m?.armR),
    pushups: str(m?.pushups),
    chinups: str(m?.chinups),
    pullups: str(m?.pullups),
    plankM: m?.plankS == null ? '' : String(Math.floor(m.plankS / 60)),
    plankSec: m?.plankS == null ? '' : String(Math.round(m.plankS % 60)),
  };
}

const BEST_WORD: Partial<Record<Metric, string>> = { pushups: 'push-ups', plankS: 'plank', chinups: 'chin-ups', pullups: 'pull-ups', armL: 'left arm', armR: 'right arm' };

function MeasureSheet({ kind, date: editing, onClose }: { kind: Kind; date?: string; onClose: () => void }) {
  const measures = useStore((s) => s.measures);
  const today = todayKey();
  const [date, setDate] = useState(editing ?? today);
  const [vals, setVals] = useState<Vals>(() => valsOf(measures[editing ?? today]));
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const retest = kind === 'retest';
  const set = (k: keyof Vals) => (v: string) => (setErr(''), setVals((x) => ({ ...x, [k]: v })));
  const pickDate = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) return;
    setDate(d);
    setVals(valsOf(measures[d]));
    setErr('');
  };
  const last = (k: Metric) => lastBefore(measures, k, date);
  const lastPlank = last('plankS');
  const plankTyped = vals.plankM.trim() !== '' || vals.plankSec.trim() !== '';
  const plankRaw = (parseInt(vals.plankM || '0', 10) || 0) * 60 + (parseInt(vals.plankSec || '0', 10) || 0);
  const plankBad = plankTyped && (parseInt(vals.plankSec || '0', 10) || 0) > 59;
  const exists = !!measures[date];

  const save = () => {
    const keys: NumKey[] = retest ? ['pushups', 'chinups', 'pullups', 'weightKg', 'armL', 'armR'] : ['weightKg', 'armL', 'armR'];
    const patch: Partial<Measure> = {};
    for (const k of keys) {
      const v = parseNum(vals[k], k);
      if (v === null) return setErr(`Check ${METRIC_LABEL[k].toLowerCase()}: it should be between ${LIMITS[k].min} and ${LIMITS[k].max}.`);
      patch[k] = v;
    }
    if (retest) {
      if (plankBad) return setErr('Check the plank: seconds go from 0 to 59.');
      patch.plankS = plankTyped ? Math.min(PLANK_CAP, plankRaw) : undefined;
    }
    const filled = Object.values(patch).some((v) => v != null);
    if (!filled) return setErr(exists ? 'Everything is empty. To remove this entry, use Delete.' : 'Add at least one number first.');
    const before = measures[date];
    useStore.getState().setMeasure(date, patch);
    const after = useStore.getState().measures;
    // A "new best" only when this is the newest entry and the number actually changed.
    const fresh = freshBests(after).filter((k) => latest(after, k)?.date === date && before?.[k] !== after[date]?.[k]);
    const capped = retest && plankTyped && plankRaw > PLANK_CAP ? ' Plank counted as 2:00, the cap.' : '';
    toast(fresh.length ? `Saved. New best: ${fresh.map((k) => `${BEST_WORD[k]} ${fmtMetric(k, after[date][k] as number)}`).join(', ')}.${capped}` : `Saved.${capped}`);
    onClose();
  };

  return (
    <Sheet onClose={onClose} label={retest ? 'Benchmark retest' : 'Weekly check-in'}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">{editing ? `Edit ${fmtDate(editing)}` : retest ? '4-week retest' : 'Weekly check-in'}</h2>
        <button className="btn sm icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>

      {!editing && (
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={date} max={today} onChange={(e) => pickDate(e.target.value)} />
        </label>
      )}
      {!editing && exists && <p className="small mut">You already logged on {fmtDate(date)}. Saving updates that entry.</p>}

      {retest && (
        <>
          <div className="tile stack" style={{ gap: 6, padding: 14 }}>
            <span className="bold">How to test</span>
            <ul className="prog-how">
              <li>Test fresh: at the start of a session after your warm-up, or on a rest day.</li>
              <li>Push-ups and chin-ups: stop at your last clean rep. Never grind or kip.</li>
              <li>Plank: stop when your hips sag. It is capped at 2:00.</li>
              <li>Stop if anything hurts.</li>
            </ul>
          </div>
          <NumField k="pushups" label="Push-ups" value={vals.pushups} onChange={set('pushups')} last={last('pushups')} stepper />
          <p className="small mut" style={{ marginTop: -8 }}>Full reps in one go. A half counts: 4 and a half is 4.5.</p>
          <div className="field">
            <span>Plank <span style={{ fontWeight: 500 }}>· minutes and seconds</span></span>
            <div className="prog-time">
              <input className="input" style={{ textAlign: 'center' }} type="text" inputMode="numeric" maxLength={1} aria-label="Plank minutes" placeholder={lastPlank != null ? `Last ${Math.floor(lastPlank / 60)}` : 'min'} value={vals.plankM} onFocus={(e) => e.target.select()} onChange={(e) => set('plankM')(e.target.value.replace(/\D/g, ''))} />
              <span className="num" style={{ fontSize: 22 }}>:</span>
              <input className="input" style={{ textAlign: 'center' }} type="text" inputMode="numeric" maxLength={2} aria-label="Plank seconds" aria-invalid={plankBad} placeholder={lastPlank != null ? `Last ${String(Math.round(lastPlank % 60)).padStart(2, '0')}` : 'sec'} value={vals.plankSec} onFocus={(e) => e.target.select()} onChange={(e) => set('plankSec')(e.target.value.replace(/\D/g, ''))} />
            </div>
            {plankBad && <small className="prog-err" role="alert">Seconds go from 0 to 59.</small>}
            {!plankBad && plankTyped && plankRaw > PLANK_CAP && <span className="small mut">Nice. It counts as 2:00, the cap.</span>}
          </div>
          <NumField k="chinups" label="Chin-ups (palms facing you)" value={vals.chinups} onChange={set('chinups')} last={last('chinups')} stepper />
          <NumField k="pullups" label="Pull-ups (palms away)" value={vals.pullups} onChange={set('pullups')} last={last('pullups')} stepper />
          <span className="label" style={{ marginTop: 4 }}>Weight and arms (leave empty to skip)</span>
          <NumField k="weightKg" label="Bodyweight" value={vals.weightKg} onChange={set('weightKg')} last={last('weightKg')} />
          <div className="grid2">
            <NumField k="armL" label="Left arm" value={vals.armL} onChange={set('armL')} last={last('armL')} />
            <NumField k="armR" label="Right arm" value={vals.armR} onChange={set('armR')} last={last('armR')} />
          </div>
        </>
      )}

      {!retest && (
        <>
          <NumField k="weightKg" label="Bodyweight" value={vals.weightKg} onChange={set('weightKg')} last={last('weightKg')} stepper />
          <NumField k="armL" label="Left arm" value={vals.armL} onChange={set('armL')} last={last('armL')} stepper />
          <NumField k="armR" label="Right arm" value={vals.armR} onChange={set('armR')} last={last('armR')} stepper />
          <p className="small mut">Weigh in the morning before breakfast. Arms: flexed, around the widest point, tape snug not tight. Skip anything you can’t measure today.</p>
        </>
      )}

      {err && <p className="prog-err" role="alert">{err}</p>}
      <button className="btn primary block" onClick={save}>Save</button>
      {editing &&
        (confirm ? (
          <div className="grid2">
            <button className="btn" onClick={() => setConfirm(false)}>Keep it</button>
            <button className="btn danger" onClick={() => (useStore.getState().deleteMeasure(editing), toast('Entry deleted.'), onClose())}>Yes, delete</button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setConfirm(true)}><Icon name="trash" size={18} /> Delete entry</button>
        ))}
    </Sheet>
  );
}

export const WeeklySheet = (p: { date?: string; onClose: () => void }) => <MeasureSheet kind="weekly" {...p} />;
export const RetestSheet = (p: { date?: string; onClose: () => void }) => <MeasureSheet kind="retest" {...p} />;

