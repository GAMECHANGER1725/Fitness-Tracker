import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { EX, targetText } from '../lib/exercises';
import { WEEKDAYS, inDeload, minutes, nextPlanned, plannedDay, slotsFor } from '../lib/program';
import { addDays, dateOf, fmtDate, keyOf, weekStart } from '../lib/dates';
import { QUALITY, clock12, clockOf, durationMin, hm, nightKey, onTime, pastAt, sleepIfNow, toBedtime, wakeOffset } from '../lib/sleep';
import { BAND_LABEL, readiness } from '../lib/readiness';
import { nextBadge, weekSummary } from '../lib/game';
import { historyOf, newRecords } from '../lib/progress';
import { lastWeekReport, weekReportText } from '../lib/notes';
import { backupDue, useLayout } from '../lib/layout';
import { useSync } from '../lib/sync';
import { currentAi, morningBriefing, useCoach } from '../lib/coach';
import { friendlyError, hasAi } from '../lib/ai';
import { Bar, Head, Icon, ProfileLink, go, shareText, toast, useGame, useNow, useToday } from '../components/ui';
import { useFuelData, useReadiness } from '../components/data';
import type { PlanDay } from '../lib/types';

const REST_DAY = ['An easy 10 to 15 min walk outside', '30 s each: hip flexor stretch, hamstring stretch, chest stretch on a doorway', '10 slow cat-cows and 10 deep breaths lying down'];

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
  const [why, setWhy] = useState(false);
  // Readiness picks the lighter version on an Easy day; you can flip it either way (until you leave Today).
  const [choice, setChoice] = useState<boolean | null>(null);
  const easy = choice ?? ready.band === 'easy';
  const hidden = useLayout((l) => l.hidden);

  const start = (day: PlanDay) => {
    startWorkout(day, easy);
    go('workout');
  };

  const day = planned;
  const next = nextPlanned(program, today);
  const slots = day ? slotsFor(program, day, today, easy) : [];

  return (
    <main>
      <Head over={fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })} title={doneToday.length ? 'Done for today' : day ? day.name : 'Rest day'} right={<ProfileLink />} />
      <div className="page">
        <WakeCard />
        <BedCard />

        <section className="card hot stack" style={{ gap: 14 }} aria-label="Readiness">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <button onClick={() => setWhy(!why)} aria-expanded={why} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left' }}>
              <span className="small bold" style={{ opacity: 0.75 }}>Readiness · {why ? 'hide' : 'why?'}</span>
              <p className="num" style={{ fontSize: 48, lineHeight: 1 }}>{ready.score}</p>
            </button>
            <span className="pill">{BAND_LABEL[ready.band]}</span>
          </div>
          {why && (
            <div className="stack" style={{ gap: 8 }}>
              {([['Sleep last night', ready.sleep, 40], ['Food yesterday', ready.fuel, 30], ['Recovery from training', ready.load, 30]] as const).map(([l, v, max]) => (
                <div key={l} className="stack" style={{ gap: 4 }}>
                  <div className="between small"><span>{l}</span><span className="bold">{v} / {max}</span></div>
                  <div className="bar" style={{ background: 'color-mix(in srgb, var(--on-acc) 22%, transparent)' }}><i style={{ width: `${(v / max) * 100}%`, background: 'var(--on-acc)' }} /></div>
                </div>
              ))}
              {ready.notes.length > 0 && <p className="small" style={{ opacity: 0.9 }}>{ready.notes.join('. ')}.</p>}
              <ReadinessWeek />
              <p className="small" style={{ opacity: 0.75 }}>Missing data counts as average. Under 55 plans about a quarter fewer sets.</p>
            </div>
          )}
          <Briefing fallback={ready.notes.slice(0, 2).join('. ') + (ready.notes.length ? '.' : '')} />
          {active && keyOf(new Date(active.start)) < today ? (
            // Started on an earlier day and never finished: save what was logged, or let it go.
            <div className="stack" style={{ gap: 8 }}>
              <p className="bold">
                Unfinished {active.name} from {fmtDate(keyOf(new Date(active.start)), { weekday: 'long' })}, {active.sets.length} set{active.sets.length === 1 ? '' : 's'} logged.
              </p>
              <div className="row">
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  disabled={!active.sets.length}
                  onClick={() => {
                    // Saved as of its last set, not now.
                    const last = Math.max(...active.sets.map((x) => x.at));
                    const r = useStore.getState().finishWorkout(undefined, undefined, last);
                    if (r) toast(`${r.session.name} saved`);
                  }}
                >
                  Save it
                </button>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    const was = active;
                    useStore.getState().cancelWorkout();
                    toast('Workout discarded', { label: 'Undo', run: () => useStore.setState({ active: was }) });
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          ) : active ? (
            <button className="btn block" onClick={() => go('workout')}>
              <Icon name="play" size={18} fill /> Resume {active.name}
            </button>
          ) : doneToday.length ? (
            <div className="stack" style={{ gap: 4 }}>
              {doneToday.map((x) => {
                const b = new Set(newRecords(x, sessions).map((r) => r.exerciseId)).size;
                return (
                  <p key={x.id} className="bold">
                    {x.name} done: {Math.max(1, Math.round((x.end - x.start) / 60_000))} min, {x.sets.length} set{x.sets.length === 1 ? '' : 's'}
                    {b ? `, ${b} new best${b === 1 ? '' : 's'}` : ''}.
                  </p>
                );
              })}
              <p className="small" style={{ opacity: 0.85 }}>Eat well and get to bed on time.</p>
            </div>
          ) : day ? (
            <>
              <button className="btn block" onClick={() => start(day)}>
                <Icon name="play" size={18} fill /> Start workout · {minutes(slots)} min{easy ? ', lighter' : ''}
              </button>
              <button className="small bold" onClick={() => setChoice(!easy)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', opacity: 0.85, textDecoration: 'underline', alignSelf: 'center' }}>
                {easy ? 'Do the full workout instead' : 'Do a lighter version (about a quarter fewer sets)'}
              </button>
              {program.days.length > 1 && (
                <button className="small bold" onClick={() => setPick(!pick)} aria-expanded={pick} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', opacity: 0.85, textDecoration: 'underline', alignSelf: 'center' }}>
                  {pick ? 'Keep today’s workout' : 'Do a different workout today'}
                </button>
              )}
            </>
          ) : (
            <button className="btn block" onClick={() => setPick(!pick)}>
              Rest day. Train anyway?
            </button>
          )}
          {(doneToday.length > 0 || !day) && !active && next && (
            <p className="small" style={{ opacity: 0.85 }}>
              Next: {next.day.name}, {next.date === addDays(today, 1) ? 'tomorrow' : fmtDate(next.date, { weekday: 'long' })}
            </p>
          )}
          {pick && !active && !doneToday.length && (
            <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Pick a workout">
              {program.days.filter((d) => d.id !== day?.id).map((d) => (
                <button key={d.id} className="chip" onClick={() => start(d)}>{d.name} · {minutes(slotsFor(program, d, today, easy))} min</button>
              ))}
            </div>
          )}
        </section>

        {!day && !doneToday.length && !active && !hidden.includes('exercises') && (
          <section className="card soft stack" style={{ gap: 8 }} aria-label="Rest day">
            <span className="label">Rest day, about 15 min if you feel like it</span>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {REST_DAY.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <p className="small mut">Muscles grow on rest days. Eat to your target and get to bed on time.</p>
          </section>
        )}

        {day && !doneToday.length && !hidden.includes('exercises') && (
          <section className="card" style={{ padding: '6px 18px' }} aria-label="Today's exercises">
            {inDeload(program, today) && <p className="small mut" style={{ paddingTop: 12 }}>Lighter week: fewer sets so your body can catch up.</p>}
            {slots.map((s) => {
              const e = EX[s.exerciseId];
              return (
                <a className="item" key={s.exerciseId} href={`#/train?tab=moves&open=${s.exerciseId}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="bold" style={{ display: 'block' }}>{e?.name ?? s.exerciseId}</span>
                    {(() => {
                      const last = historyOf(sessions, s.exerciseId)[0];
                      return last ? <span className="small mut">Last time {last.map((x) => x.reps).join(', ')}{e?.unit === 'secs' ? ' s' : ''}{last[0].loadKg ? ` @ ${last[0].loadKg} kg` : ''}</span> : null;
                    })()}
                  </span>
                  <span className="small mut" style={{ textAlign: 'right' }}>
                    {s.sets} × {targetText(e, s.low, s.high)}
                    {s.loadKg ? ` · ${s.loadKg} kg` : ''}
                  </span>
                </a>
              );
            })}
          </section>
        )}

        <BackupNudge />
        {!hidden.includes('recap') && <LastWeek />}
        {!hidden.includes('fuel') && <FuelStrip />}
        {!hidden.includes('week') && <WeekStrip />}
        {hidden.length > 0 && (
          <a href="#/profile?open=look" className="small mut" style={{ textAlign: 'center' }}>
            {hidden.length} card{hidden.length === 1 ? '' : 's'} hidden · change in Profile
          </a>
        )}
      </div>
    </main>
  );
}

/** Readiness for each of the last 7 days (today on the right), recomputed from what was logged then. */
function ReadinessWeek() {
  const today = useToday();
  const nights = useStore((s) => s.nights);
  const sessions = useStore((s) => s.sessions);
  const goalH = useStore((s) => s.settings.sleepGoalH);
  const fuel = useFuelData();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const scores = days.map((d) => readiness({ today: d, night: nights[d], goalH, fuel, targets: fuel?.targets ?? null, sessions }).score);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small">Last 7 days</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end', height: 56 }} role="img" aria-label={`Readiness, last 7 days: ${scores.join(', ')}`}>
        {scores.map((v, i) => (
          <div key={days[i]} className="stack" style={{ gap: 2, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, opacity: 0.85 }}>{v}</span>
            <i style={{ display: 'block', width: '100%', height: `${6 + Math.max(0, v - 40) * 0.6}px`, borderRadius: 4, background: 'var(--on-acc)', opacity: i === 6 ? 1 : 0.45 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, fontSize: 10, opacity: 0.8, textAlign: 'center' }}>
        {days.map((d) => <span key={d}>{fmtDate(d, { weekday: 'narrow' })}</span>)}
      </div>
    </div>
  );
}

function WakeCard() {
  const today = useToday();
  const night = useStore((s) => s.nights[today]);
  const wakeTarget = useStore((s) => s.settings.wakeTarget);
  const goalH = useStore((s) => s.settings.sleepGoalH);
  const wokeUp = useStore((s) => s.wokeUp);
  const setNight = useStore((s) => s.setNight);
  const g = useGame();
  const hour = new Date().getHours();
  if (night?.wake == null) {
    if (hour >= 14) return null;
    const up = (at?: number) => {
      wokeUp(at);
      const n = useStore.getState().nights[today];
      toast(onTime(n, wakeTarget) ? 'Up on time. Nice.' : 'Logged. Aim for the target tomorrow.');
    };
    return (
      <div className="card stack" style={{ gap: 10 }}>
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 14, border: 0, padding: 0, background: 'none', textAlign: 'left', color: 'var(--ink)', width: '100%' }}
          onClick={() => up()}
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
        <EarlierTime label="Got up earlier? Pick the time" initial={wakeTarget} onPick={(t) => up(pastAt(t, Date.now()))} />
      </div>
    );
  }
  // Evenings belong to the Going to sleep card; this morning's summary is still on Sleep.
  if (hour >= 18) return null;
  const off = wakeOffset(night, wakeTarget) ?? 0;
  const dur = durationMin(night);
  const rate = night.quality == null && hour < 12;
  return (
    <div className="card tight stack" style={{ gap: 10 }}>
      <a href="#/sleep" style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--ink)', textDecoration: 'none' }}>
        <span style={{ width: 46, height: 46, borderRadius: 16, background: 'var(--sleep-soft)', color: 'var(--sleep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="sun" />
        </span>
        <span className="grow">
          <span className="bold" style={{ display: 'block' }}>
            Up at {clockOf(night.wake)}, {off <= 15 ? (off < -5 ? 'early' : 'on time') : `${off} min late`}
          </span>
          <span className="small mut">
            {dur != null ? `${hm(dur)} sleep, ${dur >= goalH * 60 - 10 ? 'goal met' : `${hm(goalH * 60 - dur)} short`}` : 'No bedtime logged'}
            {g.wake ? ` · ${g.wake}-day wake streak` : ''}
          </span>
        </span>
      </a>
      {night.note ? (
        <a href={`#/sleep?night=${today}`} className="small mut" style={{ fontStyle: 'italic', textDecoration: 'none' }}>“{night.note}”</a>
      ) : (
        <a href={`#/sleep?night=${today}`} className="small acc bold" style={{ textDecoration: 'none' }}>
          {dur == null ? 'Add when you went to bed' : 'Add a note on last night'}
        </a>
      )}
      {rate && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small mut">How did you sleep?</span>
          <div className="grid4" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }} role="group" aria-label="Sleep quality">
            {QUALITY.map((q, i) => (
              <button key={q} className="chip" style={{ padding: 0, fontSize: 13 }} onClick={() => (setNight(today, { quality: i + 1 }), toast(`Saved: ${q.toLowerCase()}`))}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Evenings: one tap for "Going to sleep", counting down to lights out; afterwards a quiet line with Undo. */
function BedCard() {
  const now = useNow(60_000);
  const bedtime = useStore((s) => s.settings.bedtime);
  const wakeTarget = useStore((s) => s.settings.wakeTarget);
  const key = nightKey(now);
  const night = useStore((s) => s.nights[key]);
  const goalH = useStore((s) => s.settings.sleepGoalH);
  const g = useGame();
  const left = toBedtime(now, bedtime);
  const ifNow = sleepIfNow(now, wakeTarget);
  // From 2 h before lights out until 6 h after it.
  if (left > 120 || left <= -360) return null;
  const { goingToSleep, deleteNight } = useStore.getState();
  if (night?.bed != null && night.wake == null) {
    return (
      <div className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 46, height: 46, borderRadius: 16, background: 'var(--sleep-soft)', color: 'var(--sleep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="moon" />
        </span>
        <span className="grow">
          <span className="bold" style={{ display: 'block' }}>Asleep since {clockOf(night.bed)}</span>
          <span className="small mut">Up at {clock12(wakeTarget)}</span>
        </span>
        <button className="btn sm ghost" onClick={() => (deleteNight(key), toast('Undone.'))}>
          <Icon name="undo" size={16} /> Undo
        </button>
      </div>
    );
  }
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <WindDown nightDone={night?.done ?? []} />
      <button
        style={{ display: 'flex', alignItems: 'center', gap: 14, border: 0, padding: 0, background: 'none', textAlign: 'left', color: 'var(--ink)', width: '100%' }}
        onClick={() => (goingToSleep(), toast(`Sleep well. Up at ${clock12(wakeTarget)}.`))}
      >
        <span style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--sleep)', color: 'var(--on-sleep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="moon" size={26} />
        </span>
        <span className="grow">
          <span className="h2" style={{ display: 'block' }}>Going to sleep</span>
          <span className="small mut">
            Lights out {clock12(bedtime)} · {left > 0 ? `in ${hm(left)}` : left === 0 ? 'now' : `${hm(-left)} past`}
          </span>
          <span className="small" style={{ display: 'block', color: ifNow < goalH * 60 - 10 ? 'var(--warn)' : 'var(--sleep)' }}>
            Sleep now for {hm(ifNow)}
          </span>
          {g.wake >= 2 && <span className="small mut" style={{ display: 'block' }}>Up on time tomorrow keeps your {g.wake}-day wake streak</span>}
        </span>
        <Icon name="right" />
      </button>
      <EarlierTime label="Went to bed earlier? Pick the time" initial={bedtime} onPick={(t) => (goingToSleep(pastAt(t, Date.now())), toast(`Asleep since ${clock12(t)}. Up at ${clock12(wakeTarget)}.`))} />
    </div>
  );
}

/** "Forgot to tap" helper: a link that opens a time picker and logs that time instead of now. */
function EarlierTime({ label, initial, onPick }: { label: string; initial: string; onPick: (hhmm: string) => void }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(initial);
  if (!open)
    return (
      <button className="small mut" onClick={() => setOpen(true)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', textDecoration: 'underline' }}>
        {label}
      </button>
    );
  return (
    <div className="row" style={{ gap: 8 }}>
      <input className="input" type="time" value={t} onChange={(e) => setT(e.target.value)} style={{ flex: 1, minHeight: 44 }} aria-label="Time" />
      <button className="btn sm primary" disabled={!t} onClick={() => onPick(t)}>Save</button>
      <button className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

/** Tonight's wind-down steps from Profile, ticked one tap at a time (saved on tonight's night). */
function WindDown({ nightDone }: { nightDone: string[] }) {
  const list = useStore((s) => s.profile.windDown);
  const toggle = useStore((s) => s.toggleWindDown);
  if (!list.length) return null;
  const n = list.filter((l) => nightDone.includes(l)).length;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="between small">
        <span className="bold">Wind down · {n} of {list.length}</span>
        <a href="#/profile?open=wind" className="mut" style={{ fontSize: 12 }}>Edit</a>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Wind-down steps">
        {list.map((l) => (
          <button key={l} className="chip" aria-pressed={nightDone.includes(l)} onClick={() => toggle(l)} style={{ fontSize: 13, minHeight: 36 }}>
            {nightDone.includes(l) && <Icon name="check" size={14} stroke={3} />} {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Once a month, if sync is off: save a backup file, since the data only lives on this phone. */
const RECAP_KEY = 'fitness-recap';

/** Monday to Wednesday: last week in a few numbers, until dismissed (per device). */
function LastWeek() {
  const today = useToday();
  const sessions = useStore((s) => s.sessions);
  const nights = useStore((s) => s.nights);
  const program = useStore((s) => s.program);
  const settings = useStore((s) => s.settings);
  const [gone, setGone] = useState(() => {
    try {
      return localStorage.getItem(RECAP_KEY);
    } catch {
      return null;
    }
  });
  if ((dateOf(today).getDay() + 6) % 7 > 2) return null;
  const r = lastWeekReport({ sessions, nights, program, settings }, today);
  if (!r || gone === r.ws) return null;
  const close = () => {
    try {
      localStorage.setItem(RECAP_KEY, r.ws);
    } catch {
      /* shows again next time; harmless */
    }
    setGone(r.ws);
  };
  const tiles: [string, string][] = [
    ['Workouts', r.planned ? `${r.workouts} of ${r.planned}` : String(r.workouts)],
    ['Training time', r.minutes ? hm(r.minutes) : '–'],
    ['New bests', String(r.bests)],
    ['Average sleep', r.avgMin != null ? hm(r.avgMin) : '–'],
    ['Up on time', r.withWake ? `${r.onTime} of ${r.withWake}` : '–'],
    ['Nights', `${r.nights} of 7`],
  ];
  return (
    <section className="card stack" style={{ gap: 10 }} aria-label="Last week">
      <div className="between">
        <span className="stack" style={{ gap: 0 }}>
          <h2 className="h2">Last week</h2>
          <span className="small mut">{fmtDate(r.ws, { day: 'numeric', month: 'short' })} – {fmtDate(addDays(r.ws, 6), { day: 'numeric', month: 'short' })}</span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn sm icon" aria-label="Share last week" onClick={() => shareText(weekReportText(r))}>
            <Icon name="out" size={16} />
          </button>
          <button className="btn sm icon" aria-label="Hide last week" onClick={close}>
            <Icon name="close" size={16} />
          </button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {tiles.map(([label, v]) => (
          <div key={label} className="stack" style={{ gap: 0, background: 'var(--s2)', borderRadius: 14, padding: '8px 10px' }}>
            <span className="num bold" style={{ fontSize: 18 }}>{v}</span>
            <span className="small mut">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BackupNudge() {
  const synced = useSync((s) => !!s.conn);
  const sessions = useStore((s) => Object.keys(s.sessions).length);
  const nights = useStore((s) => Object.keys(s.nights).length);
  const { backupAt, backupSnooze, set } = useLayout();
  if (!backupDue(Date.now(), { synced, sessions, nights, backupAt, snooze: backupSnooze })) return null;
  return (
    <section className="card tight stack" style={{ gap: 8, boxShadow: 'inset 0 0 0 1.5px var(--line2)' }} aria-label="Backup reminder">
      <span className="bold">Back up your workouts and sleep</span>
      <span className="small mut">Sync is off, so everything lives only on this phone. Save a backup file, or turn on sync in Profile.</span>
      <div className="row">
        <a className="btn sm primary" href="#/profile?open=backup">Back up</a>
        <button className="btn sm" onClick={() => set({ backupSnooze: Date.now() + 7 * 86_400_000 })}>Not now</button>
      </div>
    </section>
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
        {t && (
          <span className="stack" style={{ gap: 4, marginTop: 6 }}>
            <Bar value={f?.kcal ?? 0} max={t.kcal} color="var(--fuel)" height={6} label="Energy today" />
            <Bar value={f?.protein ?? 0} max={t.protein} color="var(--pro)" height={6} label="Protein today" />
          </span>
        )}
      </span>
      <Icon name="right" />
    </a>
  );
}

function WeekStrip() {
  const today = useToday();
  const g = useGame();
  const program = useStore((s) => s.program);
  const sessions = useStore((s) => s.sessions);
  const [pick, setPick] = useState<string | null>(null);
  const ws = weekStart(today);
  const done = new Set(Object.values(sessions).map((s) => s.date));
  const sum = weekSummary({ sessions, program }, ws);
  const nb = nextBadge(g.badges);
  const detail = (k: string) => {
    const xs = Object.values(sessions).filter((s) => s.date === k);
    const day = fmtDate(k, { weekday: 'long' });
    if (xs.length) return `${day}: ${xs.map((s) => `${s.name}, ${Math.max(1, Math.round((s.end - s.start) / 60_000))} min, ${s.sets.length} sets`).join(' · ')}`;
    const plan = plannedDay(program, k);
    return `${day}: ${plan ? `${plan.name}${k < today ? ', missed' : ' planned'}` : 'rest day'}`;
  };
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="This week">
      <div className="between">
        <span className="row" style={{ gap: 8 }}>
          <h2 className="h2">This week</h2>
          {g.weeks >= 2 && <span className="pill">{g.weeks} weeks in a row</span>}
        </span>
        <a href="#/train" className="small bold" style={{ textDecoration: 'none' }}>Plan</a>
      </div>
      <div className="week">
        {WEEKDAYS.map((w, i) => {
          const k = addDays(ws, i);
          const plan = program.week[i];
          const cls = done.has(k) ? 'done' : plan && k >= today ? 'plan' : '';
          return (
            <button key={w} onClick={() => setPick(pick === k ? null : k)} aria-pressed={pick === k} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit' }}>
              <i className={`${cls}${k === today ? ' today' : ''}`} aria-label={`${w}: ${done.has(k) ? 'done' : plan ? 'planned' : 'rest'}`}>
                {done.has(k) ? <Icon name="check" size={18} stroke={3} /> : dateOf(k).getDate()}
              </i>
              {w}
            </button>
          );
        })}
      </div>
      <p className="small mut">
        {pick ? detail(pick) : `${sum.done} of ${sum.planned} workouts${sum.sets ? ` · ${sum.sets} sets · ${sum.minutes < 60 ? `${sum.minutes} min` : hm(sum.minutes)}` : ''}. Tap a day for more.`}
      </p>
      {nb && (
        <a href="#/train?tab=badges" className="stack" style={{ gap: 4, textDecoration: 'none', color: 'var(--ink)' }} aria-label={`Next badge: ${nb.name}, ${nb.have} of ${nb.need}`}>
          <span className="between small">
            <span><span className="bold">Next badge: {nb.name}</span> <span className="mut">· {nb.how}</span></span>
            <span className="bold acc">{nb.have}/{nb.need}</span>
          </span>
          <Bar value={nb.have} max={nb.need} />
        </a>
      )}
    </section>
  );
}
