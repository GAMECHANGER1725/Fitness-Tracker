import { useState } from 'react';
import { useStore } from '../lib/store';
import { EX, EXERCISES, PATTERN_LABEL, targetText, usable } from '../lib/exercises';
import { WEEKDAYS, minutes, moveSlot } from '../lib/program';
import { records, trendOf, weeklySets } from '../lib/progress';
import { addDays, daysBetween, fmtDate } from '../lib/dates';
import { Head, Icon, ProfileLink, Sheet, Stepper, go, toast, useGame, useRoute, useToday } from '../components/ui';
import { useReadiness } from '../components/data';
import type { Exercise, Pattern, PlanDay, Program, Session, Slot } from '../lib/types';

const TABS = [
  ['plan', 'Plan'],
  ['history', 'History'],
  ['moves', 'Exercises'],
  ['badges', 'Badges'],
] as const;

export default function Train() {
  const { params } = useRoute();
  const tab = params.get('tab') ?? 'plan';
  return (
    <main>
      <Head over="Home workouts" title="Train" right={<ProfileLink />} />
      <div className="page">
        <div className="seg" role="group" aria-label="Train sections">
          {TABS.map(([id, l]) => (
            <button key={id} aria-pressed={tab === id} onClick={() => go(`train?tab=${id}`)}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'history' ? <History /> : tab === 'moves' ? <Moves /> : tab === 'badges' ? <BadgeGrid /> : <Plan />}
      </div>
    </main>
  );
}

function Plan() {
  const program = useStore((s) => s.program);
  const log = useStore((s) => s.programLog);
  const { setProgram, undoProgram, startWorkout } = useStore.getState();
  const ready = useReadiness();
  const [edit, setEdit] = useState<{ day: string; idx: number | null } | null>(null);
  const [order, setOrder] = useState<string | null>(null);
  const wk = weeklySets(program);
  const last = log.at(-1);
  const save = (p: Program, why: string) => setProgram(p, 'me', why);

  return (
    <>
      <section className="card stack" style={{ gap: 10 }} aria-label="Weekly schedule">
        <h2 className="h2">Week</h2>
        {WEEKDAYS.map((w, i) => (
          <label key={w} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="bold" style={{ width: 48 }}>{w}</span>
            <select
              className="input"
              style={{ maxWidth: 220, minHeight: 44 }}
              value={program.week[i] ?? ''}
              onChange={(e) => save({ ...program, week: program.week.map((x, j) => (j === i ? e.target.value || null : x)) }, `${w} changed`)}
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
                {program.week.map((x, i) => (x === d.id ? WEEKDAYS[i] : null)).filter(Boolean).join(', ') || 'Not scheduled'} · {minutes(d.slots)} min
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
              if (order === d.id)
                return (
                  <div key={s.exerciseId} className="item" style={{ borderTop: i ? '1px solid var(--line)' : 0 }}>
                    <span className="grow bold">{e?.name}</span>
                    <button className="btn sm icon" aria-label={`Move ${e?.name} earlier`} disabled={i === 0} onClick={() => save(moveSlot(program, d.id, i, -1), `Reordered ${d.name}`)}>
                      <Icon name="up" size={20} stroke={2.5} />
                    </button>
                    <button className="btn sm icon" aria-label={`Move ${e?.name} later`} disabled={i === d.slots.length - 1} onClick={() => save(moveSlot(program, d.id, i, 1), `Reordered ${d.name}`)}>
                      <Icon name="down" size={20} stroke={2.5} />
                    </button>
                  </div>
                );
              return (
                <button key={s.exerciseId} className="item" style={{ width: '100%', background: 'none', border: 0, borderTop: i ? '1px solid var(--line)' : 0, color: 'var(--ink)', textAlign: 'left' }} onClick={() => setEdit({ day: d.id, idx: i })}>
                  <span className="grow">
                    <span className="bold" style={{ display: 'block' }}>{e?.name}</span>
                    <span className="small mut">
                      {s.sets} × {targetText(e, s.low, s.high)}
                      {s.loadKg ? ` · ${s.loadKg} kg` : ''} · rest {s.restS} s
                    </span>
                  </span>
                  <Icon name="pencil" size={18} />
                </button>
              );
            })}
            <div className="between" style={{ margin: '6px 0 10px' }}>
              {order === d.id ? (
                <span className="small mut">Saved as you go. Undo is above.</span>
              ) : (
                <button className="btn sm" style={{ background: 'transparent', color: 'var(--acc)', padding: 0 }} onClick={() => setEdit({ day: d.id, idx: null })}>
                  <Icon name="plus" size={18} /> Add exercise
                </button>
              )}
              {d.slots.length > 1 && (
                <button className="btn sm" style={{ background: 'transparent', color: 'var(--acc)', padding: 0 }} onClick={() => setOrder(order === d.id ? null : d.id)}>
                  {order === d.id ? 'Done' : 'Reorder'}
                </button>
              )}
            </div>
          </div>
        </section>
      ))}
      {edit && <SlotSheet program={program} dayId={edit.day} idx={edit.idx} onClose={() => setEdit(null)} onSave={save} />}
    </>
  );
}

