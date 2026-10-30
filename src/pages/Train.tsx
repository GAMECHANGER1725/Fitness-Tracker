import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { EX, EXERCISES, PATTERN_LABEL, bestText, easier, harder, targetText, usable } from '../lib/exercises';
import { WEEKDAYS, addSlot, copyDay, deleteDay, inDeload, minutes, moveSlot } from '../lib/program';
import { PATTERN_CAP, matchSession, newRecords, records, sessionText, trendOf, weeklySets } from '../lib/progress';
import { addDays, addMonths, daysBetween, fmtDate, monthGrid } from '../lib/dates';
import { hm } from '../lib/sleep';
import { Bar, Head, Icon, ProfileLink, Sheet, Stepper, go, scrollMotion, shareText, toast, useGame, useRoute, useToday } from '../components/ui';
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
  const today = useToday();
  const program = useStore((s) => s.program);
  const log = useStore((s) => s.programLog);
  const { setProgram, undoProgram, startWorkout } = useStore.getState();
  const ready = useReadiness();
  const [edit, setEdit] = useState<{ day: string; idx: number | null } | null>(null);
  const [order, setOrder] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const wk = weeklySets(program);
  const last = log.at(-1);
  const [allLog, setAllLog] = useState(false);
  const save = (p: Program, why: string) => setProgram(p, 'me', why);

  return (
    <>
      <section className="card stack" style={{ gap: 10 }} aria-label="Weekly schedule">
        <div className="between">
          <h2 className="h2">Week</h2>
          {(() => {
            const days = program.week.map((id) => program.days.find((d) => d.id === id)).filter((d): d is PlanDay => !!d);
            const mins = days.reduce((t, d) => t + minutes(d.slots), 0);
            return <span className="small mut">{days.length} workout{days.length === 1 ? '' : 's'}{mins ? `, about ${hm(mins)}` : ''}</span>;
          })()}
        </div>
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
        {inDeload(program, today) && (
          <div className="between small" style={{ background: 'var(--acc-soft)', borderRadius: 14, padding: '8px 12px' }}>
            <span className="bold">Lighter week until {fmtDate(program.deloadUntil!, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <button className="btn sm" onClick={() => save({ ...program, deloadUntil: addDays(today, -1) }, 'Ended the lighter week')}>
              End now
            </button>
          </div>
        )}
        <p className="small mut">
          Weekly hard sets:{' '}
          {(Object.keys(wk) as Pattern[])
            .filter((k) => wk[k])
            .map((k, i) => (
              <span key={k} style={wk[k] > PATTERN_CAP ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>
                {i ? ' · ' : ''}
                {PATTERN_LABEL[k].split(' ')[0]} {wk[k]}
              </span>
            ))}
        </p>
        {(Object.keys(wk) as Pattern[]).some((k) => wk[k] > PATTERN_CAP) && (
          <p className="small" style={{ color: 'var(--warn)' }}>
            Over {PATTERN_CAP} hard sets a week for one kind of movement is more than your coach would ever plan, and it gets harder to recover. Trim a set or two, or take a workout off a weekday.
          </p>
        )}
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
          {log.length > 1 && (
            <button className="small acc bold" onClick={() => setAllLog(!allLog)} aria-expanded={allLog} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}>
              {allLog ? 'Hide earlier changes' : `Show earlier changes (${log.length - 1})`}
            </button>
          )}
          {allLog &&
            log
              .slice(0, -1)
              .reverse()
              .map((c) => (
                <div key={c.at} className="stack" style={{ gap: 2, borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
                  <span className="small mut">
                    {new Date(c.at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · {c.by === 'coach' ? 'coach' : c.by === 'auto' ? 'progression' : 'you'}
                  </span>
                  {c.lines.slice(0, 5).map((l) => <span key={l} className="small">{l}</span>)}
                  {c.lines.length > 5 && <span className="small mut">and {c.lines.length - 5} more</span>}
                </div>
              ))}
        </section>
      )}

      {program.days.map((d) => (
        <section key={d.id} className="card" style={{ padding: '16px 18px 8px' }} aria-label={d.name}>
          <div className="between" style={{ alignItems: 'center' }}>
            <div>
              <button className="h2" onClick={() => setRename(d.id)} aria-label={`Rename ${d.name}`} style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {d.name} <Icon name="pencil" size={16} />
              </button>
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
              <span className="row" style={{ gap: 14 }}>
                {order !== d.id && program.days.length < 7 && (
                  <button className="btn sm" style={{ background: 'transparent', color: 'var(--acc)', padding: 0 }} onClick={() => (save(copyDay(program, d.id, `day-${Date.now().toString(36)}`), `Copied ${d.name}`), toast(`Copied. Rename it and pick its days above.`))}>
                    Copy
                  </button>
                )}
                {order !== d.id && program.days.length > 1 && (
                  <button
                    className="btn sm"
                    style={{ background: 'transparent', color: 'var(--danger)', padding: 0 }}
                    onClick={() => (save(deleteDay(program, d.id), `Deleted ${d.name}`), toast(`${d.name} deleted`, { label: 'Undo', run: () => useStore.getState().undoProgram() }))}
                  >
                    Delete
                  </button>
                )}
                {d.slots.length > 1 && (
                  <button className="btn sm" style={{ background: 'transparent', color: 'var(--acc)', padding: 0 }} onClick={() => setOrder(order === d.id ? null : d.id)}>
                    {order === d.id ? 'Done' : 'Reorder'}
                  </button>
                )}
              </span>
            </div>
          </div>
        </section>
      ))}
      {rename && <RenameSheet program={program} dayId={rename} onClose={() => setRename(null)} onSave={save} />}
      {edit && <SlotSheet program={program} dayId={edit.day} idx={edit.idx} onClose={() => setEdit(null)} onSave={save} />}
    </>
  );
}

function RenameSheet({ program, dayId, onClose, onSave }: { program: Program; dayId: string; onClose: () => void; onSave: (p: Program, why: string) => void }) {
  const day = program.days.find((d) => d.id === dayId)!;
  const [name, setName] = useState(day.name);
  const clean = name.trim().slice(0, 30);
  const taken = program.days.some((d) => d.id !== dayId && d.name.toLowerCase() === clean.toLowerCase());
  return (
    <Sheet onClose={onClose} label="Rename workout">
      <h2 className="h2">Rename {day.name}</h2>
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Push day, Legs and core…" autoFocus />
      </label>
      {taken && <p className="small" style={{ color: 'var(--danger)' }}>Another workout already has that name.</p>}
      <button
        className="btn primary block"
        disabled={!clean || taken || clean === day.name}
        onClick={() => {
          onSave({ ...program, days: program.days.map((d) => (d.id === dayId ? { ...d, name: clean } : d)) }, `Renamed ${day.name}`);
          onClose();
        }}
      >
        Save
      </button>
      <p className="small mut">Past workouts keep the name they had on the day.</p>
    </Sheet>
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
    const best = records(useStore.getState().sessions);
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
                <span className="small" style={{ opacity: 0.7, textAlign: 'right' }}>{bestText(best[x.id], x) ?? x.muscles}</span>
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
  const [only, setOnly] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Personal bests set in each session (against everything before it), for the medal on its card.
  const bests = useMemo(() => Object.fromEntries(Object.values(sessions).map((x) => [x.id, new Set(newRecords(x, sessions).map((r) => r.exerciseId)).size])), [sessions]);
  const names = [...new Set(Object.values(sessions).map((x) => x.name))].sort();
  const list = Object.values(sessions)
    .filter((x) => (!only || x.name === only) && matchSession(x, query))
    .sort((a, b) => b.start - a.start);
  const [past, setPast] = useState(false);
  const add = (
    <button className="btn block" onClick={() => setPast(true)}>
      <Icon name="plus" size={18} /> Log a workout I already did
    </button>
  );
  const sheet = past && <PastSheet onClose={() => setPast(false)} />;
  if (!Object.keys(sessions).length)
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
      <MonthCard
        sessions={sessions}
        onPick={(id) => {
          setOnly(null);
          setQuery('');
          setOpen(id);
          setTimeout(() => document.getElementById(`ses-${id}`)?.scrollIntoView({ behavior: scrollMotion(), block: 'center' }), 50);
        }}
      />
      {names.length > 1 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Show workouts">
          <button className="chip" aria-pressed={!only} onClick={() => setOnly(null)}>All</button>
          {names.map((n) => (
            <button key={n} className="chip" aria-pressed={only === n} onClick={() => setOnly(only === n ? null : n)}>{n}</button>
          ))}
        </div>
      )}
      {Object.keys(sessions).length > 3 && (
        <label className="search">
          <Icon name="search" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a workout, move or note" aria-label="Find a workout" />
          {query && (
            <button className="btn sm icon" aria-label="Clear search" onClick={() => setQuery('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
      )}
      {!list.length && <p className="empty">No workouts match{query ? ` “${query}”` : ''}.</p>}
      {list.map((s) => {
        const by = new Map<string, typeof s.sets>();
        for (const x of s.sets) by.set(x.exerciseId, [...(by.get(x.exerciseId) ?? []), x]);
        const isOpen = open === s.id;
        return (
          <section key={s.id} id={`ses-${s.id}`} className="card tight stack" style={{ gap: 8 }}>
            <button className="row" style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink)', textAlign: 'left' }} onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="bold" style={{ display: 'block' }}>{s.name}</span>
                <span className="small mut">
                  {fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.max(1, Math.round((s.end - s.start) / 60_000))} min · {s.sets.length} set{s.sets.length === 1 ? '' : 's'}
                  {bests[s.id] ? (
                    <span className="acc bold">
                      {' · '}
                      <Icon name="medal" size={13} /> {bests[s.id]} new best{bests[s.id] === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
                {!isOpen && (s.feel || s.note) && (
                  <span className="small mut" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.feel ? `Felt ${FEEL[s.feel - 1].toLowerCase()}` : ''}
                    {s.feel && s.note ? ' · ' : ''}
                    {s.note ? `“${s.note}”` : ''}
                  </span>
                )}
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
                  <button className="btn sm" onClick={() => shareText(sessionText(s, fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })))}>
                    <Icon name="out" size={16} /> Share
                  </button>
                  <button className="btn sm danger" onClick={() => (del(s.id), toast(`${s.name} deleted`, { label: 'Undo', run: () => useStore.getState().restoreSession(s) }))}>
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

/** A month of workouts: trained days filled in; tap one to open it below. */
function MonthCard({ sessions, onPick }: { sessions: Record<string, Session>; onPick: (id: string) => void }) {
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 8) + '01');
  const byDay = new Map<string, Session[]>();
  for (const x of Object.values(sessions)) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
  const grid = monthGrid(month);
  const count = grid.flat().filter((k) => k && byDay.has(k)).length;
  const inMonth = Object.values(sessions).filter((x) => x.date.slice(0, 7) === month.slice(0, 7));
  const mins = Math.round(inMonth.reduce((t, x) => t + Math.max(0, x.end - x.start), 0) / 60_000);
  const sets = inMonth.reduce((t, x) => t + x.sets.length, 0);
  return (
    <section className="card stack" style={{ gap: 10 }} aria-label="Month">
      <div className="between" style={{ alignItems: 'center' }}>
        <button className="btn sm icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <Icon name="left" size={18} />
        </button>
        <span className="stack" style={{ alignItems: 'center', gap: 0 }}>
          <span className="bold">{fmtDate(month, { month: 'long', year: 'numeric' })}</span>
          <span className="small mut">
            {count} day{count === 1 ? '' : 's'} trained{count ? ` · ${hm(mins)} · ${sets} set${sets === 1 ? '' : 's'}` : ''}
          </span>
        </span>
        <button className="btn sm icon" aria-label="Next month" disabled={month >= today.slice(0, 8) + '01'} onClick={() => setMonth(addMonths(month, 1))}>
          <Icon name="right" size={18} />
        </button>
      </div>
      <div className="week" style={{ gap: 4 }}>
        {WEEKDAYS.map((w) => <div key={w}>{w[0]}</div>)}
        {grid.flat().map((k, i) => {
          const xs = k ? byDay.get(k) : undefined;
          return k ? (
            <button key={k} onClick={() => xs && onPick(xs[0].id)} disabled={!xs} aria-label={`${fmtDate(k)}${xs ? `: ${xs.map((x) => x.name).join(', ')}` : ''}`} style={{ background: 'none', border: 0, padding: 0 }}>
              <i className={`${xs ? 'done' : ''}${k === today ? ' today' : ''}`} style={{ fontSize: 12, borderRadius: 10 }}>{Number(k.slice(8))}</i>
            </button>
          ) : (
            <div key={`x${i}`} />
          );
        })}
      </div>
    </section>
  );
}

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
  const notes = useStore((s) => s.profile.exNotes);
  const hasGrip = useStore((s) => s.profile.hasGrip);
  const best = records(sessions);
  const { params } = useRoute();
  const [open, setOpen] = useState<string | null>(params.get('open'));
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'plan' | 'done'>('all');
  const program = useStore((s) => s.program);
  const inPlan = new Set(program.days.flatMap((d) => d.slots.map((x) => x.exerciseId)));
  // Opened from a link (Today's list or a ladder chip): bring it into view.
  useEffect(() => {
    // After App's scroll-to-top on a page change, which runs after this effect.
    if (!open) return;
    const t = setTimeout(() => document.getElementById(`move-${open}`)?.scrollIntoView({ block: 'start', behavior: scrollMotion() }), 80);
    return () => clearTimeout(t);
  }, [open]);
  const q = query.trim().toLowerCase();
  // The open move always shows, so a ladder chip never opens something filtered out.
  const match = (e: Exercise) =>
    e.id === open ||
    ((!q || `${e.name} ${e.muscles} ${PATTERN_LABEL[e.pattern]}`.toLowerCase().includes(q)) && (only === 'all' || (only === 'plan' ? inPlan.has(e.id) : !!best[e.id])));
  const shown = (Object.keys(PATTERN_LABEL) as Pattern[]).filter((p) => EXERCISES.some((e) => e.pattern === p && usable(e, hasGrip) && match(e)));
  return (
    <>
      <label className="search">
        <Icon name="search" size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a move or muscle" aria-label="Find a move" />
        {query && (
          <button className="btn sm icon" aria-label="Clear" onClick={() => setQuery('')}>
            <Icon name="close" size={16} />
          </button>
        )}
      </label>
      <div className="row" style={{ gap: 6 }} role="group" aria-label="Show moves">
        {([['all', 'All'], ['plan', 'In my plan'], ['done', 'Done before']] as const).map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={only === k} onClick={() => setOnly(k)}>{l}</button>
        ))}
      </div>
      {!shown.length && <p className="empty">{query ? `Nothing matches “${query}”.` : only === 'done' ? 'No moves logged yet.' : 'Nothing to show.'}</p>}
      {shown.map((p) => (
        <section key={p} className="card" style={{ padding: '14px 18px 6px' }}>
          <h2 className="h2" style={{ marginBottom: 4 }}>{PATTERN_LABEL[p]}</h2>
          {EXERCISES.filter((e) => e.pattern === p && usable(e, hasGrip) && match(e))
            .sort((a, b) => (a.ladder === b.ladder ? a.step - b.step : a.ladder < b.ladder ? -1 : 1))
            .map((e) => {
              const b = best[e.id];
              return (
                <div key={e.id} id={`move-${e.id}`} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, scrollMarginTop: 16 }}>
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
                      {notes[e.id] && <p className="small"><span className="bold">Your note:</span> {notes[e.id]}</p>}
                      <Ladder id={e.id} onPick={setOpen} />
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

/** Easier and harder steps on the same ladder (tap to open them), and which plan days use this move. */
function Ladder({ id, onPick }: { id: string; onPick: (id: string) => void }) {
  const days = useStore((s) => s.program.days);
  const hasGrip = useStore((s) => s.profile.hasGrip);
  const down = easier(id);
  const up = harder(id);
  const inPlan = days.filter((d) => d.slots.some((x) => x.exerciseId === id)).map((d) => d.name);
  const open = days.filter((d) => d.slots.length < 12 && !d.slots.some((x) => x.exerciseId === id));
  const step = (e: Exercise | null, label: string) =>
    e && usable(e, hasGrip) ? (
      <button className="chip" style={{ fontSize: 13, minHeight: 36 }} onClick={() => onPick(e.id)}>
        {label}: {e.name}
      </button>
    ) : null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {(down || up) && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {step(down, 'Easier')}
          {step(up, 'Harder')}
        </div>
      )}
      <p className="small mut">{inPlan.length ? `In your plan: ${inPlan.join(', ')}` : 'Not in your plan yet.'}</p>
      {!inPlan.length && open.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {open.map((d) => (
            <button
              key={d.id}
              className="chip"
              style={{ fontSize: 13, minHeight: 36 }}
              onClick={() => {
                const { program, setProgram } = useStore.getState();
                setProgram(addSlot(program, d.id, id), 'me', `Added ${EX[id]?.name} to ${d.name}`);
                toast(`Added to ${d.name}: 3 sets`, { label: 'Undo', run: () => useStore.getState().undoProgram() });
              }}
            >
              <Icon name="plus" size={14} /> Add to {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const loaded = pts.some((p) => p.top.loadKg);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="trend" style={loaded ? { height: 126 } : undefined} role="img" aria-label={`Last ${pts.length} sessions, total ${ex.unit === 'secs' ? 'seconds' : 'reps'}: ${pts.map((p) => p.total).join(', ')}`}>
        {pts.map((p, i) => (
          <div key={p.date + i} className="trend-col">
            <span className="small mut" style={{ fontSize: 11 }}>{p.total}</span>
            <span className="trend-bar">
              <i style={{ height: `${Math.max(8, (p.total / max) * 100)}%` }} className={i === pts.length - 1 ? 'now' : ''} />
            </span>
            <span className="small" style={{ fontSize: 11 }}>{fmtDate(p.date, { day: 'numeric', month: 'numeric' })}</span>
            {loaded && <span className="small acc bold" style={{ fontSize: 11 }}>{p.top.loadKg ? `${p.top.loadKg} kg` : '–'}</span>}
          </div>
        ))}
      </div>
      <p className="small mut">
        Total {ex.unit === 'secs' ? 'seconds' : 'reps'} per session{loaded ? ', backpack load below' : ''} · last best set {pts.at(-1)!.top.reps}{u}{pts.at(-1)!.top.loadKg ? ` @ ${pts.at(-1)!.top.loadKg} kg` : ''} · {ago === 0 ? 'done today' : ago === 1 ? 'yesterday' : `${ago} days ago`}
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
            {!b.earned && b.need > 1 && (
              <span className="stack" style={{ gap: 3, width: '100%', alignItems: 'center' }}>
                <span style={{ width: '80%' }}><Bar value={b.have} max={b.need} height={5} label={`${b.name} progress`} /></span>
                <span className="small mut" style={{ fontSize: 11 }}>{Math.floor(b.have)} / {b.need}{b.id === 'loaded' ? ' kg' : ''}</span>
              </span>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
