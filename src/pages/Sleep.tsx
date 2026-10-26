import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, atOn, fmtDate, hhmmOf } from '../lib/dates';
import { clock12, clockOf, durationMin, hm, idealBedtime, minsOf, nightKey, onTime, samsungNights, sleepStats, wakeOffset } from '../lib/sleep';
import { currentAi, tonightPlan, useCoach } from '../lib/coach';
import { friendlyError, hasAi } from '../lib/ai';
import { Head, Icon, ProfileLink, Sheet, toast, useGame, useToday } from '../components/ui';
import { useFuelData } from '../components/data';
import type { Night } from '../lib/types';

const QUALITY = ['Awful', 'Poor', 'OK', 'Good', 'Great'];

export default function Sleep() {
  const today = useToday();
  const nights = useStore((s) => s.nights);
  const settings = useStore((s) => s.settings);
  const { goingToSleep, wokeUp, setNight } = useStore.getState();
  const [edit, setEdit] = useState<string | null>(null);
  const last = nights[today];
  const dur = last ? durationMin(last) : null;
  const hour = new Date().getHours();
  const tonightKey = nightKey(Date.now());
  const pendingBed = nights[tonightKey]?.bed != null && nights[tonightKey]?.wake == null && tonightKey !== today;
  const evening = hour >= 17 || hour < 4;

  return (
    <main>
      <Head over={`Up at ${clock12(settings.wakeTarget)} · lights out ${clock12(settings.bedtime)}`} title="Sleep" right={<ProfileLink />} />
      <div className="page">
        <section className="card night stack" style={{ gap: 14 }} aria-label="Last night">
          <div className="between" style={{ alignItems: 'flex-end' }}>
            <div>
              <span className="small bold" style={{ color: 'var(--sleep-ink)' }}>Last night</span>
              <p className="num" style={{ fontSize: 44, lineHeight: 1 }}>{dur != null ? hm(dur) : '–'}</p>
            </div>
            {last && (
              <span className="small" style={{ color: 'var(--sleep-ink)', textAlign: 'right' }}>
                {last.bed ? clockOf(last.bed) : '?'} → {last.wake ? clockOf(last.wake) : '?'}
              </span>
            )}
          </div>
          {last?.deep != null && <Stages n={last} />}
          {last ? (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ color: 'var(--sleep-ink)' }}>
                {last.source === 'samsung' ? `From Samsung Health${last.score ? ` · score ${last.score}` : ''}` : 'How did you sleep?'}
              </span>
              <div className="grid4" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }} role="group" aria-label="Sleep quality">
                {QUALITY.map((q, i) => (
                  <button key={q} className="chip" style={{ padding: 0, fontSize: 13, background: last.quality === i + 1 ? 'var(--sleep)' : 'var(--s1)', color: last.quality === i + 1 ? 'var(--on-sleep)' : 'var(--ink)' }} aria-pressed={last.quality === i + 1} onClick={() => setNight(today, { quality: i + 1 })}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="small" style={{ color: 'var(--sleep-ink)' }}>Tap “Going to sleep” tonight and “I’m up” in the morning, or add the night by hand.</p>
          )}
        </section>

        <div className="row">
          {pendingBed ? (
            <button className="btn sleep" style={{ flex: 1 }} onClick={() => (wokeUp(), toast('Morning. Logged.'))}>
              <Icon name="sun" size={20} /> I’m up
            </button>
          ) : evening ? (
            <button className="btn sleep" style={{ flex: 1 }} onClick={() => (goingToSleep(), toast(`Sleep well. Up at ${clock12(settings.wakeTarget)}.`))}>
              <Icon name="moon" size={20} /> Going to sleep
            </button>
          ) : last?.wake == null ? (
            <button className="btn sleep" style={{ flex: 1 }} onClick={() => (wokeUp(), toast('Morning. Logged.'))}>
              <Icon name="sun" size={20} /> I’m up
            </button>
          ) : null}
          <button className="btn ghost" style={{ flex: pendingBed || evening || last?.wake == null ? undefined : 1 }} onClick={() => setEdit(today)}>
            <Icon name="plus" size={18} /> {last ? 'Edit night' : 'Add night'}
          </button>
        </div>

        <Tonight />
        <Week onPick={setEdit} />
        <Insights />
        <SamsungImport />
        <Recent onPick={setEdit} />
      </div>
      {edit && <NightSheet date={edit} onClose={() => setEdit(null)} />}
    </main>
  );
}

