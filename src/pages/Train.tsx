import { Suspense, lazy, useState } from 'react';
import { useStore } from '../lib/store';
import { EX, EXERCISES, MUSCLES, MUSCLE_LABEL, PATTERN_LABEL, loadLabel, loadText, targetText, usable } from '../lib/exercises';
import { MAX_GYM_DAYS, WEEKDAYS, minutes, nextDeload, phaseOf } from '../lib/program';
import { kitOf, records, stepKg, weeklySets } from '../lib/progress';
import { HEAT_LABEL, dayVolume, heat, loggedVolume, planVolume, type Volume } from '../lib/muscles';
import { GUIDE } from '../lib/guide';
import { fmtDate, weekStart } from '../lib/dates';
import { Bar, Head, Icon, ProfileLink, Sheet, Stepper, go, toast, useRoute, useToday } from '../components/ui';
import { useReadiness } from '../components/data';
import { BodyMap } from '../components/Body';
import type { Muscle, Pattern, PlanDay, Program, Slot } from '../lib/types';

const ExerciseInfo = lazy(() => import('../components/ExerciseInfo'));

const TABS = [
  ['plan', 'Plan'],
  ['body', 'Body'],
  ['moves', 'Moves'],
  ['history', 'History'],
  ['guide', 'Guide'],
] as const;

