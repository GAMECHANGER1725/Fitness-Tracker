import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { EX, loadText, targetText } from '../lib/exercises';
import { WEEKDAYS, minutes, phaseOf, plannedDay, slotsFor } from '../lib/program';
import { due } from '../lib/measures';
import { REST_DAY, SAFETY } from '../lib/guide';
import { addDays, dateOf, daysBetween, fmtDate, weekStart } from '../lib/dates';
import { clock12, clockOf, durationMin, hm, onTime, wakeOffset } from '../lib/sleep';
import { BAND_LABEL } from '../lib/readiness';
import { currentAi, morningBriefing, useCoach } from '../lib/coach';
import { friendlyError, hasAi } from '../lib/ai';
import { Head, Icon, ProfileLink, go, toast, useGame, useToday } from '../components/ui';
import { useFuelData, useReadiness } from '../components/data';
import type { PlanDay } from '../lib/types';

export default function Today() {
  const today = useToday();
  const program = useStore((s) => s.program);
  const active = useStore((s) => s.active);
  const sessions = useStore((s) => s.sessions);
  const startWorkout = useStore((s) => s.startWorkout);
  const ready = useReadiness();
  const planned = plannedDay(program, today);
  const doneToday = Object.values(sessions).filter((s) => s.date === today);
  const [pick, setPick] = useState(false);
  const easy = ready.band === 'easy';

  const start = (day: PlanDay) => {
    startWorkout(day, easy);
    go('workout');
  };

  const day = planned;
  const notYet = !!program.start && today < program.start;
  // Before the first session, show what that session will be.
  const listDate = notYet ? program.start! : today;
  const listDay = notYet ? plannedDay(program, listDate) : day;
  const slots = listDay ? slotsFor(program, listDay, listDate, easy && !notYet) : [];
  const phase = phaseOf(program, listDate);
  const measures = useStore((s) => s.measures);
  const check = due(measures, today);
  // The next gym day after today, for rest days.
  let next: { date: string; name: string } | null = null;
  for (let i = 1; i <= 7 && !next; i++) {
    const k = addDays(today, i);
    const d = plannedDay(program, k);
    if (d && (!program.start || k >= program.start)) next = { date: k, name: d.name };
  }

  return (
    <main>
      <Head over={fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })} title={doneToday.length ? 'Done for today' : day && !notYet ? day.name : notYet ? 'Gym starts soon' : 'Rest day'} right={<ProfileLink />} />
      <div className="page">
        <WakeCard />

        <section className="card hot stack" style={{ gap: 14 }} aria-label="Readiness">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div>
              <span className="small bold" style={{ opacity: 0.75 }}>Readiness</span>
              <p className="num" style={{ fontSize: 48, lineHeight: 1 }}>{ready.score}</p>
            </div>
            <span className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="pill">{phase.label}</span>
              <span className="pill">{BAND_LABEL[ready.band]}</span>
            </span>
          </div>
          <Briefing fallback={ready.notes.slice(0, 2).join('. ') + (ready.notes.length ? '.' : '')} />
          {active ? (
            <button className="btn block" onClick={() => go('workout')}>
              <Icon name="play" size={18} fill /> Resume {active.name}
            </button>
          ) : doneToday.length ? (
            <p className="bold">{doneToday.map((s) => s.name).join(' and ')} done. Eat well and get to bed on time.</p>
          ) : notYet ? (
            <p className="bold">
              First gym session: {next ? `${next.name}, ` : ''}{fmtDate(program.start!, { weekday: 'long', day: 'numeric', month: 'short' })}{daysBetween(today, program.start!) === 1 ? ' (tomorrow)' : ''}. Pack a water bottle and a towel.
            </p>
          ) : day ? (
            <button className="btn block" onClick={() => start(day)}>
              <Icon name="play" size={18} fill /> Start workout · {minutes(slots)} min{easy ? ', lighter' : ''}
            </button>
          ) : (
            <button className="btn block" onClick={() => setPick(!pick)}>
              Rest day{next ? ` · next: ${next.name}, ${fmtDate(next.date, { weekday: 'short' })}` : ''}
            </button>
          )}
          {pick && !day && !notYet && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="small bold" style={{ width: '100%' }}>Training anyway? Resting is part of the plan, but if you swapped days:</span>
              {program.days.map((d) => (
                <button key={d.id} className="chip" onClick={() => start(d)}>{d.name}</button>
              ))}
            </div>
          )}
        </section>

        {(check.weekly || check.retest) && (
          <a href={`#/progress?log=${check.retest ? 'retest' : 'weekly'}`} className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--ink)', textDecoration: 'none' }}>
            <span style={{ width: 46, height: 46, borderRadius: 16, background: 'var(--acc-soft)', color: 'var(--acc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name="chart" />
            </span>
            <span className="grow">
              <span className="bold" style={{ display: 'block' }}>{check.retest ? '4-week retest is due' : 'Weekly check-in'}</span>
              <span className="small mut">{check.retest ? 'Push-ups, plank, chin-ups, weight and arms' : 'Weigh in and measure both arms'}</span>
            </span>
            <Icon name="right" />
          </a>
        )}

        {(notYet || (!day && !doneToday.length)) && (
          <section className="card stack" style={{ gap: 10 }} aria-label={notYet ? 'Before your first session' : 'Rest day'}>
            <h2 className="h2">{notYet ? 'Before your first session' : REST_DAY.title}</h2>
            {(notYet ? SAFETY : REST_DAY).lines.map((l) => (
              <div key={l} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <span className="acc" style={{ marginTop: 1 }}><Icon name="check" size={18} stroke={3} /></span>
                <span className="small">{l}</span>
              </div>
            ))}
            <a href="#/train?tab=guide" className="small bold" style={{ textDecoration: 'none' }}>More in the guide</a>
          </section>
        )}

        {listDay && !doneToday.length && (
          <section className="card" style={{ padding: '6px 18px' }} aria-label={notYet ? 'Your first session' : 'Today’s exercises'}>
            <p className="small mut" style={{ paddingTop: 12 }}>{notYet ? `Your first session, ${listDay.name}: ` : ''}{phase.note}</p>
            {slots.map((s) => {
              const e = EX[s.exerciseId];
              return (
                <div className="item" key={s.exerciseId}>
                  <span className="grow bold">{e?.name ?? s.exerciseId}</span>
                  <span className="small mut" style={{ textAlign: 'right' }}>
                    {s.sets} × {targetText(e, s.low, s.high)}
                    {s.loadKg ? ` · ${loadText(e, s.loadKg)}` : ''}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        <FuelStrip />
        <WeekStrip />
      </div>
    </main>
  );
}

function WakeCard() {
  const today = useToday();
  const night = useStore((s) => s.nights[today]);
  const wakeTarget = useStore((s) => s.settings.wakeTarget);
  const wokeUp = useStore((s) => s.wokeUp);
  const g = useGame();
  const hour = new Date().getHours();
  if (night?.wake == null) {
    if (hour >= 14) return null;
    return (
      <button
        className="card"
        style={{ display: 'flex', alignItems: 'center', gap: 14, border: 0, textAlign: 'left', color: 'var(--ink)', width: '100%' }}
        onClick={() => {
          wokeUp();
          const n = useStore.getState().nights[today];
          toast(onTime(n, wakeTarget) ? 'Up on time. Nice.' : 'Logged. Aim for the target tomorrow.');
        }}
      >
        <span style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--sleep)', color: 'var(--on-sleep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="sun" size={26} />
        </span>
        <span className="grow">
          <span className="h2" style={{ display: 'block' }}>I’m up</span>
          <span className="small mut">Target {clock12(wakeTarget)}{g.wake ? ` · ${g.wake}-day streak` : ''}</span>
        </span>
        <Icon name="right" />
      </button>
    );
  }
  const off = wakeOffset(night, wakeTarget) ?? 0;
  const dur = durationMin(night);
  return (
    <a href="#/sleep" className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--ink)', textDecoration: 'none' }}>
      <span style={{ width: 46, height: 46, borderRadius: 16, background: 'var(--sleep-soft)', color: 'var(--sleep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name="sun" />
      </span>
      <span className="grow">
        <span className="bold" style={{ display: 'block' }}>
          Up at {clockOf(night.wake)}, {off <= 15 ? (off < -5 ? 'early' : 'on time') : `${off} min late`}
        </span>
        <span className="small mut">
          {dur != null ? `${hm(dur)} sleep` : 'No bedtime logged'}
          {g.wake ? ` · ${g.wake}-day wake streak` : ''}
        </span>
      </span>
    </a>
  );
}

/** The coach's morning briefing (once a day, with an AI key), else readiness notes. */
function Briefing({ fallback }: { fallback: string }) {
  const today = useToday();
  const b = useCoach((c) => c.briefing);
  const [busy, setBusy] = useState(false);
  const ai = hasAi(currentAi());
  const fresh = b?.date === today;
  const load = () => {
    setBusy(true);
    morningBriefing()
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (ai && !fresh && !busy) {
      useCoach.getState().set({ briefing: b ? { ...b, date: today } : null }); // one try a day
      load();
    }
  }, [ai, today]);
  if (fresh && b) {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <p className="bold" style={{ fontSize: 16 }}>{b.headline}</p>
        {b.train && <p className="small" style={{ opacity: 0.9 }}>{b.train}</p>}
      </div>
    );
  }
  return <p className="bold" style={{ fontSize: 15 }}>{busy ? 'Your coach is reading last night and yesterday…' : fallback || 'Log sleep and food to sharpen this.'}</p>;
}

function FuelStrip() {
  const today = useToday();
  const fuel = useFuelData();
  const t = fuel?.targets;
  const f = fuel?.days[today];
  const text = !fuel ? 'Link Fuel Log to see your food here' : t ? `${Math.max(0, Math.round(t.kcal - (f?.kcal ?? 0))).toLocaleString('en-AU')} kcal and ${Math.max(0, Math.round(t.protein - (f?.protein ?? 0)))} g protein to go` : 'No targets in Fuel Log yet';
  return (
    <a href="#/fuel" className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--ink)', textDecoration: 'none' }}>
      <span style={{ width: 8, height: 40, borderRadius: 999, background: 'var(--fuel)', flex: 'none' }} />
      <span className="grow">
        <span className="small mut" style={{ display: 'block' }}>From Fuel Log</span>
        <span className="bold">{text}</span>
      </span>
      <Icon name="right" />
    </a>
  );
}

function WeekStrip() {
  const today = useToday();
  const program = useStore((s) => s.program);
  const sessions = useStore((s) => s.sessions);
  const ws = weekStart(today);
  const done = new Set(Object.values(sessions).map((s) => s.date));
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="This week">
      <div className="between">
        <h2 className="h2">This week</h2>
        <a href="#/train" className="small bold" style={{ textDecoration: 'none' }}>Plan</a>
      </div>
      <div className="week">
        {WEEKDAYS.map((w, i) => {
          const k = addDays(ws, i);
          const plan = program.week[i];
          const cls = done.has(k) ? 'done' : plan && k >= today ? 'plan' : '';
          return (
            <div key={w}>
              <i className={`${cls}${k === today ? ' today' : ''}`} aria-label={`${w}: ${done.has(k) ? 'done' : plan ? 'planned' : 'rest'}`}>
                {done.has(k) ? <Icon name="check" size={18} stroke={3} /> : dateOf(k).getDate()}
              </i>
              {w}
            </div>
          );
        })}
      </div>
    </section>
  );
}