function Stages({ n }: { n: Night }) {
  const parts: [string, number | undefined, string][] = [
    ['Deep', n.deep, '#4A55B8'],
    ['Light', n.light, '#7883E8'],
    ['REM', n.rem, 'var(--sleep-ink)'],
    ['Awake', n.awake, 'var(--s3)'],
  ];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="stages" aria-hidden="true">
        {parts.map(([l, v, c]) => (v ? <i key={l} style={{ flex: v, background: c }} /> : null))}
      </div>
      <span className="small" style={{ color: 'var(--sleep-ink)' }}>
        {parts.filter(([, v]) => v).map(([l, v]) => `${l} ${v! >= 60 ? hm(v!) : `${v} m`}`).join(' · ')}
      </span>
    </div>
  );
}

function Tonight() {
  const today = useToday();
  const t = useCoach((c) => c.tonight);
  const bedtime = useStore((s) => s.settings.bedtime);
  const [busy, setBusy] = useState(false);
  const ai = hasAi(currentAi());
  const hour = new Date().getHours();
  const fresh = t?.date === today;
  const load = () => {
    setBusy(true);
    tonightPlan()
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (ai && !fresh && hour >= 15 && !busy) load();
  }, [ai, today]);
  if (!ai) {
    return (
      <section className="card stack" style={{ gap: 6 }}>
        <span className="row label"><Icon name="spark" size={16} /> Tonight</span>
        <p>Screens off by {clock12(minsToHhmm(minsOf(bedtime) - 40))}, lights out at {clock12(bedtime)}.</p>
        <p className="small mut">Add an AI key in Fuel Log for a plan that looks at your food and training.</p>
      </section>
    );
  }
  return (
    <section className="card stack" style={{ gap: 8 }} aria-label="Tonight's plan">
      <div className="between" style={{ alignItems: 'center' }}>
        <span className="row label" style={{ color: 'var(--sleep)' }}><Icon name="spark" size={16} /> Tonight’s plan</span>
        <button className="btn sm icon" aria-label="New plan" disabled={busy} onClick={load}>
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {fresh && t ? (
        <>
          <div className="grid2">
            <div className="tile">
              <span className="small mut">Screens off</span>
              <p className="num" style={{ fontSize: 22 }}>{clock12(t.screensOff)}</p>
            </div>
            <div className="tile">
              <span className="small mut">Lights out</span>
              <p className="num" style={{ fontSize: 22 }}>{clock12(bedtime)}</p>
            </div>
          </div>
          {t.lastFood && <p className="small"><span className="bold">Food: </span>{t.lastFood}</p>}
          {t.plan && <p className="small mut">{t.plan}</p>}
        </>
      ) : (
        <p className="small mut">{busy ? 'Working out tonight…' : hour < 15 ? 'Your plan for tonight shows up after 3 pm. Tap refresh to get it now.' : 'Tap refresh for tonight’s plan.'}</p>
      )}
    </section>
  );
}

const minsToHhmm = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

