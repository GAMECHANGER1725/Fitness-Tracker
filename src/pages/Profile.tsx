import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { AI_MODELS, GEMINI_MODELS, PROVIDER_NAME, friendlyError, hasAi, testKey, type Provider } from '../lib/ai';
import { fuelAi, FUEL_STORE } from '../lib/fuel';
import { currentAi } from '../lib/coach';
import { exportCsv, exportJson, importJson } from '../lib/backup';
import { reminderKinds, remindersOn, remindersSupported, setKind, setLead, setReminders } from '../lib/reminders';
import { usePlayer } from '../lib/player';
import { ACCENTS, TODAY_CARDS, useLayout } from '../lib/layout';
import { install, useInstall } from '../lib/install';
import { TOKEN_URL, connect, disconnect, fuelLogToken, syncNow, useSync } from '../lib/sync';
import { clock12, idealBedtime } from '../lib/sleep';
import { todayKey } from '../lib/dates';
import { Head, Icon, Stepper, Switch, go, scrollMotion, toast, useRoute } from '../components/ui';
import { useWeight } from '../components/data';

// Profile's cards in order, with the short names used by the jump chips at the top.
const SECTIONS: [id: string, label: string, card: ReactNode][] = [
  ['install', 'Install', <InstallCard />],
  ['you', 'You', <Me />],
  ['times', 'Times', <SleepGoals />],
  ['coach', 'AI coach', <AiCard />],
  ['sync', 'Sync', <SyncCard />],
  ['wind', 'Wind-down', <WindDownEdit />],
  ['workout', 'Workout', <PlayerPrefs />],
  ['reminders', 'Reminders', <Reminders />],
  ['look', 'Look', <Look />],
  ['backup', 'Backup', <Backup />],
];

export default function ProfilePage() {
  // Links like #/profile?open=backup land on that card (after App's scroll-to-top on page change).
  const { params } = useRoute();
  const open = params.get('open');
  const installed = useInstall((s) => s.installed);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => document.getElementById(`set-${open}`)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' }), 80);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <main>
      <Head
        over="Settings"
        title="Profile"
        right={
          <button className="btn icon" aria-label="Back" onClick={() => history.length > 1 ? history.back() : go('today')}>
            <Icon name="close" />
          </button>
        }
      />
      <div className="page">
        <nav className="row" style={{ flexWrap: 'wrap', gap: 6 }} aria-label="Settings sections">
          {SECTIONS.filter(([id]) => id !== 'install' || !installed).map(([id, label]) => (
            <button key={id} className="chip" style={{ fontSize: 13, minHeight: 34 }} onClick={() => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' })}>
              {label}
            </button>
          ))}
        </nav>
        {SECTIONS.map(([id, , card]) => (
          <div key={id} id={`set-${id}`} style={{ scrollMarginTop: 12 }}>
            {card}
          </div>
        ))}
        <button className="btn block ghost" onClick={() => useAuth.getState().lock()}>
          Log out
        </button>
        <p className="small dim" style={{ textAlign: 'center' }}>Fitness Tracker · pairs with Fuel Log</p>
      </div>
    </main>
  );
}

function Me() {
  const p = useStore((s) => s.profile);
  const set = useStore((s) => s.setProfile);
  const weight = useWeight();
  return (
    <section className="card stack" style={{ gap: 12 }}>
      <h2 className="h2">You</h2>
      <div className="grid2">
        <label className="field">
          <span>Name</span>
          <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Age</span>
          <input className="input" type="number" inputMode="numeric" value={p.age} onChange={(e) => set({ age: +e.target.value || p.age })} />
        </label>
        <label className="field">
          <span>Height (cm)</span>
          <input className="input" type="number" inputMode="numeric" value={p.heightCm} onChange={(e) => set({ heightCm: +e.target.value || p.heightCm })} />
        </label>
        <label className="field">
          <span>Weight (kg)</span>
          <input className="input" type="number" inputMode="decimal" value={p.weightKg} onChange={(e) => set({ weightKg: +e.target.value || p.weightKg })} />
        </label>
      </div>
      {weight !== p.weightKg && <p className="small mut">Using {weight} kg, your latest weigh-in from Fuel Log.</p>}
      <h2 className="h2" style={{ marginTop: 6 }}>Equipment</h2>
      <label className="field">
        <span>Heaviest you can pack the backpack (kg)</span>
        <Stepper value={p.packMaxKg} onChange={(v) => set({ packMaxKg: v })} label="backpack maximum" step={1} max={40} unit="kg" />
      </label>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>I have a forearm trainer</span>
        <Switch on={p.hasGrip} onChange={(v) => set({ hasGrip: v })} label="Forearm trainer" />
      </div>
      <p className="small mut">Water bottles are easy to weigh: 1 L = 1 kg. Books are about 1 kg each.</p>
    </section>
  );
}