export default function Train() {
  const { params } = useRoute();
  const tab = params.get('tab') ?? 'plan';
  return (
    <main>
      <Head over="Gym plan" title="Train" right={<ProfileLink />} />
      <div className="page">
        <div className="seg" role="group" aria-label="Train sections">
          {TABS.map(([id, l]) => (
            <button key={id} aria-pressed={tab === id} onClick={() => go(`train?tab=${id}`)}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'history' ? <History /> : tab === 'moves' ? <Moves /> : tab === 'body' ? <Body /> : tab === 'guide' ? <Guide /> : <Plan />}
      </div>
    </main>
  );
}

function Plan() {
  const today = useToday();
  const program = useStore((s) => s.program);
  const log = useStore((s) => s.programLog);
  const workoutTime = useStore((s) => s.settings.workoutTime);
  const { setProgram, undoProgram, startWorkout, setSettings } = useStore.getState();
  const ready = useReadiness();
  const [edit, setEdit] = useState<{ day: string; idx: number | null } | null>(null);
  const wk = weeklySets(program);
  const last = log.at(-1);
  const phase = phaseOf(program, today);
  const lighter = nextDeload(program, today);
  const gymDays = program.week.filter(Boolean).length;
  const save = (p: Program, why: string) => setProgram(p, 'me', why);

  return (
    <>
      <section className="card soft stack" style={{ gap: 6 }} aria-label="This week">
        <div className="between">
          <h2 className="h2">{phase.label}</h2>
          {phase.kind !== 'deload' && lighter && <span className="small mut">lighter week from {fmtDate(lighter)}</span>}
        </div>
        <p className="small">{phase.note}</p>
        <p className="small mut">Each block: 4 build weeks, then a lighter week. Weights go up by themselves when you top the rep range with a rep to spare.</p>
      </section>

      <section className="card stack" style={{ gap: 10 }} aria-label="Weekly schedule">
        <div className="between" style={{ alignItems: 'center' }}>
          <h2 className="h2">Gym days</h2>
          <label className="row small mut">
            Start
            <input className="input" type="time" aria-label="Usual start time" style={{ minHeight: 44, width: 150, padding: '0 10px' }} value={workoutTime} onChange={(e) => e.target.value && setSettings({ workoutTime: e.target.value })} />
          </label>
        </div>
        {WEEKDAYS.map((w, i) => (
          <label key={w} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="bold" style={{ width: 48 }}>{w}</span>
            <select
              className="input"
              style={{ maxWidth: 220, minHeight: 44 }}
              value={program.week[i] ?? ''}
              onChange={(e) => {
                if (e.target.value && !program.week[i] && gymDays >= MAX_GYM_DAYS) return toast(`${MAX_GYM_DAYS} gym days is plenty. Rest days are when you grow.`);
                save({ ...program, week: program.week.map((x, j) => (j === i ? e.target.value || null : x)) }, `${w} changed`);
              }}
            >
              <option value="">Rest</option>
              {program.days.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        ))}
        <p className="small mut">
          Weekly hard sets: {(Object.keys(wk) as Pattern[]).filter((k) => wk[k]).map((k) => `${PATTERN_LABEL[k].split(' ')[0]} ${wk[k]}`).join(' · ')}
        </p>
      </section>

      {last && (
        <section className="card soft stack" style={{ gap: 6 }}>
          <div className="between">
            <span className="label">Last change · {last.by === 'coach' ? 'by your coach' : last.by === 'auto' ? 'progression' : 'by you'}</span>
            <button
              className="btn sm"
              onClick={() => {
                if (undoProgram()) toast('Change undone');
              }}
            >
              <Icon name="undo" size={16} /> Undo
            </button>
          </div>
          {last.lines.slice(0, 5).map((l) => (
            <p key={l} className="small bold">{l}</p>
          ))}
        </section>
      )}

      {program.days.map((d) => (
        <section key={d.id} className="card" style={{ padding: '16px 18px 8px' }} aria-label={d.name}>
          <div className="between" style={{ alignItems: 'center' }}>
            <div>
              <h2 className="h2">{d.name}</h2>
              <span className="small mut">
                {program.week.map((x, i) => (x === d.id ? WEEKDAYS[i] : null)).filter(Boolean).join(', ') || 'Not scheduled'} · about {minutes(d.slots)} min
              </span>
            </div>
            <button
              className="btn sm primary"
              onClick={() => {
                startWorkout(d, ready.band === 'easy');
                go('workout');
              }}
            >
              <Icon name="play" size={16} fill /> Start
            </button>
          </div>
          <div style={{ marginTop: 6 }}>
            {d.slots.map((s, i) => {
              const e = EX[s.exerciseId];
              return (
                <button key={s.exerciseId} className="item" style={{ width: '100%', background: 'none', border: 0, borderTop: i ? '1px solid var(--line)' : 0, color: 'var(--ink)', textAlign: 'left' }} onClick={() => setEdit({ day: d.id, idx: i })}>
                  <span className="grow">
                    <span className="bold" style={{ display: 'block' }}>{e?.name}</span>
                    <span className="small mut">
                      {s.sets} × {targetText(e, s.low, s.high)}
                      {s.loadKg ? ` · ${loadText(e, s.loadKg)}` : ''} · rest {s.restS} s
                    </span>
                  </span>
                  <Icon name="pencil" size={18} />
                </button>
              );
            })}
            <button className="btn sm" style={{ margin: '6px 0 10px', background: 'transparent', color: 'var(--acc)', padding: 0 }} onClick={() => setEdit({ day: d.id, idx: null })}>
              <Icon name="plus" size={18} /> Add exercise
            </button>
          </div>
        </section>
      ))}
      {edit && <SlotSheet program={program} dayId={edit.day} idx={edit.idx} onClose={() => setEdit(null)} onSave={save} />}
    </>
  );
}

function SlotSheet({ program, dayId, idx, onClose, onSave }: { program: Program; dayId: string; idx: number | null; onClose: () => void; onSave: (p: Program, why: string) => void }) {
  const day = program.days.find((d) => d.id === dayId)!;
  const kit = useStore((s) => kitOf(s).machineStepKg);
  const cur = idx == null ? null : day.slots[idx];
  const [s, setS] = useState<Slot>(cur ?? { exerciseId: '', sets: 3, low: 10, high: 15, restS: 90, loadKg: 0 });
  const [picking, setPicking] = useState(!cur);
  const e = EX[s.exerciseId];
  const put = (slots: Slot[]): PlanDay => ({ ...day, slots });
  const commit = (d: PlanDay, why: string) => {
    onSave({ ...program, days: program.days.map((x) => (x.id === dayId ? d : x)) }, why);
    onClose();
  };

  if (picking) {
    const taken = new Set(day.slots.map((x) => x.exerciseId));
    const groups = (Object.keys(PATTERN_LABEL) as Pattern[]).map((p) => [p, EXERCISES.filter((x) => x.pattern === p && usable(x) && (!taken.has(x.id) || x.id === s.exerciseId))] as const).filter(([, list]) => list.length);
    return (
      <Sheet onClose={onClose} label="Pick an exercise">
        <h2 className="h2">Pick an exercise</h2>
        {groups.map(([p, list]) => (
          <div key={p} className="stack" style={{ gap: 6 }}>
            <span className="label">{PATTERN_LABEL[p]}</span>
            {list.map((x) => (
              <button
                key={x.id}
                className="chip tall"
                onClick={() => {
                  const range = x.unit === 'secs' ? { low: 20, high: 40 } : x.loadable ? { low: 10, high: 15 } : { low: 6, high: 12 };
                  setS({ ...s, exerciseId: x.id, loadKg: x.startKg ?? 0, ...(x.unit !== EX[s.exerciseId]?.unit || x.loadable !== EX[s.exerciseId]?.loadable ? range : {}) });
                  setPicking(false);
                }}
              >
                <span className="bold">{x.name}</span>
                <span className="small">{x.muscles}</span>
              </button>
            ))}
          </div>
        ))}
      </Sheet>
    );
  }

  const secs = e?.unit === 'secs';
  // Loaded exercises stay at 5+ reps: heavy low-rep work isn't for a beginner.
  const minReps = e?.loadable && !secs ? 5 : 1;
  return (
    <Sheet onClose={onClose} label={`Edit ${e?.name}`}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">{e?.name}</h2>
        <button className="btn sm" onClick={() => setPicking(true)}>
          <Icon name="swap" size={16} /> Change
        </button>
      </div>
      <label className="field">
        <span>Sets</span>
        <Stepper value={s.sets} onChange={(v) => setS({ ...s, sets: v })} label="sets" min={1} max={4} round={1} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>From ({secs ? 's' : 'reps'})</span>
          <Stepper value={s.low} onChange={(v) => setS({ ...s, low: v, high: Math.max(v, s.high) })} label="lowest" step={secs ? 5 : 1} min={minReps} max={secs ? 120 : 30} round={1} />
        </label>
        <label className="field">
          <span>To ({secs ? 's' : 'reps'})</span>
          <Stepper value={s.high} onChange={(v) => setS({ ...s, high: v, low: Math.min(v, s.low) })} label="highest" step={secs ? 5 : 1} min={minReps} max={secs ? 120 : 30} round={1} />
        </label>
      </div>
      <div className={e?.loadable ? 'grid2' : 'stack'}>
        {e?.loadable && (
          <label className="field">
            <span>{loadLabel(e)}</span>
            <Stepper value={s.loadKg} onChange={(v) => setS({ ...s, loadKg: v })} label="weight" step={stepKg(e, s.loadKg, { machineStepKg: kit, packMaxKg: 40 })} max={300} />
          </label>
        )}
        <label className="field">
          <span>Rest (s)</span>
          <Stepper value={s.restS} onChange={(v) => setS({ ...s, restS: v })} label="rest seconds" step={15} min={15} max={300} round={15} />
        </label>
      </div>
      <div className="row">
        {cur && (
          <button className="btn danger" disabled={day.slots.length <= 1} aria-label="Remove exercise" onClick={() => commit(put(day.slots.filter((_, i) => i !== idx)), `Removed ${e?.name}`)}>
            <Icon name="trash" size={18} />
          </button>
        )}
        <button className="btn primary block" style={{ flex: 1 }} disabled={!e} onClick={() => commit(put(cur ? day.slots.map((x, i) => (i === idx ? s : x)) : [...day.slots, s]), cur ? `Edited ${e?.name}` : `Added ${e?.name}`)}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

/** The body map: which muscles this week's training (or one day of the plan) works. */
function Body() {
  const today = useToday();
  const program = useStore((s) => s.program);
  const sessions = useStore((s) => s.sessions);
  const [view, setView] = useState('week');
  const [pick, setPick] = useState<Muscle | null>(null);
  const day = program.days.find((d) => d.id === view);
  const volume: Volume = view === 'week' ? loggedVolume(sessions, weekStart(today)) : view === 'plan' ? planVolume(program) : day ? dayVolume(day) : planVolume(program);
  const focus = !!day;
  const ranked = MUSCLES.filter((m) => volume[m] > 0).sort((a, b) => volume[b] - volume[a]);
  const max = Math.max(1, ...ranked.map((m) => volume[m]));
  return (
    <>
      <div className="scroller" role="group" aria-label="What to show">
        <button className="chip" aria-pressed={view === 'week'} onClick={() => setView('week')}>This week</button>
        <button className="chip" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>Planned week</button>
        {program.days.map((d) => (
          <button key={d.id} className="chip" aria-pressed={view === d.id} onClick={() => setView(d.id)}>{d.name}</button>
        ))}
      </div>
      <section className="card stack" style={{ gap: 10 }} aria-label="Body map">
        <BodyMap volume={volume} scale={focus ? 'focus' : 'heat'} onPick={setPick} height={380} />
        <p className="small mut" style={{ textAlign: 'center' }}>
          {pick ? `${MUSCLE_LABEL[pick]}: ${+volume[pick].toFixed(1)} hard sets${focus ? '' : ` · ${HEAT_LABEL[heat(volume[pick])].toLowerCase()}`}` : 'Drag to turn it. Tap a muscle for its sets.'}
        </p>
      </section>
      <section className="card stack" style={{ gap: 10 }} aria-label="Sets per muscle">
        <h2 className="h2">{view === 'week' ? 'Logged this week' : view === 'plan' ? 'Planned each week' : day?.name}</h2>
        {!ranked.length && <p className="small mut">Nothing logged yet this week. It fills in as you train.</p>}
        {ranked.map((m) => (
          <div key={m} className="stack" style={{ gap: 4 }}>
            <div className="between">
              <span className="small bold">{MUSCLE_LABEL[m]}</span>
              <span className="small mut">{+volume[m].toFixed(1)} sets</span>
            </div>
            <Bar value={volume[m]} max={max} label={MUSCLE_LABEL[m]} height={6} />
          </div>
        ))}
        <p className="small mut">A set counts 1 for the main muscle and half for the helpers. Around 8–16 a week per muscle is plenty for now.</p>
      </section>
    </>
  );
}

function History() {
  const sessions = useStore((s) => s.sessions);
  const del = useStore((s) => s.deleteSession);
  const [open, setOpen] = useState<string | null>(null);
  const list = Object.values(sessions).sort((a, b) => b.start - a.start);
  if (!list.length) return <p className="empty">No workouts yet. Your finished workouts show up here.</p>;
  return (
    <>
      {list.map((s) => {
        const by = new Map<string, typeof s.sets>();
        for (const x of s.sets) by.set(x.exerciseId, [...(by.get(x.exerciseId) ?? []), x]);
        const isOpen = open === s.id;
        const homeEra = s.sets.length > 0 && s.sets.every((x) => EX[x.exerciseId]?.home || !EX[x.exerciseId]?.loadable);
        return (
          <section key={s.id} className="card tight stack" style={{ gap: 8 }}>
            <button className="row" style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink)', textAlign: 'left', minHeight: 44 }} onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
              <span className="grow">
                <span className="bold" style={{ display: 'block' }}>{s.name}</span>
                <span className="small mut">
                  {fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.max(1, Math.round((s.end - s.start) / 60_000))} min · {s.sets.length} sets{homeEra && s.sets.some((x) => EX[x.exerciseId]?.home) ? ' · at home' : ''}
                </span>
              </span>
              <Icon name={isOpen ? 'minus' : 'plus'} size={18} />
            </button>
            {isOpen && (
              <>
                {[...by.entries()].map(([id, xs]) => (
                  <p key={id} className="small">
                    <span className="bold">{EX[id]?.name ?? id}</span>{' '}
                    <span className="mut">
                      {xs.map((x) => (x.repsR != null && x.repsR !== x.reps ? `${x.reps}/${x.repsR}` : x.reps)).join(', ')}
                      {EX[id]?.unit === 'secs' ? ' s' : ''}
                      {xs[0].loadKg ? ` @ ${loadText(EX[id], xs[0].loadKg) || `${xs[0].loadKg} kg`}` : ''}
                    </span>
                  </p>
                ))}
                {s.note && <p className="small mut">“{s.note}”</p>}
                <button className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={() => confirm('Delete this workout?') && del(s.id)}>
                  <Icon name="trash" size={16} /> Delete
                </button>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}

function Moves() {
  const sessions = useStore((s) => s.sessions);
  const best = records(sessions);
  const [open, setOpen] = useState<string | null>(null);
  const [showHome, setShowHome] = useState(false);
  const row = (id: string) => {
    const e = EX[id];
    const b = best[id];
    return (
      <button key={id} className="item" style={{ width: '100%', background: 'none', border: 0, color: 'var(--ink)', textAlign: 'left', minHeight: 56 }} onClick={() => setOpen(id)}>
        <span className="grow">
          <span className="bold" style={{ display: 'block' }}>{e.name}</span>
          <span className="small mut">{e.muscles}</span>
        </span>
        {b && <span className="pill">{b.reps}{e.unit === 'secs' ? ' s' : ''}{b.loadKg ? ` @ ${b.loadKg} kg` : ''}</span>}
        {e.demo ? <span className="acc"><Icon name="play" size={16} fill /></span> : <Icon name="right" size={16} />}
      </button>
    );
  };
  const home = EXERCISES.filter((e) => e.home && best[e.id]);
  return (
    <>
      <p className="small mut">Tap an exercise for how to do it. The ones with a play button have a moving demo.</p>
      {(Object.keys(PATTERN_LABEL) as Pattern[]).map((p) => {
        const list = EXERCISES.filter((e) => e.pattern === p && usable(e)).sort((a, b) => (a.ladder === b.ladder ? a.step - b.step : 0));
        if (!list.length) return null;
        return (
          <section key={p} className="card" style={{ padding: '14px 18px 6px' }}>
            <h2 className="h2" style={{ marginBottom: 4 }}>{PATTERN_LABEL[p]}</h2>
            {list.map((e) => row(e.id))}
          </section>
        );
      })}
      {home.length > 0 && (
        <section className="card" style={{ padding: '14px 18px 6px' }}>
          <button className="between" style={{ width: '100%', background: 'none', border: 0, padding: 0, color: 'var(--ink)', alignItems: 'center', minHeight: 44 }} onClick={() => setShowHome(!showHome)} aria-expanded={showHome}>
            <h2 className="h2">Before the gym</h2>
            <span className="small mut">{home.length} home moves</span>
          </button>
          {showHome && home.map((e) => row(e.id))}
        </section>
      )}
      {open && (
        <Sheet onClose={() => setOpen(null)} label={EX[open].name}>
          <Suspense fallback={<p className="mut">Loading…</p>}>
            <ExerciseInfo exerciseId={open} />
          </Suspense>
        </Sheet>
      )}
    </>
  );
}

function Guide() {
  return (
    <>
      {GUIDE.map((t) => (
        <section key={t.title} className="card stack" style={{ gap: 10 }}>
          <h2 className="h2">{t.title}</h2>
          {t.lines.map((l) => (
            <div key={l} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span className="acc" style={{ marginTop: 1 }}><Icon name="check" size={18} stroke={3} /></span>
              <span className="small">{l}</span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