function Week({ onPick }: { onPick: (d: string) => void }) {
  const today = useToday();
  const nights = useStore((s) => s.nights);
  const goal = useStore((s) => s.settings.sleepGoalH);
  const wake = useStore((s) => s.settings.wakeTarget);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const st = sleepStats(nights, today, 7, goal, wake);
  const max = 11 * 60;
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Last 7 nights">
      <div className="between">
        <h2 className="h2">Last 7 nights</h2>
        <span className="small mut">{st.avgMin != null ? `avg ${hm(st.avgMin)}` : 'no nights yet'}</span>
      </div>
      <div className="bars">
        <div className="goal" style={{ bottom: `${((goal * 60) / max) * 100}%` }} aria-hidden="true" />
        {days.map((d) => {
          const m = nights[d] ? durationMin(nights[d]) : null;
          return (
            <button key={d} onClick={() => onPick(d)} aria-label={`${fmtDate(d)}: ${m != null ? hm(m) : 'no data'}`} style={{ background: 'none', border: 0, padding: 0, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <i className={m != null && m < goal * 60 - 30 ? 'short' : ''} style={{ width: '100%', height: `${m != null ? Math.min(100, (m / max) * 100) : 3}%` }} />
            </button>
          );
        })}
      </div>
      <div className="week" style={{ gap: 8 }}>
        {days.map((d) => {
          const n = nights[d];
          return (
            <div key={d} style={{ color: n && onTime(n, wake) ? 'var(--acc)' : undefined }}>
              {fmtDate(d, { weekday: 'narrow' })}
            </div>
          );
        })}
      </div>
      <p className="small mut">Dashed line: your {goal} h goal. Green days: up on time.</p>
    </section>
  );
}

function Insights() {
  const today = useToday();
  const nights = useStore((s) => s.nights);
  const sessions = useStore((s) => s.sessions);
  const { sleepGoalH: goal, wakeTarget: wake, bedtime } = useStore((s) => s.settings);
  const fuel = useFuelData();
  const g = useGame();
  const lines = useMemo(() => {
    const st = sleepStats(nights, today, 14, goal, wake);
    const out: string[] = [];
    if (st.nights < 3) return ['Log a few nights to see your patterns here.'];
    if (st.avgMin != null) out.push(st.avgMin >= goal * 60 - 15 ? `You’re averaging ${hm(st.avgMin)}, right on your goal.` : `You’re averaging ${hm(st.avgMin)}, ${hm(goal * 60 - st.avgMin)} short of your goal. That’s ${hm(st.debtMin)} of sleep debt over two weeks.`);
    out.push(`Up on time ${st.onTime} of ${st.withWake} mornings${g.wake ? `, ${g.wake} in a row now` : ''}.`);
    if (st.bedSpread != null) out.push(st.bedSpread <= 30 ? `Bedtime is steady (about ${clock12(st.avgBed!)}). Keep it that way.` : `Bedtime moves around by about ${st.bedSpread} min. A steady bedtime makes 6 am easier.`);
    if (st.weekendDrift != null && st.weekendDrift >= 30) out.push(`Weekend bedtimes are ${st.weekendDrift} min later. With the same wake time, that’s lost sleep.`);
    // Late last meal (from Fuel Log) vs sleep quality.
    if (fuel) {
      const pairs = Object.values(nights)
        .filter((n) => n.bed && n.quality && n.date >= addDays(today, -28))
        .map((n) => ({ q: n.quality!, late: (() => { const f = fuel.days[addDays(n.date, -1)]; return f?.last ? n.bed! - f.last < 2.5 * 3_600_000 : null; })() }))
        .filter((p) => p.late != null);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const late = pairs.filter((p) => p.late).map((p) => p.q);
      const early = pairs.filter((p) => !p.late).map((p) => p.q);
      if (late.length >= 2 && early.length >= 2 && avg(early) - avg(late) >= 0.5) out.push('You rate your sleep lower when you eat within 2.5 h of bed. Have the last big meal earlier.');
    }
    // Training days vs rest days.
    const trained = new Set(Object.values(sessions).map((s) => s.date));
    const after = Object.values(nights).filter((n) => trained.has(addDays(n.date, -1))).map(durationMin).filter((x): x is number => x != null);
    const rest = Object.values(nights).filter((n) => !trained.has(addDays(n.date, -1))).map(durationMin).filter((x): x is number => x != null);
    if (after.length >= 3 && rest.length >= 3) {
      const d = Math.round(after.reduce((a, b) => a + b, 0) / after.length - rest.reduce((a, b) => a + b, 0) / rest.length);
      if (Math.abs(d) >= 20) out.push(d > 0 ? `You sleep ${d} min longer after a workout. Your body is using it.` : `You sleep ${-d} min less after workouts. Train earlier or wind down longer on those days.`);
    }
    const ideal = idealBedtime(wake, goal);
    if (ideal !== bedtime) out.push(`For ${goal} h before ${clock12(wake)}, lights out at ${clock12(ideal)}. Your coach set ${clock12(bedtime)}.`);
    return out;
  }, [nights, sessions, fuel, today, goal, wake, bedtime, g.wake]);
  return (
    <section className="card stack" style={{ gap: 10 }} aria-label="Insights">
      <h2 className="h2">Insights</h2>
      {lines.map((l) => (
        <p key={l} className="row small" style={{ alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--sleep)', marginTop: 7, flex: 'none' }} />
          {l}
        </p>
      ))}
    </section>
  );
}

function SamsungImport() {
  const importNights = useStore((s) => s.importNights);
  const [open, setOpen] = useState(false);
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <button className="row" style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink)', textAlign: 'left' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grow">
          <span className="h2" style={{ display: 'block' }}>Samsung Health</span>
          <span className="small mut">Import sleep from your Galaxy Watch</span>
        </span>
        <Icon name={open ? 'minus' : 'plus'} size={18} />
      </button>
      {open && (
        <>
          <ol className="small mut" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Samsung Health → menu → Settings → Download personal data → Download.</li>
            <li>Open the downloaded folder in Files.</li>
            <li>Pick the two files that start with <b>com.samsung.shealth.sleep</b> and <b>com.samsung.health.sleep_stage</b> (the sleep one alone also works).</li>
          </ol>
          <label className="btn sleep">
            <Icon name="upload" size={18} /> Choose CSV files
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              className="sr"
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (!files.length) return;
                const texts = await Promise.all(files.map((f) => f.text()));
                const found = samsungNights(texts);
                if (!found.length) return toast('No sleep found in those files. Pick the com.samsung.shealth.sleep file.');
                const n = importNights(found);
                toast(`Imported ${n} night${n === 1 ? '' : 's'} from Samsung Health`);
              }}
            />
          </label>
          <p className="small mut">Nights you typed in yourself are kept. Your quality ratings stay.</p>
        </>
      )}
    </section>
  );
}