function SleepGoals() {
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.setSettings);
  const ideal = idealBedtime(s.wakeTarget, s.sleepGoalH);
  return (
    <section className="card stack" style={{ gap: 12 }}>
      <h2 className="h2">Wake, sleep and training times</h2>
      <div className="grid2">
        <label className="field">
          <span>Wake up at</span>
          <input className="input" type="time" value={s.wakeTarget} onChange={(e) => e.target.value && set({ wakeTarget: e.target.value })} />
        </label>
        <label className="field">
          <span>Workout reminder</span>
          <input className="input" type="time" value={s.workoutTime} onChange={(e) => e.target.value && set({ workoutTime: e.target.value })} />
        </label>
      </div>
      <div className="field">
        <span>Weekend workout reminder</span>
        {s.weekendWorkoutTime ? (
          <div className="row">
            <input className="input" style={{ flex: 1 }} type="time" value={s.weekendWorkoutTime} aria-label="Weekend workout reminder" onChange={(e) => e.target.value && set({ weekendWorkoutTime: e.target.value })} />
            <button className="btn sm" onClick={() => set({ weekendWorkoutTime: '' })}>Same as weekdays</button>
          </div>
        ) : (
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ weekendWorkoutTime: '10:00' })}>Same as weekdays · set a different time</button>
        )}
      </div>
      <label className="field">
        <span>Sleep goal (8–10 h is right at your age)</span>
        <Stepper value={s.sleepGoalH} onChange={(v) => set({ sleepGoalH: v })} label="sleep goal hours" step={0.5} min={7} max={10.5} unit="h" />
      </label>
      <label className="field">
        <span>Lights out</span>
        <input className="input" type="time" value={s.bedtime} onChange={(e) => e.target.value && set({ bedtime: e.target.value })} />
      </label>
      {ideal !== s.bedtime && (
        <button className="btn sleep" onClick={() => set({ bedtime: ideal })}>
          Use {clock12(ideal)} for {s.sleepGoalH} h before {clock12(s.wakeTarget)}
        </button>
      )}
      <p className="small mut">The coach can move lights-out by up to 30 min a week when your sleep data says so.</p>
    </section>
  );
}

