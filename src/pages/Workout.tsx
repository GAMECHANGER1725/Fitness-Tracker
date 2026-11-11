// The workout logger. Built for one hand at the gym: the weight, reps and "Log set" sit in a bar at the bottom
// of the screen, the rest timer starts by itself, and every exercise shows today's target and last time.
// The 3D form demo is behind the "Form" button and loaded only when tapped, so nothing here waits for it.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { EX, EXERCISES, PATTERN_LABEL, loadLabel, loadText, usable } from '../lib/exercises';
import { countReps, kitOf, lastTime, historyOf, newRecords, stepKg, targetFor, usedLoad, type Target } from '../lib/progress';
import { HOLD_CAP_S, phaseOf } from '../lib/program';
import { COOLDOWN, RAMP, RIR_OPTIONS, WARMUP } from '../lib/guide';
import { currentAi, postWorkout, suggestSwap } from '../lib/coach';
import { friendlyError, hasAi } from '../lib/ai';
import { fmtDate } from '../lib/dates';
import { Icon, Ring, Sheet, Stepper, go, mmss, toast, useNow } from '../components/ui';
import type { Exercise, Session, SetLog, Slot } from '../lib/types';

const ExerciseInfo = lazy(() => import('../components/ExerciseInfo'));

const FEEL = ['Rough', 'Meh', 'OK', 'Good', 'Great'];
type Done = { session: Session; lines: string[]; records: string[] };

export default function Workout() {
  const active = useStore((s) => s.active);
  const [result, setResult] = useState<Done | null>(null);
  if (result) return <Summary {...result} />;
  if (!active) {
    return (
      <main className="page" style={{ paddingTop: 40, gap: 16 }}>
        <h1 className="title">No workout running</h1>
        <p className="mut">Start one from Today or Train.</p>
        <a className="btn primary block" href="#/today">Back to Today</a>
      </main>
    );
  }
  return <Player onDone={setResult} />;
}

const setText = (ex: Exercise | undefined, x: SetLog) =>
  `${x.repsR != null && x.repsR !== x.reps ? `${x.reps} / ${x.repsR}` : x.reps}${ex?.unit === 'secs' ? ' s' : ''}${x.loadKg ? ` · ${loadText(ex, x.loadKg) || `${x.loadKg} kg`}` : ''}`;

/** "20 kg · 3 × 10" or "20 kg · 10, 10, 9". */
function targetLine(ex: Exercise | undefined, t: Target): string {
  const same = t.aims.every((a) => a === t.aims[0]);
  const u = ex?.unit === 'secs' ? ' s' : '';
  const reps = same ? `${t.aims.length} × ${t.aims[0]}${u}` : `${t.aims.join(', ')}${u}`;
  const load = loadText(ex, t.loadKg);
  return load ? `${load} · ${reps}` : reps;
}

