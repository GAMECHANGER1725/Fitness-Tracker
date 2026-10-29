import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { EX, EXERCISES, PATTERN_LABEL, targetText, usable } from '../lib/exercises';
import { historyOf, newRecords } from '../lib/progress';
import { currentAi, postWorkout, suggestSwap } from '../lib/coach';
import { friendlyError, hasAi } from '../lib/ai';
import { beep, holdWakeLock, primeAudio, usePlayer } from '../lib/player';
import { Icon, Ring, Sheet, Stepper, go, toast, useNow } from '../components/ui';
import type { Session, SetLog, Slot } from '../lib/types';

const FEEL = ['Rough', 'Meh', 'OK', 'Good', 'Great'];
const EFFORT: [number, string][] = [
  [6, 'Easy'],
  [8, 'Solid'],
  [9, 'Hard'],
  [10, 'All out'],
];

export default function Workout() {
  const active = useStore((s) => s.active);
  const [result, setResult] = useState<{ session: Session; lines: string[]; records: string[] } | null>(null);
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

function Player({ onDone }: { onDone: (r: { session: Session; lines: string[]; records: string[] }) => void }) {
  const a = useStore((s) => s.active)!;
  const sessions = useStore((s) => s.sessions);
  const { logSet, undoSet, goTo, setRest, cancelWorkout, finishWorkout } = useStore.getState();
  const now = useNow(500);
  const slot = a.slots[a.idx];
  const ex = EX[slot.exerciseId];
  const done = a.sets.filter((x) => x.exerciseId === slot.exerciseId);
  const last = historyOf(sessions, slot.exerciseId)[0];
  const suggest = last?.[done.length]?.reps ?? last?.at(-1)?.reps ?? slot.low;
  const [reps, setReps] = useState(suggest);
  const [load, setLoad] = useState(slot.loadKg);
  const [rpe, setRpe] = useState<number | null>(null);
  const [swap, setSwap] = useState(false);
  const [finish, setFinish] = useState(false);
  const [fix, setFix] = useState<SetLog | null>(null);
  const [extra, setExtra] = useState(false);
  const allDone = done.length >= slot.sets && !extra;

  // New exercise or new set: start from last time's numbers.
  useEffect(() => {
    setReps(suggest);
    setLoad(slot.loadKg);
    setRpe(null);
    setExtra(false);
  }, [a.idx, slot.exerciseId, done.length]);

  const prefs = usePlayer();
  useEffect(() => holdWakeLock(prefs.awake), [prefs.awake]);

  const rest = a.restEnd ? Math.max(0, Math.ceil((a.restEnd - now) / 1000)) : 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (a.restEnd && rest === 0 && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([200, 100, 200]);
      if (prefs.beep) beep();
      setRest(null);
    }
    if (rest > 0) buzzed.current = false;
  }, [rest, a.restEnd]);

  const log = () => {
    if (prefs.beep) primeAudio();
    logSet({ exerciseId: slot.exerciseId, reps, loadKg: ex?.loadable ? load : 0, rpe: rpe ?? undefined });
    const nowDone = done.length + 1;
    if (nowDone < slot.sets || a.idx < a.slots.length - 1) setRest(Date.now() + slot.restS * 1000);
  };

  const total = a.slots.reduce((t, s) => t + s.sets, 0);
  const elapsed = Math.floor((now - a.start) / 60_000);

  return (
    <main style={{ padding: '18px 16px 32px' }} className="stack">
      <div className="between" style={{ alignItems: 'center' }}>
        <button className="btn icon" aria-label="Stop workout" onClick={() => confirm('Stop this workout without saving?') && (cancelWorkout(), go('today'))}>
          <Icon name="close" />
        </button>
        <span className="label">
          {a.name} · {a.idx + 1} of {a.slots.length} · {elapsed} min
        </span>
        <button className="btn sm" onClick={() => setFinish(true)} disabled={!a.sets.length}>
          Finish
        </button>
      </div>
      <div className="steps" aria-hidden="true">
        {a.slots.map((s, i) => {
          const n = a.sets.filter((x) => x.exerciseId === s.exerciseId).length;
          return <i key={i} className={n >= s.sets ? 'done' : i === a.idx ? 'now' : ''} />;
        })}
      </div>

      <section className="stack" style={{ gap: 6, marginTop: 8 }}>
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <h1 className="title" style={{ fontSize: 32 }}>{ex?.name ?? slot.exerciseId}</h1>
          <button className="btn sm icon" aria-label="Swap exercise" onClick={() => setSwap(true)}>
            <Icon name="swap" size={20} />
          </button>
        </div>
        <p className="mut">
          {slot.sets} set{slot.sets === 1 ? '' : 's'} × {targetText(ex, slot.low, slot.high)}
          {ex?.loadable && slot.loadKg ? ` · ${slot.loadKg} kg in the backpack` : ''}
          {last ? ` · last time ${last.map((x) => x.reps).join(', ')}` : ''}
        </p>
        <ul className="small mut" style={{ margin: 0, paddingLeft: 18 }}>
          {ex?.cues.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </section>

      {rest > 0 ? (
        <section className="card stack" style={{ alignItems: 'center', gap: 12 }} aria-live="polite">
          <span className="label">Rest</span>
          <Ring size={176} width={10} frac={rest / slot.restS}>
            <span className="timer">{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}</span>
            <span className="small mut">{allDone ? 'next exercise' : `next: set ${done.length + 1}`}</span>
          </Ring>
          <div className="row">
            <button className="btn sm" onClick={() => setRest((a.restEnd ?? Date.now()) + 30_000)}>+30 s</button>
            <button className="btn sm" onClick={() => setRest(null)}>Skip rest</button>
          </div>
        </section>
      ) : null}

      <section className="stack" style={{ gap: 8 }} aria-label="Sets">
        {Array.from({ length: Math.max(slot.sets, done.length + (extra ? 1 : 0)) }, (_, i) => {
          const x = done[i];
          return (
            <div
              key={i}
              className={`setrow ${x ? 'done' : i === done.length ? 'next' : ''}`}
              {...(x ? { role: 'button', tabIndex: 0, 'aria-label': `Edit set ${i + 1}`, onClick: () => setFix(x), onKeyDown: (e: { key: string }) => e.key === 'Enter' && setFix(x), style: { cursor: 'pointer' } } : {})}
            >
              <span className={`dot ${x ? 'on' : ''}`}>{x && <Icon name="check" size={14} stroke={3} />}</span>
              <span className="grow bold">Set {i + 1}</span>
              <span className={x ? 'bold' : 'mut'}>
                {x ? `${x.reps}${ex?.unit === 'secs' ? ' s' : ' reps'}${x.loadKg ? ` · ${x.loadKg} kg` : ''}` : targetText(ex, slot.low, slot.high)}
              </span>
              {x && <Icon name="pencil" size={16} />}
            </div>
          );
        })}
      </section>

      {!allDone ? (
        <section className="card stack" style={{ gap: 12 }}>
          {ex?.unit === 'secs' && <HoldTimer low={slot.low} high={slot.high} onStop={setReps} />}
          <div className={ex?.loadable ? 'grid2' : 'stack'}>
            <label className="field">
              <span>{ex?.unit === 'secs' ? 'Seconds' : 'Reps'}{ex?.perSide ? ' (each side)' : ''}</span>
              <Stepper value={reps} onChange={setReps} label={ex?.unit === 'secs' ? 'seconds' : 'reps'} step={ex?.unit === 'secs' ? 5 : 1} min={0} max={300} />
            </label>
            {ex?.loadable && (
              <label className="field">
                <span>Backpack kg</span>
                <Stepper value={load} onChange={setLoad} label="backpack kilograms" step={0.5} min={0} max={40} />
              </label>
            )}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">How hard was it?</span>
            <div className="grid4" role="group" aria-label="Effort">
              {EFFORT.map(([v, l]) => (
                <button key={v} className="chip" aria-pressed={rpe === v} onClick={() => setRpe(rpe === v ? null : v)} style={{ padding: 0 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            {extra ? (
              <button className="btn icon" aria-label="Don't add a set" onClick={() => setExtra(false)}>
                <Icon name="close" size={20} />
              </button>
            ) : done.length > 0 && (
              <button className="btn icon" aria-label="Undo last set" onClick={undoSet}>
                <Icon name="undo" size={20} />
              </button>
            )}
            <button className="btn primary block" style={{ flex: 1 }} onClick={log}>
              Log {extra ? 'extra ' : ''}set {done.length + 1}
            </button>
          </div>
        </section>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => setExtra(true)} aria-label="Add a set">
            <Icon name="plus" size={18} /> Set
          </button>
          {a.idx < a.slots.length - 1 ? (
            <button className="btn primary block" style={{ flex: 1 }} onClick={() => goTo(a.idx + 1)}>
              Next: {EX[a.slots[a.idx + 1].exerciseId]?.name} <Icon name="right" size={20} />
            </button>
          ) : (
            <button className="btn primary block" style={{ flex: 1 }} onClick={() => setFinish(true)}>
              <Icon name="check" size={20} stroke={3} /> Finish workout
            </button>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn sm" disabled={a.idx === 0} onClick={() => goTo(a.idx - 1)}>
          <Icon name="left" size={18} /> Back
        </button>
        <span className="small mut">{a.sets.length} of {total} sets</span>
        <button className="btn sm" disabled={a.idx === a.slots.length - 1} onClick={() => goTo(a.idx + 1)}>
          Skip <Icon name="right" size={18} />
        </button>
      </div>

      {fix && <FixSetSheet set={fix} loadable={!!ex?.loadable} secs={ex?.unit === 'secs'} onClose={() => setFix(null)} />}
      {swap && <SwapSheet slot={slot} onClose={() => setSwap(false)} />}
      {finish && (
        <FinishSheet
          onClose={() => setFinish(false)}
          onSave={(feel, note) => {
            const before = useStore.getState().sessions;
            const r = finishWorkout(feel, note);
            setFinish(false);
            if (!r) return go('today');
            const recs = newRecords(r.session, before).map((x) => `${EX[x.exerciseId]?.name}: ${x.reps}${EX[x.exerciseId]?.unit === 'secs' ? ' s' : ''}${x.loadKg ? ` @ ${x.loadKg} kg` : ''}`);
            onDone({ ...r, records: recs });
          }}
        />
      )}
    </main>
  );
}

const COUNT_IN_MS = 3000;

/** Times a hold: a 3 s count-in to get into position, buzzes at the bottom and top of the range, Stop fills in the seconds.
 * ponytail: lives in component state, so leaving the page mid-hold loses it; holds are under two minutes. */
function HoldTimer({ low, high, onStop }: { low: number; high: number; onStop: (secs: number) => void }) {
  const [start, setStart] = useState<number | null>(null);
  const now = useNow(200);
  const buzzed = useRef(0);
  const secs = start == null ? 0 : Math.floor((now - start) / 1000);
  const ready = start != null && now < start;
  useEffect(() => {
    if (start == null || ready) return;
    for (const [mark, n] of [[0, 1], [low, 2], [high, 3]] as const) {
      if (secs >= mark && buzzed.current < n) {
        buzzed.current = n;
        navigator.vibrate?.(n === 3 ? [200, 100, 200] : 150);
      }
    }
  }, [secs, ready, start]);
  if (start == null) {
    return (
      <button className="btn block" onClick={() => ((buzzed.current = 0), setStart(Date.now() + COUNT_IN_MS))}>
        <Icon name="clock" size={18} /> Time this hold
      </button>
    );
  }
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 10 }} aria-live="polite">
      <Ring size={150} width={10} frac={ready ? 0 : Math.min(1, secs / high)} color={secs >= low ? 'var(--acc)' : 'var(--line2)'}>
        <span className="timer">{ready ? Math.ceil((start - now) / 1000) : secs}</span>
        <span className="small mut">{ready ? 'get in position' : secs >= high ? 'top of the range' : secs >= low ? `in range, ${high - secs} s to the top` : `${low - secs} s to go`}</span>
      </Ring>
      <div className="row">
        <button className="btn sm" onClick={() => setStart(null)}>Cancel</button>
        <button className="btn sm primary" disabled={ready} onClick={() => (onStop(secs), setStart(null))}>
          Stop at {secs} s
        </button>
      </div>
    </div>
  );
}

function FixSetSheet({ set, loadable, secs, onClose }: { set: SetLog; loadable: boolean; secs: boolean; onClose: () => void }) {
  const editSet = useStore((s) => s.editSet);
  const [reps, setReps] = useState(set.reps);
  const [load, setLoad] = useState(set.loadKg);
  return (
    <Sheet onClose={onClose} label="Edit set">
      <h2 className="h2">Fix this set</h2>
      <div className={loadable ? 'grid2' : 'stack'}>
        <label className="field">
          <span>{secs ? 'Seconds' : 'Reps'}</span>
          <Stepper value={reps} onChange={setReps} label={secs ? 'seconds' : 'reps'} step={secs ? 5 : 1} min={0} max={300} />
        </label>
        {loadable && (
          <label className="field">
            <span>Backpack kg</span>
            <Stepper value={load} onChange={setLoad} label="backpack kilograms" step={0.5} min={0} max={40} />
          </label>
        )}
      </div>
      <div className="grid2">
        <button className="btn danger" onClick={() => (editSet(set.id, null), onClose())}>
          <Icon name="trash" size={18} /> Remove
        </button>
        <button className="btn primary" onClick={() => (editSet(set.id, { reps, loadKg: loadable ? load : 0 }), onClose())}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

function SwapSheet({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const ex = EX[slot.exerciseId];
  const hasGrip = useStore((s) => s.profile.hasGrip);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const options = EXERCISES.filter((e) => e.pattern === ex?.pattern && e.id !== slot.exerciseId && usable(e, hasGrip));

  const apply = (forPlan: boolean) => {
    if (!pick) return;
    const st = useStore.getState();
    const a = st.active!;
    const to = EX[pick];
    const fix = (s: Slot): Slot => (s.exerciseId === slot.exerciseId ? { ...s, exerciseId: pick, loadKg: to.loadable ? s.loadKg : 0, ...(to.unit !== ex?.unit ? (to.unit === 'secs' ? { low: 20, high: 40 } : { low: 8, high: 12 }) : {}) } : s);
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
      {hasAi(currentAi()) && (
        <div className="stack">
          <label className="field">
            <span>Why? Your coach picks one</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="My wrist hurts / too easy / no space" />
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
          <button key={e.id} className="chip" aria-pressed={pick === e.id} onClick={() => setPick(e.id)} style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', minHeight: 48, textAlign: 'left' }}>
            <span>{e.name}</span>
            <span className="small" style={{ opacity: 0.7 }}>{e.muscles}</span>
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
          <button key={l} className="chip" style={{ flex: '1 0 auto' }} aria-pressed={feel === i + 1} onClick={() => setFeel(i + 1)}>
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

function Summary({ session, lines, records }: { session: Session; lines: string[]; records: string[] }) {
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
          <p className="small mut">You hit the top of the range, so these step up.</p>
          {lines.map((l) => (
            <p key={l} className="bold acc">{l}</p>
          ))}
        </section>
      )}
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
