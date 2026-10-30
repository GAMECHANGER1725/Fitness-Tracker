import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useLayout } from '../lib/layout';
import { SLEEP_STATUS_LABEL, applyCheckIn, ask, checkIn, currentAi, morningBriefing, reviewDue, undoCheckIn, useCoach } from '../lib/coach';
import { friendlyError, hasAi, PROVIDER_NAME } from '../lib/ai';
import { addDays, daysBetween, fmtDate, weekStart } from '../lib/dates';
import { deloadDue } from '../lib/progress';
import { clock12 } from '../lib/sleep';
import { movesTrend, weekNotes } from '../lib/notes';
import { Head, Icon, ProfileLink, Switch, toast, useToday } from '../components/ui';

const QUICK = ['Why am I tired at 6 am?', 'Make today harder', 'What should I eat after training?', 'Am I growing fast enough?'];

/** Plain notes from the last week (no AI), from weekNotes. */
function FromLog() {
  const today = useToday();
  const sessions = useStore((s) => s.sessions);
  const nights = useStore((s) => s.nights);
  const program = useStore((s) => s.program);
  const settings = useStore((s) => s.settings);
  const noteTags = useLayout((l) => l.noteTags);
  const notes = useMemo(() => weekNotes({ sessions, nights, program, settings }, today, noteTags), [sessions, nights, program, settings, today, noteTags]);
  return (
    <section className="card stack" style={{ gap: 8 }} aria-label="From your log">
      <h2 className="h2">From your log</h2>
      {notes.map((n) => (
        <p key={n} className="row small" style={{ alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--acc)', marginTop: 7, flex: 'none' }} />
          {n}
        </p>
      ))}
      {deloadDue(sessions, program, today, weekStart, addDays) && (
        <button
          className="btn sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            useStore.getState().setProgram({ ...program, deloadUntil: addDays(today, 6) }, 'me', 'Lighter week');
            toast(`Lighter week until ${fmtDate(addDays(today, 6), { weekday: 'long', day: 'numeric', month: 'short' })}`, { label: 'Undo', run: () => useStore.getState().undoProgram() });
          }}
        >
          Start a lighter week
        </button>
      )}
    </section>
  );
}

export default function Coach() {
  const ai = hasAi(currentAi());
  if (!ai) {
    return (
      <main>
        <Head over="Training, sleep and food" title="Coach" right={<ProfileLink />} />
        <div className="page">
          <FromLog />
          <section className="card stack" style={{ gap: 10 }}>
            <h2 className="h2">Add your AI key</h2>
            <p className="small">The coach uses the same key as Fuel Log. Add a TokenHarbor (DeepSeek) or Gemini key in Fuel Log on this phone and it’s picked up here by itself, or paste one in Profile → AI.</p>
            <div className="row">
              <a className="btn fuel" href="../fuel-log/#/profile">Open Fuel Log</a>
              <a className="btn" href="#/profile?open=coach">Profile → AI</a>
            </div>
          </section>
        </div>
      </main>
    );
  }
  return (
    <main>
      <Head over="Training, sleep and food" title="Coach" right={<ProfileLink />} />
      <div className="page">
        <FromLog />
        <CheckIn />
        <Morning />
        <Chat />
      </div>
    </main>
  );
}