function SlotSheet({ program, dayId, idx, onClose, onSave }: { program: Program; dayId: string; idx: number | null; onClose: () => void; onSave: (p: Program, why: string) => void }) {
  const day = program.days.find((d) => d.id === dayId)!;
  const hasGrip = useStore((s) => s.profile.hasGrip);
  const packMax = useStore((s) => s.profile.packMaxKg);
  const cur = idx == null ? null : day.slots[idx];
  const [s, setS] = useState<Slot>(cur ?? { exerciseId: '', sets: 3, low: 8, high: 12, restS: 60, loadKg: 0 });
  const [picking, setPicking] = useState(!cur);
  const e = EX[s.exerciseId];
  const put = (slots: Slot[]): PlanDay => ({ ...day, slots });
  const commit = (d: PlanDay, why: string) => {
    onSave({ ...program, days: program.days.map((x) => (x.id === dayId ? d : x)) }, why);
    onClose();
  };

  if (picking) {
    const taken = new Set(day.slots.map((x) => x.exerciseId));
    const groups = (Object.keys(PATTERN_LABEL) as Pattern[]).map((p) => [p, EXERCISES.filter((x) => x.pattern === p && usable(x, hasGrip) && (!taken.has(x.id) || x.id === s.exerciseId))] as const);
    return (
      <Sheet onClose={onClose} label="Pick an exercise">
        <h2 className="h2">Pick an exercise</h2>
        {groups.map(([p, list]) => (
          <div key={p} className="stack" style={{ gap: 6 }}>
            <span className="label">{PATTERN_LABEL[p]}</span>
            {list.map((x) => (
              <button
                key={x.id}
                className="chip"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, textAlign: 'left' }}
                onClick={() => {
                  setS({ ...s, exerciseId: x.id, loadKg: x.loadable ? s.loadKg : 0, ...(x.unit === 'secs' ? { low: 20, high: 40 } : EX[s.exerciseId]?.unit === 'secs' ? { low: 8, high: 12 } : {}) });
                  setPicking(false);
                }}
              >
                <span>{x.name}</span>
                <span className="small" style={{ opacity: 0.7 }}>{x.muscles}</span>
              </button>
            ))}
          </div>
        ))}
      </Sheet>
    );
  }

  const secs = e?.unit === 'secs';
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
        <Stepper value={s.sets} onChange={(v) => setS({ ...s, sets: v })} label="sets" min={1} max={6} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>From ({secs ? 's' : 'reps'})</span>
          <Stepper value={s.low} onChange={(v) => setS({ ...s, low: v, high: Math.max(v, s.high) })} label="lowest" step={secs ? 5 : 1} min={1} max={secs ? 180 : 50} />
        </label>
        <label className="field">
          <span>To ({secs ? 's' : 'reps'})</span>
          <Stepper value={s.high} onChange={(v) => setS({ ...s, high: v, low: Math.min(v, s.low) })} label="highest" step={secs ? 5 : 1} min={1} max={secs ? 180 : 50} />
        </label>
      </div>
      <div className={e?.loadable ? 'grid2' : 'stack'}>
        {e?.loadable && (
          <label className="field">
            <span>Backpack kg (max {packMax})</span>
            <Stepper value={s.loadKg} onChange={(v) => setS({ ...s, loadKg: Math.min(v, packMax) })} label="backpack kilograms" step={0.5} max={packMax} />
          </label>
        )}
        <label className="field">
          <span>Rest (s)</span>
          <Stepper value={s.restS} onChange={(v) => setS({ ...s, restS: v })} label="rest seconds" step={15} min={15} max={300} />
        </label>
      </div>
      <div className="row">
        {cur && (
          <button className="btn danger" disabled={day.slots.length <= 1} onClick={() => commit(put(day.slots.filter((_, i) => i !== idx)), `Removed ${e?.name}`)}>
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

function History() {
  const sessions = useStore((s) => s.sessions);
  const del = useStore((s) => s.deleteSession);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Session | null>(null);
  const list = Object.values(sessions).sort((a, b) => b.start - a.start);
  const [past, setPast] = useState(false);
  const add = (
    <button className="btn block" onClick={() => setPast(true)}>
      <Icon name="plus" size={18} /> Log a workout I already did
    </button>
  );
  const sheet = past && <PastSheet onClose={() => setPast(false)} />;
  if (!list.length)
    return (
      <>
        <p className="empty">No workouts yet. Your finished workouts show up here.</p>
        {add}
        {sheet}
      </>
    );
  return (
    <>
      {add}
      {sheet}
      {list.map((s) => {
        const by = new Map<string, typeof s.sets>();
        for (const x of s.sets) by.set(x.exerciseId, [...(by.get(x.exerciseId) ?? []), x]);
        const isOpen = open === s.id;
        return (
          <section key={s.id} className="card tight stack" style={{ gap: 8 }}>
            <button className="row" style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink)', textAlign: 'left' }} onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
              <span className="grow">
                <span className="bold" style={{ display: 'block' }}>{s.name}</span>
                <span className="small mut">
                  {fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.max(1, Math.round((s.end - s.start) / 60_000))} min · {s.sets.length} set{s.sets.length === 1 ? '' : 's'}
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
                      {xs.map((x) => x.reps).join(', ')}
                      {EX[id]?.unit === 'secs' ? ' s' : ''}
                      {xs[0].loadKg ? ` @ ${xs[0].loadKg} kg` : ''}
                    </span>
                  </p>
                ))}
                {s.feel && <p className="small mut">Felt {FEEL[s.feel - 1].toLowerCase()}</p>}
                {s.note && <p className="small mut">“{s.note}”</p>}
                <div className="row">
                  <button className="btn sm" onClick={() => setEdit(s)}>
                    <Icon name="pencil" size={16} /> Edit
                  </button>
                  <button className="btn sm danger" onClick={() => confirm('Delete this workout?') && del(s.id)}>
                    <Icon name="trash" size={16} /> Delete
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}
      {edit && <EditSessionSheet session={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

const FEEL = ['Rough', 'Meh', 'OK', 'Good', 'Great'];

/** Pick a plan day and the day you did it, then fill in the sets in the player as usual. */
function PastSheet({ onClose }: { onClose: () => void }) {
  const today = useToday();
  const days = useStore((s) => s.program.days);
  const active = useStore((s) => s.active);
  const startWorkout = useStore((s) => s.startWorkout);
  const [date, setDate] = useState(addDays(today, -1));
  const [dayId, setDayId] = useState(days[0]?.id ?? '');
  const day = days.find((d) => d.id === dayId);
  return (
    <Sheet onClose={onClose} label="Log a past workout">
      <h2 className="h2">Log a workout I already did</h2>
      <label className="field">
        <span>Day</span>
        <input className="input" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Which workout?</span>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {days.map((d) => (
            <button key={d.id} className="chip" aria-pressed={dayId === d.id} onClick={() => setDayId(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
      </div>
      <p className="small mut">You’ll enter the sets in the workout screen (no rest timers). It’s saved on the day you picked.</p>
      {active && <p className="small" style={{ color: 'var(--danger)' }}>Finish or stop the workout in progress first.</p>}
      <button
        className="btn primary block"
        disabled={!day || !!active}
        onClick={() => {
          startWorkout(day!, false, date);
          go('workout');
        }}
      >
        Enter the sets
      </button>
    </Sheet>
  );
}

function EditSessionSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const today = useToday();
  const editSession = useStore((s) => s.editSession);
  const [date, setDate] = useState(session.date);
  const [feel, setFeel] = useState(session.feel);
  const [note, setNote] = useState(session.note ?? '');
  return (
    <Sheet onClose={onClose} label="Edit workout">
      <h2 className="h2">Edit {session.name}</h2>
      <label className="field">
        <span>Day</span>
        <input className="input" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">How did it feel?</span>
        <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Feel">
          {FEEL.map((l, i) => (
            <button key={l} className="chip" style={{ flex: '1 0 auto' }} aria-pressed={feel === i + 1} onClick={() => setFeel(feel === i + 1 ? undefined : i + 1)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Note</span>
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything sore, easy or worth remembering" />
      </label>
      <button
        className="btn primary block"
        onClick={() => {
          editSession(session.id, { date, feel, note });
          toast('Saved');
          onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

function Moves() {
  const sessions = useStore((s) => s.sessions);
  const hasGrip = useStore((s) => s.profile.hasGrip);
  const best = records(sessions);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {(Object.keys(PATTERN_LABEL) as Pattern[]).map((p) => (
        <section key={p} className="card" style={{ padding: '14px 18px 6px' }}>
          <h2 className="h2" style={{ marginBottom: 4 }}>{PATTERN_LABEL[p]}</h2>
          {EXERCISES.filter((e) => e.pattern === p && usable(e, hasGrip))
            .sort((a, b) => (a.ladder === b.ladder ? a.step - b.step : a.ladder < b.ladder ? -1 : 1))
            .map((e) => {
              const b = best[e.id];
              return (
                <div key={e.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <button className="row" style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink)', textAlign: 'left' }} onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                    <span className="grow">
                      <span className="bold" style={{ display: 'block' }}>{e.name}</span>
                      <span className="small mut">{e.muscles}{e.equip.includes('pack') ? ' · backpack' : ''}{e.equip.includes('grip') ? ' · forearm trainer' : ''}</span>
                    </span>
                    {b && <span className="pill">{b.reps}{e.unit === 'secs' ? ' s' : ''}{b.loadKg ? ` @ ${b.loadKg} kg` : ''}</span>}
                  </button>
                  {open === e.id && (
                    <>
                      <Trend ex={e} sessions={sessions} />
                      <ul className="small mut" style={{ margin: 0, paddingLeft: 18 }}>
                        {e.cues.map((c) => <li key={c}>{c}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
        </section>
      ))}
    </>
  );
}

/** Last few sessions of one move: bars for total reps, the best set under each. */
function Trend({ ex, sessions }: { ex: Exercise; sessions: Record<string, Session> }) {
  const today = useToday();
  const pts = trendOf(sessions, ex.id);
  if (!pts.length) return <p className="small mut">Not done yet.</p>;
  const max = Math.max(...pts.map((p) => p.total));
  const ago = daysBetween(pts.at(-1)!.date, today);
  const u = ex.unit === 'secs' ? ' s' : '';
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="trend" role="img" aria-label={`Last ${pts.length} sessions, total ${ex.unit === 'secs' ? 'seconds' : 'reps'}: ${pts.map((p) => p.total).join(', ')}`}>
        {pts.map((p, i) => (
          <div key={p.date + i} className="trend-col">
            <span className="small mut" style={{ fontSize: 11 }}>{p.total}</span>
            <i style={{ height: `${Math.max(8, (p.total / max) * 70)}%` }} className={i === pts.length - 1 ? 'now' : ''} />
            <span className="small" style={{ fontSize: 11 }}>{fmtDate(p.date, { day: 'numeric', month: 'numeric' })}</span>
          </div>
        ))}
      </div>
      <p className="small mut">
        Total {ex.unit === 'secs' ? 'seconds' : 'reps'} per session · last best set {pts.at(-1)!.top.reps}{u}{pts.at(-1)!.top.loadKg ? ` @ ${pts.at(-1)!.top.loadKg} kg` : ''} · {ago === 0 ? 'done today' : ago === 1 ? 'yesterday' : `${ago} days ago`}
      </p>
    </div>
  );
}

/** Best set per move, newest first, with the ones set this week marked. */
function Bests() {
  const today = useToday();
  const sessions = useStore((s) => s.sessions);
  const [all, setAll] = useState(false);
  const list = Object.entries(records(sessions)).sort((a, b) => (a[1].date < b[1].date ? 1 : a[1].date > b[1].date ? -1 : 0));
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 5);
  return (
    <section className="card stack" style={{ gap: 4 }} aria-label="Personal bests">
      <div className="between">
        <h2 className="h2">Personal bests</h2>
        <span className="small mut">{list.length} moves</span>
      </div>
      {shown.map(([id, b]) => {
        const e = EX[id];
        const fresh = daysBetween(b.date, today) < 7;
        return (
          <div key={id} className="item">
            <span className="grow">
              <span className="bold" style={{ display: 'block' }}>{e?.name ?? id}</span>
              <span className="small mut">{fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })}{fresh ? ' · this week' : ''}</span>
            </span>
            <span className={fresh ? 'pill' : 'bold'}>
              {b.reps}{e?.unit === 'secs' ? ' s' : ''}{b.loadKg ? ` @ ${b.loadKg} kg` : ''}
            </span>
          </div>
        );
      })}
      {list.length > 5 && (
        <button className="btn sm" style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--acc)', padding: 0 }} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}

function BadgeGrid() {
  const g = useGame();
  return (
    <>
      <div className="grid3">
        <div className="tile">
          <p className="num" style={{ fontSize: 28 }}>{g.sessions}</p>
          <span className="small mut">workouts</span>
        </div>
        <div className="tile">
          <p className="num" style={{ fontSize: 28 }}>{g.weeks}</p>
          <span className="small mut">weeks in a row</span>
        </div>
        <div className="tile">
          <p className="num" style={{ fontSize: 28 }}>{g.wake}</p>
          <span className="small mut">on-time wakes</span>
        </div>
      </div>
      <Bests />
      <section className="card grid3" style={{ rowGap: 18 }}>
        {g.badges.map((b) => (
          <div key={b.id} className={`badge ${b.earned ? '' : 'locked'}`}>
            <span className="medal">
              <Icon name="medal" size={26} />
            </span>
            <span className="small bold">{b.name}</span>
            <span className="small mut" style={{ fontSize: 12 }}>{b.how}</span>
          </div>
        ))}
      </section>
    </>
  );
}