function Player({ onDone }: { onDone: (r: Done) => void }) {
  const a = useStore((s) => s.active)!;
  const sessions = useStore((s) => s.sessions);
  const program = useStore((s) => s.program);
  const weakArm = useStore((s) => s.profile.weakArm);
  const kit = useStore((s) => kitOf(s).machineStepKg);
  const { logSet, undoSet, goTo, setRest, setWarm, cancelWorkout, finishWorkout } = useStore.getState();
  const now = useNow(250);
  const slot = a.slots[a.idx];
  const ex = EX[slot.exerciseId];
  const done = a.sets.filter((x) => x.exerciseId === slot.exerciseId);
  const phase = phaseOf(program, a.date);
  const recent = useMemo(() => historyOf(sessions, slot.exerciseId), [sessions, slot.exerciseId]);
  const last = useMemo(() => lastTime(sessions, slot.exerciseId), [sessions, slot.exerciseId]);
  const target = useMemo(() => targetFor(slot, recent, phase), [slot, recent, phase.kind, phase.rir[0], phase.rir[1]]);
  const allDone = done.length >= slot.sets;
  const isLast = a.idx === a.slots.length - 1;
  const secs = ex?.unit === 'secs';
  const aim = target.aims[Math.min(done.length, target.aims.length - 1)] ?? slot.low;

  const [reps, setReps] = useState(aim);
  /** One-arm work: the other arm's reps; null = it matched. */
  const [other, setOther] = useState<number | null>(null);
  const [load, setLoad] = useState(target.loadKg);
  const [rir, setRir] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'swap' | 'finish' | 'form' | 'hurts' | null>(null);
  const [edit, setEdit] = useState<SetLog | null>(null);
  const [holdFrom, setHoldFrom] = useState<number | null>(null);

  // New exercise or new set: start from today's target (and the weight just used).
  useEffect(() => {
    setReps(aim);
    setOther(null);
    setLoad(done.at(-1)?.loadKg ?? target.loadKg);
    setRir(null);
    setHoldFrom(null);
  }, [a.idx, slot.exerciseId, done.length]);

  const rest = a.restEnd ? Math.max(0, Math.ceil((a.restEnd - now) / 1000)) : 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (a.restEnd && rest === 0 && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([200, 100, 200]);
      setRest(null);
    }
    if (rest > 0) buzzed.current = false;
  }, [rest, a.restEnd]);

  // Hold timer for planks: counts up, stops by itself at the 2-minute cap.
  const held = holdFrom ? Math.min(HOLD_CAP_S, Math.floor((now - holdFrom) / 1000)) : 0;
  useEffect(() => {
    if (holdFrom && held >= HOLD_CAP_S) {
      navigator.vibrate?.(300);
      setReps(HOLD_CAP_S);
      setHoldFrom(null);
    }
  }, [held, holdFrom]);

  const log = () => {
    logSet({ exerciseId: slot.exerciseId, reps, repsR: ex?.match ? Math.min(other ?? reps, reps) : undefined, loadKg: ex?.loadable ? load : 0, rir: rir ?? undefined });
    if (!a.warm) setWarm(true);
    const nowDone = done.length + 1;
    if (nowDone >= slot.sets && !isLast) goTo(a.idx + 1);
    if (nowDone < slot.sets || !isLast) setRest(Date.now() + slot.restS * 1000);
    if (rir === 0 && !ex?.home) toast('That was all-out. Leave a rep or two in the tank next set.');
  };

  const total = a.slots.reduce((t, s) => t + s.sets, 0);
  const elapsed = Math.floor((now - a.start) / 60_000);
  const first = weakArm === 'right' ? 'Right' : 'Left';
  const second = weakArm === 'right' ? 'Left' : 'Right';
  const step = ex ? stepKg(ex, load, { machineStepKg: kit, packMaxKg: 40 }) : 1;
  const showWarm = !a.warm && a.sets.length === 0;

  const top = (
    <>
      <div className="between" style={{ alignItems: 'center' }}>
        <button className="btn icon" aria-label="Stop workout" onClick={() => confirm('Stop this workout without saving?') && (cancelWorkout(), go('today'))}>
          <Icon name="close" />
        </button>
        <span className="label" style={{ textAlign: 'center' }}>
          {a.name} · {a.idx + 1} of {a.slots.length} · {elapsed} min
        </span>
        <button className="btn sm" onClick={() => setSheet('finish')} disabled={!a.sets.length}>
          Finish
        </button>
      </div>
      <div className="steps" aria-hidden="true">
        {a.slots.map((s, i) => {
          const n = a.sets.filter((x) => x.exerciseId === s.exerciseId).length;
          return <i key={i} className={n >= s.sets ? 'done' : i === a.idx ? 'now' : ''} />;
        })}
      </div>
    </>
  );

  if (showWarm) {
    return (
      <main className="logger">
        <div className="stack logger-body">
          {top}
          <span className="pill" style={{ alignSelf: 'flex-start', marginTop: 8 }}>{phase.label}</span>
          <h1 className="title" style={{ fontSize: 32 }}>Warm-up first</h1>
          <p className="mut">About 8 minutes. It makes the first sets feel better and safer.</p>
          <section className="card stack" style={{ gap: 12 }}>
            {WARMUP.lines.map((l, i) => (
              <div key={l} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <span className="dot" style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                <span>{l}</span>
              </div>
            ))}
          </section>
          <p className="small mut">{phase.note}</p>
        </div>
        <div className="logbar">
          <button className="btn primary block" onClick={() => setWarm(true)}>
            <Icon name="check" size={20} stroke={3} /> Warm, start {ex?.name}
          </button>
          <button className="btn sm ghost" style={{ alignSelf: 'center' }} onClick={() => setWarm(true)}>
            Skip warm-up
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="logger">
      <div className="stack logger-body">
        {top}

        <section className="stack" style={{ gap: 8, marginTop: 8 }}>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <h1 className="title" style={{ fontSize: 30 }}>{ex?.name ?? slot.exerciseId}</h1>
            <button className="btn sm icon" aria-label="Swap exercise" onClick={() => setSheet('swap')} style={{ flex: 'none' }}>
              <Icon name="swap" size={20} />
            </button>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => setSheet('form')}>
              <Icon name="play" size={16} fill /> Form
            </button>
            <button className="btn sm" onClick={() => setSheet('hurts')}>
              <Icon name="alert" size={16} /> Something hurts
            </button>
            <span className="small mut">{ex?.muscles}</span>
          </div>
        </section>

        <section className="card soft stack" style={{ gap: 4 }} aria-label="Today's target">
          <div className="between">
            <span className="label">Today’s target</span>
            <span className="small bold acc">
              {target.rir[0] === target.rir[1] ? `Leave ${target.rir[0]}${target.rir[0] >= 4 ? '+' : ''}` : `Leave ${target.rir[0]}–${target.rir[1]}`} in the tank
            </span>
          </div>
          <p className="num" style={{ fontSize: 26 }}>{targetLine(ex, target)}</p>
          <p className="small">{target.why}</p>
          {a.idx === 0 && done.length === 0 && ex?.loadable && <p className="small mut">{RAMP}</p>}
        </section>

        <div className="lastrow" aria-label="Last time">
          <Icon name="clock" size={16} />
          {last ? (
            <span>
              <span className="bold">Last time</span> · {fmtDate(last.date, { weekday: 'short', day: 'numeric', month: 'short' })}:{' '}
              {ex?.loadable && usedLoad(last.sets) ? `${loadText(ex, usedLoad(last.sets))} × ` : ''}
              {last.sets.map((x) => countReps(x)).join(', ')}
              {secs ? ' s' : ''}
            </span>
          ) : (
            <span>
              <span className="bold">Last time</span> · first time doing this one
            </span>
          )}
        </div>

        <section className="stack" style={{ gap: 8 }} aria-label="Sets">
          {Array.from({ length: Math.max(slot.sets, done.length) }, (_, i) => {
            const x = done[i];
            const t = target.aims[Math.min(i, target.aims.length - 1)];
            return (
              <button key={i} className={`setrow ${x ? 'done' : i === done.length ? 'next' : ''}`} disabled={!x} onClick={() => x && setEdit(x)} aria-label={x ? `Edit set ${i + 1}` : `Set ${i + 1}`}>
                <span className={`dot ${x ? 'on' : ''}`}>{x && <Icon name="check" size={14} stroke={3} />}</span>
                <span className="grow bold" style={{ textAlign: 'left' }}>Set {i + 1}</span>
                <span className={x ? 'bold' : 'mut'}>{x ? `${setText(ex, x)}${x.rir != null ? ` · ${x.rir >= 4 ? '4+' : x.rir} left` : ''}` : `aim ${t}${secs ? ' s' : ''}`}</span>
                {x && <Icon name="pencil" size={16} />}
              </button>
            );
          })}
        </section>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn sm" disabled={a.idx === 0} onClick={() => goTo(a.idx - 1)}>
            <Icon name="left" size={18} /> Back
          </button>
          <span className="small mut">{a.sets.length} of {total} sets</span>
          <button className="btn sm" disabled={isLast} onClick={() => goTo(a.idx + 1)}>
            Skip <Icon name="right" size={18} />
          </button>
        </div>
      </div>

      <div className="logbar" aria-live="polite">
        {rest > 0 ? (
          <div className="row" style={{ gap: 14 }}>
            <Ring size={104} width={8} frac={rest / slot.restS}>
              <span className="timer" style={{ fontSize: 30 }}>{mmss(rest)}</span>
            </Ring>
            <div className="stack grow" style={{ gap: 8 }}>
              <span className="bold">Rest{allDone ? '' : ` · then set ${done.length + 1}`}</span>
              <span className="small mut">{allDone ? 'Then finish up' : `${ex?.loadable && load ? `${loadText(ex, load)} × ` : 'Aim for '}${aim}${secs ? ' s' : ''}`}</span>
              <div className="row">
                <button className="btn sm" onClick={() => setRest((a.restEnd ?? Date.now()) + 30_000)}>+30 s</button>
                <button className="btn sm primary grow" onClick={() => setRest(null)}>Skip rest</button>
              </div>
            </div>
          </div>
        ) : allDone ? (
          isLast ? (
            <button className="btn primary block" onClick={() => setSheet('finish')}>
              <Icon name="check" size={20} stroke={3} /> Finish workout
            </button>
          ) : (
            <button className="btn primary block" onClick={() => goTo(a.idx + 1)}>
              Next: {EX[a.slots[a.idx + 1].exerciseId]?.name} <Icon name="right" size={20} />
            </button>
          )
        ) : (
          <>
            <div className={ex?.loadable ? 'grid2' : 'stack'}>
              {ex?.loadable && (
                <label className="field">
                  <span>{loadLabel(ex)}</span>
                  <Stepper big value={load} onChange={setLoad} label={loadLabel(ex).toLowerCase()} step={step} min={0} max={300} round={0.5} />
                </label>
              )}
              <label className="field">
                <span>{secs ? 'Seconds' : ex?.match ? `${first} arm reps` : 'Reps'}{ex?.perSide && !ex.match ? ' (each side)' : ''}</span>
                {holdFrom ? (
                  <button className="btn block" style={{ minHeight: 66 }} onClick={() => (setReps(Math.max(1, held)), setHoldFrom(null))}>
                    <span className="num" style={{ fontSize: 28 }}>{mmss(held)}</span> Stop
                  </button>
                ) : (
                  <Stepper big value={reps} onChange={setReps} label={secs ? 'seconds' : 'reps'} step={secs ? 5 : 1} min={0} max={secs ? HOLD_CAP_S : 100} round={ex?.id === 'pushup' ? 0.5 : 1} />
                )}
              </label>
            </div>
            {secs && !holdFrom && (
              <button className="btn sm" onClick={() => setHoldFrom(Date.now())}>
                <Icon name="clock" size={16} /> Time this hold
              </button>
            )}
            {ex?.match && (
              <div className="between" style={{ alignItems: 'center' }}>
                <span className="small">
                  <span className="bold">{second} arm: {other == null || other >= reps ? `match ${reps}` : other}</span>
                  <span className="mut"> · never more than the {first.toLowerCase()}</span>
                </span>
                <span className="row">
                  <button className="btn sm icon" aria-label={`${second} arm did one less`} onClick={() => setOther(Math.max(0, Math.min(other ?? reps, reps) - 1))}>
                    <Icon name="minus" size={18} />
                  </button>
                  <button className="btn sm icon" aria-label={`${second} arm matched`} disabled={other == null || other >= reps} onClick={() => setOther(other != null && other + 1 >= reps ? null : (other ?? reps) + 1)}>
                    <Icon name="plus" size={18} />
                  </button>
                </span>
              </div>
            )}
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Good reps left in the tank</span>
              <div className="rir" role="group" aria-label="Reps in reserve">
                {RIR_OPTIONS.map((o) => (
                  <button key={o.v} className="chip" aria-pressed={rir === o.v} aria-label={`${o.label} left: ${o.hint}`} onClick={() => setRir(rir === o.v ? null : o.v)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              {a.sets.length > 0 && (
                <button className="btn icon" style={{ minHeight: 60, width: 60 }} aria-label="Undo last set" onClick={undoSet}>
                  <Icon name="undo" size={20} />
                </button>
              )}
              <button className="btn primary block" style={{ flex: 1, minHeight: 60, fontSize: 18 }} onClick={log} disabled={!!holdFrom}>
                Log set {done.length + 1} of {slot.sets}
              </button>
            </div>
          </>
        )}
      </div>

      {sheet === 'swap' && <SwapSheet slot={slot} onClose={() => setSheet(null)} />}
      {sheet === 'form' && (
        <Sheet onClose={() => setSheet(null)} label={`How to do ${ex?.name}`}>
          <Suspense fallback={<p className="mut">Loading…</p>}>
            <ExerciseInfo exerciseId={slot.exerciseId} />
          </Suspense>
        </Sheet>
      )}
      {sheet === 'hurts' && (
        <Sheet onClose={() => setSheet(null)} label="Something hurts">
          <h2 className="h2">Stop this exercise</h2>
          <p>Tired, burning muscles are normal. Sharp pain, a sudden twinge or pain in a joint is not: don’t push through it.</p>
          <p className="mut small">Swap to a different exercise or skip this one today. If it still hurts next session, or it hurts outside the gym, see a doctor or physio before training that area again.</p>
          <div className="grid2">
            <button className="btn" onClick={() => setSheet('swap')}>
              <Icon name="swap" size={18} /> Swap it
            </button>
            <button className="btn primary" onClick={() => (isLast ? setSheet('finish') : (goTo(a.idx + 1), setSheet(null)))}>
              Skip it
            </button>
          </div>
        </Sheet>
      )}
      {edit && <EditSetSheet set={edit} onClose={() => setEdit(null)} />}
      {sheet === 'finish' && (
        <FinishSheet
          onClose={() => setSheet(null)}
          onSave={(feel, note) => {
            const before = useStore.getState().sessions;
            const r = finishWorkout(feel, note);
            setSheet(null);
            if (!r) return go('today');
            const recs = newRecords(r.session, before).map((x) => `${EX[x.exerciseId]?.name}: ${countReps(x)}${EX[x.exerciseId]?.unit === 'secs' ? ' s' : ''}${x.loadKg ? ` @ ${loadText(EX[x.exerciseId], x.loadKg) || `${x.loadKg} kg`}` : ''}`);
            onDone({ ...r, records: recs });
          }}
        />
      )}
    </main>
  );
}

function EditSetSheet({ set, onClose }: { set: SetLog; onClose: () => void }) {
  const ex = EX[set.exerciseId];
  const editSet = useStore((s) => s.editSet);
  const [reps, setReps] = useState(set.reps);
  const [other, setOther] = useState(set.repsR ?? set.reps);
  const [load, setLoad] = useState(set.loadKg);
  const [rir, setRir] = useState<number | null>(set.rir ?? null);
  return (
    <Sheet onClose={onClose} label="Edit set">
      <h2 className="h2">Edit set</h2>
      <div className="grid2">
        {ex?.loadable && (
          <label className="field">
            <span>{loadLabel(ex)}</span>
            <Stepper value={load} onChange={setLoad} label="weight" step={ex.load === 'db' ? 1 : 2.5} max={300} />
          </label>
        )}
        <label className="field">
          <span>{ex?.unit === 'secs' ? 'Seconds' : ex?.match ? 'First arm reps' : 'Reps'}</span>
          <Stepper value={reps} onChange={setReps} label="reps" step={ex?.unit === 'secs' ? 5 : 1} max={300} />
        </label>
        {ex?.match && (
          <label className="field">
            <span>Other arm reps</span>
            <Stepper value={other} onChange={setOther} label="other arm reps" max={300} />
          </label>
        )}
      </div>
      <div className="rir" role="group" aria-label="Reps in reserve">
        {RIR_OPTIONS.map((o) => (
          <button key={o.v} className="chip" aria-pressed={rir === o.v} onClick={() => setRir(rir === o.v ? null : o.v)}>
            {o.label}
          </button>
        ))}
      </div>
      <button
        className="btn primary block"
        onClick={() => {
          editSet(set.id, { reps, repsR: ex?.match ? other : undefined, loadKg: ex?.loadable ? load : 0, rir: rir ?? undefined });
          onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

function SwapSheet({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const ex = EX[slot.exerciseId];
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const taken = useStore((s) => s.active?.slots.map((x) => x.exerciseId) ?? []);
  const options = EXERCISES.filter((e) => e.pattern === ex?.pattern && e.id !== slot.exerciseId && usable(e) && !taken.includes(e.id));

  const apply = (forPlan: boolean) => {
    if (!pick) return;
    const st = useStore.getState();
    const a = st.active!;
    const to = EX[pick];
    const range = to.unit !== ex?.unit || to.loadable !== ex?.loadable ? (to.unit === 'secs' ? { low: 20, high: 40 } : to.loadable ? { low: 10, high: 15 } : { low: 6, high: 12 }) : {};
    const fix = (s: Slot): Slot => (s.exerciseId === slot.exerciseId ? { ...s, exerciseId: pick, loadKg: to.startKg ?? 0, ...range } : s);
    useStore.setState({ active: { ...a, slots: a.slots.map(fix) } });
    if (forPlan) {
      const p = st.program;
      st.setProgram({ ...p, days: p.days.map((d) => (d.id === a.dayId ? { ...d, slots: d.slots.map(fix) } : d)) }, 'me', reason || `Swapped ${ex?.name}`);
    }
    toast(`Swapped to ${to.name}${forPlan ? ' in your plan' : ' for today'}`);
    onClose();
  };

  return (
    <Sheet onClose={onClose} label="Swap exercise">
      <h2 className="h2">Swap {ex?.name}</h2>
      <p className="small mut">Machine taken, or it doesn’t feel right? Pick another one for the same muscles.</p>
      {hasAi(currentAi()) && (
        <div className="stack">
          <label className="field">
            <span>Why? Your coach picks one</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Machine is taken / my wrist hurts" />
          </label>
          <button
            className="btn"
            disabled={busy || !reason.trim()}
            onClick={() => {
              setBusy(true);
              suggestSwap(slot.exerciseId, reason)
                .then((r) => (setPick(r.exerciseId), setWhy(r.why)))
                .catch((e) => toast(friendlyError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <Icon name="spark" size={18} /> {busy ? 'Thinking…' : 'Ask coach'}
          </button>
          {why && <p className="small" style={{ color: 'var(--acc)' }}>{why}</p>}
        </div>
      )}
      <span className="label">{ex ? PATTERN_LABEL[ex.pattern] : ''} exercises</span>
      <div className="stack" style={{ gap: 6 }}>
        {options.map((e) => (
          <button key={e.id} className="chip tall" aria-pressed={pick === e.id} onClick={() => setPick(e.id)}>
            <span className="bold">{e.name}</span>
            <span className="small">{e.muscles}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <button className="btn" disabled={!pick} onClick={() => apply(false)}>Just today</button>
        <button className="btn primary" disabled={!pick} onClick={() => apply(true)}>In my plan</button>
      </div>
    </Sheet>
  );
}

function FinishSheet({ onClose, onSave }: { onClose: () => void; onSave: (feel: number | undefined, note: string) => void }) {
  const [feel, setFeel] = useState<number | undefined>();
  const [note, setNote] = useState('');
  return (
    <Sheet onClose={onClose} label="Finish workout">
      <h2 className="h2">How did it feel?</h2>
      <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Feel">
        {FEEL.map((l, i) => (
          <button key={l} className="chip" style={{ flex: '1 0 auto', minHeight: 48 }} aria-pressed={feel === i + 1} onClick={() => setFeel(i + 1)}>
            {l}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Note (optional)</span>
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything sore, easy or worth remembering" />
      </label>
      <button className="btn primary block" onClick={() => onSave(feel, note)}>
        Save workout
      </button>
    </Sheet>
  );
}

function Summary({ session, lines, records }: Done) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ai = hasAi(currentAi());
  useEffect(() => {
    if (!ai) return;
    setBusy(true);
    postWorkout(session)
      .then(setText)
      .catch((e) => setText(friendlyError(e)))
      .finally(() => setBusy(false));
  }, []);
  const mins = Math.max(1, Math.round((session.end - session.start) / 60_000));
  return (
    <main className="page celebrate" style={{ paddingTop: 40, gap: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: 22, background: 'var(--acc)', color: 'var(--on-acc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={34} stroke={3} />
      </div>
      <h1 className="title" style={{ fontSize: 40 }}>{session.name} done</h1>
      <div className="grid3">
        <div className="tile">
          <p className="num" style={{ fontSize: 26 }}>{mins}</p>
          <span className="small mut">minutes</span>
        </div>
        <div className="tile">
          <p className="num" style={{ fontSize: 26 }}>{session.sets.length}</p>
          <span className="small mut">sets</span>
        </div>
        <div className="tile">
          <p className="num" style={{ fontSize: 26 }}>{records.length}</p>
          <span className="small mut">new bests</span>
        </div>
      </div>
      {records.length > 0 && (
        <section className="card stack">
          <h2 className="h2">New bests</h2>
          {records.map((r) => (
            <p key={r} className="row bold">
              <Icon name="medal" size={18} /> {r}
            </p>
          ))}
        </section>
      )}
      {lines.length > 0 && (
        <section className="card soft stack">
          <h2 className="h2">Next time</h2>
          <p className="small mut">Worked out from today’s sets.</p>
          {lines.map((l) => (
            <p key={l} className="bold acc">{l}</p>
          ))}
        </section>
      )}
      <section className="card stack" style={{ gap: 10 }}>
        <h2 className="h2">{COOLDOWN.title}</h2>
        {COOLDOWN.lines.map((l) => (
          <div key={l} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <span className="acc" style={{ marginTop: 1 }}><Icon name="check" size={18} stroke={3} /></span>
            <span className="small">{l}</span>
          </div>
        ))}
      </section>
      {ai && (
        <section className="card stack">
          <span className="row label">
            <Icon name="spark" size={16} /> Coach
          </span>
          <p>{busy ? 'Looking at your sets…' : text}</p>
        </section>
      )}
      <a href="#/today" className="btn primary block">Done</a>
    </main>
  );
}