function CheckIn() {
  const today = useToday();
  const review = useCoach((c) => c.review);
  const auto = useCoach((c) => c.auto);
  const bedtime = useStore((s) => s.settings.bedtime);
  const [busy, setBusy] = useState(false);
  const due = reviewDue(review, today);
  const run = () => {
    setBusy(true);
    checkIn()
      .then((r) => toast(r.applied ? 'Check-in done and applied' : 'Check-in ready. Apply it if you agree.'))
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setBusy(false));
  };
  const nextIn = review ? Math.max(0, 7 - daysBetween(review.date, today)) : 0;

  return (
    <>
      <section className="card stack" style={{ gap: 12 }} aria-label="Weekly check-in">
        <div className="between" style={{ alignItems: 'center' }}>
          <div>
            <h2 className="h2">Weekly check-in</h2>
            <span className="small mut">{review ? `${fmtDate(review.date, { weekday: 'long', day: 'numeric', month: 'short' })} · ${due ? 'due now' : `next in ${nextIn} day${nextIn === 1 ? '' : 's'}`}` : 'Reads your training, sleep and Fuel Log'}</span>
          </div>
          {review && <span className={`pill ${review.applied ? '' : 'mut'}`}>{review.applied ? (review.lines.length ? 'Applied' : 'No changes') : 'Not applied'}</span>}
        </div>
        {review ? (
          <>
            <p>{review.summary}</p>
            {review.lines.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                {review.lines.map((l) => (
                  <div key={l} className="tile small bold">{l}</div>
                ))}
              </div>
            )}
            {review.focus.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="label">This week</span>
                {review.focus.map((f, i) => (
                  <p key={f} className="row small" style={{ alignItems: 'flex-start', gap: 10 }}>
                    <span className="num acc" style={{ width: 14 }}>{i + 1}</span>
                    {f}
                  </p>
                ))}
              </div>
            )}
            <div className="row">
              {review.applied ? (
                (review.lines.length > 0 || review.sleep.bedtime !== review.sleep.prevBedtime) && (
                  <button className="btn ghost" onClick={() => undoCheckIn() && toast('Undone')}>
                    <Icon name="undo" size={18} /> Undo
                  </button>
                )
              ) : (
                <button className="btn primary" onClick={() => applyCheckIn() && toast('Applied')}>
                  <Icon name="check" size={18} stroke={3} /> Apply
                </button>
              )}
              <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={run}>
                <Icon name="refresh" size={18} /> {busy ? 'Thinking…' : due ? 'Run check-in' : 'Run again'}
              </button>
            </div>
          </>
        ) : (
          <button className="btn primary block" disabled={busy} onClick={run}>
            <Icon name="spark" size={18} /> {busy ? 'Reading your week…' : 'Run your first check-in'}
          </button>
        )}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small mut">Apply changes by itself each week</span>
          <Switch on={auto} onChange={(v) => useCoach.getState().set({ auto: v })} label="Apply check-ins automatically" />
        </div>
        <p className="small dim">
          The coach suggests; the app sets the limits: exercises from your home library only, at most 20 hard sets a week per area, volume up 20% at most, and bedtime moves 30 min a week at most.
          {review ? ` Model: ${review.model}.` : ''}
        </p>
      </section>

      {review && (
        <section className="card night stack" style={{ gap: 10 }} aria-label="Sleep this week">
          <div className="between" style={{ alignItems: 'center' }}>
            <span className="row bold" style={{ color: 'var(--sleep-ink)' }}>
              <Icon name="moon" size={18} /> Sleep this week
            </span>
            <span className="pill sleep" style={{ background: 'var(--s1)' }}>{SLEEP_STATUS_LABEL[review.sleep.status]}</span>
          </div>
          {review.sleep.note && <p>{review.sleep.note}</p>}
          <p className="small" style={{ color: 'var(--sleep-ink)' }}>
            Lights out {review.sleep.bedtime !== review.sleep.prevBedtime ? `${clock12(review.sleep.prevBedtime)} → ` : ''}
            <b>{clock12(review.applied ? bedtime : review.sleep.bedtime)}</b>
          </p>
          {review.sleep.habits.map((h) => (
            <p key={h} className="row small" style={{ alignItems: 'flex-start', gap: 10 }}>
              <Icon name="check" size={16} stroke={3} />
              {h}
            </p>
          ))}
        </section>
      )}
    </>
  );
}

function Morning() {
  const today = useToday();
  const b = useCoach((c) => c.briefing);
  const [busy, setBusy] = useState(false);
  const fresh = b?.date === today && b.headline;
  return (
    <section className="card stack" style={{ gap: 10 }} aria-label="Today's briefing">
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">Today</h2>
        <button
          className="btn sm icon"
          aria-label="New briefing"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            morningBriefing()
              .catch((e) => toast(friendlyError(e)))
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {fresh ? (
        <>
          <p className="bold">{b!.headline}</p>
          {(
            [
              ['train', 'Train', 'var(--acc)'],
              ['food', 'Food', 'var(--fuel)'],
              ['sleep', 'Sleep', 'var(--sleep)'],
            ] as const
          ).map(([k, l, c]) =>
            b![k] ? (
              <div key={k} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 999, background: c, flex: 'none' }} />
                <p className="small">
                  <span className="bold">{l}: </span>
                  {b![k]}
                </p>
              </div>
            ) : null,
          )}
        </>
      ) : (
        <p className="small mut">{busy ? 'Reading last night and yesterday…' : 'Tap refresh for today’s briefing.'}</p>
      )}
    </section>
  );
}

function Chat() {
  const chat = useCoach((c) => c.chat);
  const today = useToday();
  const sessions = useStore((s) => s.sessions);
  // A stuck move gets its own ready-made question.
  const stuckAsk = useMemo(() => movesTrend(sessions, today).stuck.slice(0, 1).map((m) => `How do I get past my ${m} plateau?`), [sessions, today]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setQ('');
    ask(text.trim())
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setBusy(false));
  };
  const cfg = currentAi();
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Ask your coach">
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">Ask your coach</h2>
        {chat.length > 0 && (
          <button className="btn sm" onClick={() => useCoach.getState().set({ chat: [] })}>
            Clear
          </button>
        )}
      </div>
      {chat.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {chat.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'user' ? 'me' : 'coach'}`}>
              {typeof m.content === 'string' ? m.content : ''}
            </div>
          ))}
          {busy && <div className="bubble coach mut">…</div>}
        </div>
      )}
      <div className="scroller">
        {[...stuckAsk, ...QUICK].map((x) => (
          <button key={x} className="chip" onClick={() => send(x)} disabled={busy}>
            {x}
          </button>
        ))}
      </div>
      <form
        className="search"
        style={{ background: 'var(--s2)', boxShadow: 'none' }}
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about training, sleep or food" aria-label="Ask your coach" />
        <button className="btn sm icon primary" aria-label="Send" disabled={busy || !q.trim()}>
          <Icon name="send" size={18} />
        </button>
      </form>
      <p className="small dim">Using {cfg.aiKey && cfg.aiFirst === 'deepseek' ? PROVIDER_NAME.deepseek : cfg.geminiKey ? PROVIDER_NAME.gemini : PROVIDER_NAME.deepseek} first. Not medical advice: if something hurts, stop and see a doctor or physio.</p>
    </section>
  );
}