function Recent({ onPick }: { onPick: (d: string) => void }) {
  const nights = useStore((s) => s.nights);
  const wake = useStore((s) => s.settings.wakeTarget);
  const list = Object.values(nights).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
  if (!list.length) return null;
  return (
    <section className="card" style={{ padding: '14px 18px 6px' }} aria-label="Recent nights">
      <h2 className="h2" style={{ marginBottom: 4 }}>Recent nights</h2>
      {list.map((n) => {
        const m = durationMin(n);
        const off = wakeOffset(n, wake);
        return (
          <button key={n.date} className="item" style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--line)', color: 'var(--ink)', textAlign: 'left' }} onClick={() => onPick(n.date)}>
            <span className="grow">
              <span className="bold" style={{ display: 'block' }}>{fmtDate(n.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="small mut">
                {n.bed ? clockOf(n.bed) : '?'} → {n.wake ? clockOf(n.wake) : '?'}
                {n.quality ? ` · ${QUALITY[n.quality - 1]}` : ''}
                {n.source === 'samsung' ? ' · watch' : ''}
              </span>
            </span>
            <span className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
              <span className="bold">{m != null ? hm(m) : '–'}</span>
              {off != null && <span className="small" style={{ color: off <= 15 ? 'var(--acc)' : 'var(--warn)' }}>{off <= 15 ? 'on time' : `+${off} min`}</span>}
            </span>
          </button>
        );
      })}
    </section>
  );
}

function NightSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const n = useStore((s) => s.nights[date]);
  const { setNight, deleteNight } = useStore.getState();
  const [d, setD] = useState(date);
  const [bed, setBed] = useState(n?.bed ? hhmmOf(n.bed) : '21:30');
  const [wake, setWake] = useState(n?.wake ? hhmmOf(n.wake) : '06:00');
  const [q, setQ] = useState<number | undefined>(n?.quality);
  const save = () => {
    // A bedtime after noon belongs to the evening before.
    const bedAt = atOn(bed >= '12:00' ? addDays(d, -1) : d, bed);
    const wakeAt = atOn(d, wake);
    if (wakeAt <= bedAt) return toast('Wake time has to be after bedtime.');
    if (d !== date && n) deleteNight(date);
    setNight(d, { bed: bedAt, wake: wakeAt, quality: q, source: n?.source === 'samsung' && d === date ? 'samsung' : 'manual' });
    toast('Night saved');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label="Night">
      <h2 className="h2">{n ? 'Edit night' : 'Add a night'}</h2>
      <label className="field">
        <span>Morning you woke up</span>
        <input className="input" type="date" value={d} onChange={(e) => e.target.value && setD(e.target.value)} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Lights out</span>
          <input className="input" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        </label>
        <label className="field">
          <span>Woke up</span>
          <input className="input" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">How did you sleep?</span>
        <div className="grid4" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
          {QUALITY.map((l, i) => (
            <button key={l} className="chip" style={{ padding: 0, fontSize: 13 }} aria-pressed={q === i + 1} onClick={() => setQ(q === i + 1 ? undefined : i + 1)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        {n && (
          <button className="btn danger" aria-label="Delete night" onClick={() => (deleteNight(date), onClose())}>
            <Icon name="trash" size={18} />
          </button>
        )}
        <button className="btn sleep block" style={{ flex: 1 }} onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