function AiCard() {
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.setSettings);
  const fromFuel = fuelAi(localStorage.getItem(FUEL_STORE));
  const own = hasAi(s);
  const cfg = currentAi();
  const [open, setOpen] = useState(own);
  const [busy, setBusy] = useState<Provider | null>(null);
  const providers: { provider: Provider; key: 'aiKey' | 'geminiKey'; model: 'aiModel' | 'geminiModel'; models: { id: string; label: string }[]; url: string }[] = [
    { provider: 'deepseek', key: 'aiKey', model: 'aiModel', models: AI_MODELS, url: 'https://tokenharbor.ai' },
    { provider: 'gemini', key: 'geminiKey', model: 'geminiModel', models: GEMINI_MODELS, url: 'https://aistudio.google.com/apikey' },
  ];
  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">AI coach</h2>
        <span className={`pill ${hasAi(cfg) ? '' : 'mut'}`}>{own ? 'Own key' : !!(fromFuel.aiKey || fromFuel.geminiKey) ? 'From Fuel Log' : 'No key'}</span>
      </div>
      <p className="small mut">
        {own
          ? 'Using the keys below. Clear them to use Fuel Log’s again.'
          : hasAi(cfg)
            ? `Using Fuel Log’s ${[cfg.aiKey && PROVIDER_NAME.deepseek, cfg.geminiKey && PROVIDER_NAME.gemini].filter(Boolean).join(' and ')} key from this phone, so there’s nothing to set up. Change keys in Fuel Log.`
            : 'Add a key in Fuel Log on this phone and it’s used here too, or add one below.'}
      </p>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Hide' : 'Use a different key here'}
      </button>
      {open && (
        <>
          {providers.map((p) => (
            <div key={p.provider} className="stack" style={{ gap: 6 }}>
              <label className="field">
                <span>
                  {PROVIDER_NAME[p.provider]} key (<a href={p.url} target="_blank" rel="noreferrer">get one</a>)
                </span>
                <input className="input" type="password" autoComplete="off" value={s[p.key]} onChange={(e) => set({ [p.key]: e.target.value.trim() })} placeholder="Paste key" />
              </label>
              <div className="row">
                <select className="input" style={{ flex: 1, minHeight: 44 }} value={s[p.model] || p.models[0].id} onChange={(e) => set({ [p.model]: e.target.value })} aria-label={`${PROVIDER_NAME[p.provider]} model`}>
                  {p.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <button
                  className="btn sm"
                  disabled={!s[p.key] || busy != null}
                  onClick={async () => {
                    setBusy(p.provider);
                    try {
                      await testKey(p.provider, s[p.key], s[p.model] || p.models[0].id);
                      toast(`${PROVIDER_NAME[p.provider]} key works`);
                    } catch (e) {
                      toast(friendlyError(e, false));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === p.provider ? 'Testing…' : 'Test'}
                </button>
              </div>
            </div>
          ))}
          <label className="field">
            <span>Try first</span>
            <select className="input" value={s.aiFirst} onChange={(e) => set({ aiFirst: e.target.value as Provider })}>
              <option value="deepseek">DeepSeek (TokenHarbor)</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <p className="small mut">Keys stay on this phone and only go to their provider. They’re never synced or exported.</p>
        </>
      )}
    </section>
  );
}

function SyncCard() {
  const sync = useSync();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const fuelTok = fuelLogToken();
  const link = async (t: string) => {
    setBusy(true);
    try {
      await connect(t);
      toast('Sync is on');
      setToken('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t connect');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">Sync between devices</h2>
        <span className={`pill ${sync.conn ? (sync.status === 'error' ? 'warn' : '') : 'mut'}`}>{sync.conn ? (sync.status === 'syncing' ? 'Syncing' : sync.status === 'error' ? 'Problem' : 'On') : 'Off'}</span>
      </div>
      {sync.conn ? (
        <>
          <p className="small mut">
            Workouts, sleep and your plan sync through a secret gist (fitness-tracker-sync.json) in your GitHub account. The same token reads Fuel Log’s gist for the Fuel tab.
            {sync.last ? ` Last synced ${new Date(sync.last).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}.` : ''}
          </p>
          {sync.status === 'error' && <p className="small" style={{ color: 'var(--danger)' }}>{sync.error}</p>}
          <div className="row">
            <button className="btn" style={{ flex: 1 }} disabled={sync.status === 'syncing'} onClick={() => syncNow()}>
              <Icon name="refresh" size={18} /> Sync now
            </button>
            <button className="btn danger" onClick={() => (disconnect(), toast('Disconnected. Your data stays on this device.'))}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          {fuelTok && (
            <button className="btn primary" disabled={busy} onClick={() => link(fuelTok)}>
              Use Fuel Log’s GitHub token
            </button>
          )}
          <ol className="small mut" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <a href={TOKEN_URL} target="_blank" rel="noreferrer">Make a GitHub token</a> with only the “gist” permission (or reuse your Fuel Log one).
            </li>
            <li>Paste it here on each device.</li>
          </ol>
          <div className="row">
            <input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" aria-label="GitHub token" style={{ flex: 1 }} />
            <button className="btn primary" disabled={busy || !token.trim()} onClick={() => link(token)}>
              {busy ? '…' : 'Connect'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function WindDownEdit() {
  const list = useStore((s) => s.profile.windDown);
  const setProfile = useStore((s) => s.setProfile);
  const [text, setText] = useState(list.join('\n'));
  const lines = [...new Set(text.split('\n').map((l) => l.trim().slice(0, 40)).filter(Boolean))].slice(0, 6);
  const changed = lines.join('\n') !== list.join('\n');
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <h2 className="h2">Wind-down checklist</h2>
      <label className="field">
        <span>One step per line, up to 6. You tick them on Today in the evening.</span>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Screens off\nBag packed for tomorrow\nTeeth brushed'} />
      </label>
      <button className="btn sm primary" style={{ alignSelf: 'flex-start' }} disabled={!changed} onClick={() => (setProfile({ windDown: lines }), toast(lines.length ? 'Checklist saved' : 'Checklist turned off'))}>
        Save checklist
      </button>
    </section>
  );
}

function PlayerPrefs() {
  const { beep, awake, auto, buzz, set } = usePlayer();
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <h2 className="h2">During a workout</h2>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="grow">
          <span className="bold" style={{ display: 'block' }}>Beep when rest ends</span>
          <span className="small mut">A short two-tone sound</span>
        </span>
        <Switch on={beep} label="Beep when rest ends" onChange={(v) => set({ beep: v })} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="grow">
          <span className="bold" style={{ display: 'block' }}>Vibrate</span>
          <span className="small mut">When rest ends, at hold marks and for a new best</span>
        </span>
        <Switch on={buzz} label="Vibrate" onChange={(v) => set({ buzz: v })} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="grow">
          <span className="bold" style={{ display: 'block' }}>Keep the screen on</span>
          <span className="small mut">So the timer stays in view</span>
        </span>
        <Switch on={awake} label="Keep the screen on" onChange={(v) => set({ awake: v })} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="grow">
          <span className="bold" style={{ display: 'block' }}>Go to the next exercise by itself</span>
          <span className="small mut">When the rest after the last set ends</span>
        </span>
        <Switch on={auto} label="Go to the next exercise by itself" onChange={(v) => set({ auto: v })} />
      </div>
      <p className="small mut">These are for this device only.</p>
    </section>
  );
}

function Reminders() {
  const [on, setOn] = useState(remindersOn());
  const [kinds, setKinds] = useState(reminderKinds);
  if (!remindersSupported()) return null;
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="h2">Reminders</h2>
        <Switch
          on={on}
          label="Reminders"
          onChange={async (v) => {
            const ok = await setReminders(v);
            setOn(ok);
            if (v && !ok) toast('Notifications are blocked. Allow them in your browser settings.');
          }}
        />
      </div>
      {on && (
        <div className="stack" style={{ gap: 8 }}>
          {([['bed', 'Wind down', 'Screens off before lights out'], ['workout', 'Workout', 'At your workout time on planned days'], ['wake', 'Up yet?', '15 min after your wake time if I’m up isn’t logged']] as const).map(([k, name, how]) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
              <span className="grow">
                <span className="bold" style={{ display: 'block' }}>{name}</span>
                <span className="small mut">{how}</span>
              </span>
              <Switch on={!kinds.off.includes(k)} label={`${name} reminder`} onChange={(v) => (setKind(k, v), setKinds(reminderKinds()))} />
            </div>
          ))}
          {!kinds.off.includes('bed') && <span className="small mut">Wind-down nudge, before lights out:</span>}
          {!kinds.off.includes('bed') && (
            <div className="seg" role="group" aria-label="Wind-down reminder, minutes before lights out">
              {[20, 40, 60].map((m) => (
                <button key={m} aria-pressed={kinds.lead === m} onClick={() => (setLead(m), setKinds(reminderKinds()))}>
                  {m} min
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="small mut">They work while the app is open or in the background.</p>
    </section>
  );
}

function Look() {
  const theme = useStore((s) => s.settings.theme);
  const set = useStore((s) => s.setSettings);
  const { hidden, toggle, accent, setAccent, large, setLarge } = useLayout();
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <h2 className="h2">Look</h2>
      <div className="seg" role="group" aria-label="Theme">
        {(['auto', 'dark', 'light'] as const).map((t) => (
          <button key={t} aria-pressed={theme === t} onClick={() => set({ theme: t })}>
            {t === 'auto' ? 'Auto' : t === 'dark' ? 'Dark' : 'Light'}
          </button>
        ))}
      </div>
      <span className="label" style={{ marginTop: 6 }}>Text size</span>
      <div className="seg" role="group" aria-label="Text size">
        <button aria-pressed={!large} onClick={() => setLarge(false)}>Normal</button>
        <button aria-pressed={large} onClick={() => setLarge(true)} style={{ fontSize: 16 }}>Large</button>
      </div>
      <span className="label" style={{ marginTop: 6 }}>Training colour</span>
      <div className="seg" role="group" aria-label="Training colour">
        {ACCENTS.map(([id, name]) => (
          <button key={id} aria-pressed={accent === id} onClick={() => setAccent(id)}>
            {name}
          </button>
        ))}
      </div>
      <span className="label" style={{ marginTop: 6 }}>Show on Today</span>
      {TODAY_CARDS.map(([id, name]) => (
        <div key={id} className="row" style={{ justifyContent: 'space-between' }}>
          <span className="bold">{name}</span>
          <Switch on={!hidden.includes(id)} label={`Show ${name} on Today`} onChange={() => toggle(id)} />
        </div>
      ))}
      <p className="small mut">Readiness and the sleep cards always show. These are for this device only.</p>
    </section>
  );
}

function InstallCard() {
  const { prompt, installed } = useInstall();
  if (installed) return null;
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h2 className="h2">Install the app</h2>
      <p className="small">Installed, it opens full screen from your home screen, works offline, and reminders and your saved data hold up better.</p>
      {prompt ? (
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => install().then((ok) => ok && toast('Installed. Open it from your home screen.'))}>
          Install
        </button>
      ) : (
        <p className="small mut">In your browser’s menu (⋮ or the share button), choose Add to Home screen or Install app.</p>
      )}
    </section>
  );
}

function BackupAge() {
  const at = useLayout((l) => l.backupAt);
  const days = at == null ? null : Math.floor((Date.now() - at) / 86_400_000);
  return (
    <p className="small mut">
      Last backup file from this phone: {days == null ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}. With sync off, your data is only on this phone, so save one now and then.
    </p>
  );
}

function Backup() {
  const importData = useStore((s) => s.importData);
  const reset = useStore((s) => s.reset);
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <h2 className="h2">Backup</h2>
      <BackupAge />
      <div className="grid2">
        <button
          className="btn"
          onClick={() => {
            const blob = new Blob([exportJson(useStore.getState())], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `fitness-tracker-${todayKey()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            useLayout.getState().set({ backupAt: Date.now(), backupSnooze: null });
          }}
        >
          Export
        </button>
        <label className="btn">
          Import
          <input
            type="file"
            accept="application/json,.json"
            className="sr"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const d = importJson(await f.text());
                if (confirm('Replace everything on this device with this backup?')) {
                  importData(d);
                  toast('Backup loaded');
                }
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Couldn’t read that file');
              }
            }}
          />
        </label>
      </div>
      <span className="label">For a spreadsheet (CSV)</span>
      <div className="grid2">
        {(['workouts', 'sleep'] as const).map((name) => (
          <button
            key={name}
            className="btn sm"
            onClick={() => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([exportCsv(useStore.getState())[name]], { type: 'text/csv' }));
              a.download = `fitness-${name}-${todayKey()}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Icon name="out" size={16} /> {name === 'workouts' ? 'Workouts' : 'Sleep'}
          </button>
        ))}
      </div>
      <button className="btn danger" onClick={() => confirm('Delete all workouts, nights and plan changes? This syncs to your other devices.') && (reset(), toast('Reset'))}>
        Reset everything
      </button>
    </section>
  );
}
