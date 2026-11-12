import { useState } from 'react';
import { useStore } from '../lib/store';
import { DEFAULT_GYM_DAYS, MAX_GYM_DAYS, WEEKDAYS, buildProgram, minutes, plannedDay, type Baselines } from '../lib/program';
import { EX } from '../lib/exercises';
import { SAFETY } from '../lib/guide';
import { addDays, fmtDate, todayKey } from '../lib/dates';
import { clock12 } from '../lib/sleep';
import { Icon, NumInput, Stepper, mmss, toast } from '../components/ui';

/** The gym opens for you on Thu 12 Nov 2026; after that, "first session" defaults to today. */
const FIRST_GYM_DAY = '2026-11-12';
const STEPS = ['Welcome', 'You', 'Baselines', 'Schedule', 'Ready'] as const;

export default function Onboarding() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
  const nights = useStore((s) => s.nights);
  const home = useStore((s) => s.home);
  const finishOnboarding = useStore((s) => s.finishOnboarding);
  const today = todayKey();

  const [step, setStep] = useState(0);
  const [age, setAge] = useState(profile.age);
  const [heightCm, setHeight] = useState(profile.heightCm);
  const [weightKg, setWeight] = useState<number | null>(profile.weightKg);
  const [goal, setGoal] = useState(profile.goal);
  const [weakArm, setWeakArm] = useState(profile.weakArm);
  const [pushups, setPushups] = useState(3.5);
  const [plankS, setPlank] = useState(90);
  const [pullups, setPullups] = useState(0);
  const [chinups, setChinups] = useState<number | null>(null);
  const [armL, setArmL] = useState<number | null>(null);
  const [armR, setArmR] = useState<number | null>(null);
  const [gymDays, setGymDays] = useState<number[]>(DEFAULT_GYM_DAYS);
  const [time, setTime] = useState(settings.workoutTime);
  const [start, setStart] = useState(today < FIRST_GYM_DAY ? FIRST_GYM_DAY : today);
  const [ok, setOk] = useState(false);

  const baselines: Baselines = { pushups, plankS, pullups, chinups: chinups ?? 0 };
  const preview = buildProgram(baselines, gymDays, start);
  const firstDay = plannedDay(preview, start);
  const homeCount = Object.keys(sessions).length;
  const nightCount = Object.keys(nights).length;

  const canNext = step === 1 ? weightKg != null && weightKg >= 25 : step === 2 ? chinups != null : step === 3 ? gymDays.length > 0 : step === 4 ? ok : true;
  const toggleDay = (i: number) => {
    if (gymDays.includes(i)) return setGymDays(gymDays.filter((d) => d !== i));
    if (gymDays.length >= MAX_GYM_DAYS) return toast(`${MAX_GYM_DAYS} gym days is plenty. Rest days are when you grow.`);
    setGymDays([...gymDays, i].sort((a, b) => a - b));
  };

  const finish = () => {
    finishOnboarding({
      profile: { age, heightCm, goal, weakArm },
      settings: { workoutTime: time },
      baselines,
      measure: { weightKg: weightKg ?? undefined, armL: armL ?? undefined, armR: armR ?? undefined },
      gymDays,
      start,
    });
    toast('Plan ready. Your baselines are saved.');
    window.location.hash = '/today';
  };

  return (
    <main className="onb">
      <div className="steps" aria-hidden="true" style={{ padding: '0 16px' }}>
        {STEPS.map((s, i) => (
          <i key={s} className={i < step ? 'done' : i === step ? 'now' : ''} />
        ))}
      </div>
      <div className="page" style={{ paddingTop: 22, gap: 16 }}>
        <span className="label">
          Step {step + 1} of {STEPS.length}
        </span>

        {step === 0 && (
          <>
            <h1 className="title" style={{ fontSize: 36 }}>Welcome to the gym plan</h1>
            <p className="mut">Your tracker now runs a beginner gym programme: machines, dumbbells and cables, four sessions a week, built from where you are today.</p>
            {(homeCount > 0 || nightCount > 0 || home) && (
              <section className="card soft stack" style={{ gap: 6 }}>
                <span className="row bold">
                  <Icon name="check" size={18} stroke={3} /> Everything you logged is safe
                </span>
                <p className="small">
                  {homeCount} home workout{homeCount === 1 ? '' : 's'} and {nightCount} night{nightCount === 1 ? '' : 's'} of sleep came across. Your old home plan is kept in Profile.
                </p>
              </section>
            )}
            <section className="card stack" style={{ gap: 10 }}>
              {[
                ['train', 'A plan that fits a first-timer', 'Upper and lower days, extra arm work, your weaker arm goes first.'],
                ['chart', 'Targets from your own numbers', 'It tells you today’s weight and reps, and when to add more.'],
                ['medal', 'Retests every 4 weeks', 'Push-ups, plank, chin-ups, bodyweight and both arms.'],
              ].map(([icon, t, d]) => (
                <div key={t} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <span className="acc" style={{ marginTop: 2 }}><Icon name={icon} /></span>
                  <span>
                    <span className="bold" style={{ display: 'block' }}>{t}</span>
                    <span className="small mut">{d}</span>
                  </span>
                </div>
              ))}
            </section>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="title">About you</h1>
            <div className="grid2">
              <label className="field">
                <span>Age</span>
                <Stepper value={age} onChange={setAge} label="age" min={10} max={99} round={1} />
              </label>
              <label className="field">
                <span>Height (cm)</span>
                <Stepper value={heightCm} onChange={setHeight} label="height" min={100} max={230} round={1} />
              </label>
            </div>
            <label className="field">
              <span>Bodyweight today (kg)</span>
              <NumInput value={weightKg} onChange={setWeight} label="bodyweight in kilograms" max={250} />
            </label>
            <div className="field">
              <span>Main goal</span>
              <div className="stack" style={{ gap: 6 }}>
                <button className="chip tall" aria-pressed={goal === 'bulk'} onClick={() => setGoal('bulk')}>
                  <span className="bold">Build muscle and gain weight</span>
                  <span className="small">A slow, lean bulk with extra arm work</span>
                </button>
                <button className="chip tall" aria-pressed={goal === 'fit'} onClick={() => setGoal('fit')}>
                  <span className="bold">Get stronger and fitter</span>
                  <span className="small">The same plan, without the weight-gain focus</span>
                </button>
              </div>
            </div>
            <div className="field">
              <span>Is one arm smaller?</span>
              <div className="seg" role="group" aria-label="Smaller arm">
                {(['left', 'right', 'none'] as const).map((a) => (
                  <button key={a} aria-pressed={weakArm === a} onClick={() => setWeakArm(a)}>
                    {a === 'none' ? 'No' : a === 'left' ? 'Left' : 'Right'}
                  </button>
                ))}
              </div>
              {weakArm !== 'none' && <p className="small mut">One-arm exercises will start with your {weakArm} arm, and the other arm matches its reps.</p>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="title">Your starting point</h1>
            <p className="mut">These become your first entries. You retest them every 4 weeks.</p>
            <label className="field">
              <span>Push-ups in one go (a half counts)</span>
              <Stepper value={pushups} onChange={setPushups} label="push-ups" step={0.5} max={200} />
            </label>
            <label className="field">
              <span>Longest plank</span>
              <Stepper value={plankS} onChange={setPlank} label="plank seconds" step={5} max={600} round={5} show={mmss} />
            </label>
            <label className="field">
              <span>Pull-ups (palms away)</span>
              <Stepper value={pullups} onChange={setPullups} label="pull-ups" max={50} round={1} />
            </label>
            <label className="field">
              <span>Chin-ups (palms facing you)</span>
              <NumInput value={chinups} onChange={(v) => setChinups(v == null ? null : Math.round(v))} label="chin-ups" placeholder="How many clean ones?" max={50} />
            </label>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setChinups(0)}>
              Not sure yet: use 0
            </button>
            <p className="small mut">Not sure is fine. With 0 the plan starts you on slow lowering reps and the assisted machine, and your first retest updates it.</p>
            <div className="grid2">
              <label className="field">
                <span>Left arm (cm, optional)</span>
                <NumInput value={armL} onChange={setArmL} label="left arm in centimetres" placeholder="e.g. 26.5" max={70} />
              </label>
              <label className="field">
                <span>Right arm (cm, optional)</span>
                <NumInput value={armR} onChange={setArmR} label="right arm in centimetres" placeholder="e.g. 27" max={70} />
              </label>
            </div>
            <p className="small mut">Measure flexed, around the widest part of the upper arm. No tape handy? Add it later in Progress.</p>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="title">Gym days</h1>
            <p className="mut">Pick up to {MAX_GYM_DAYS}. You can change these any time in Train.</p>
            <div className="week pick" role="group" aria-label="Gym days">
              {WEEKDAYS.map((w, i) => (
                <button key={w} aria-pressed={gymDays.includes(i)} onClick={() => toggleDay(i)}>
                  {w}
                </button>
              ))}
            </div>
            <div className="grid2">
              <label className="field">
                <span>Usual start time</span>
                <input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
              </label>
              <label className="field">
                <span>First session</span>
                <input className="input" type="date" value={start} min={addDays(today, -7)} onChange={(e) => e.target.value && setStart(e.target.value)} />
              </label>
            </div>
            <section className="card" style={{ padding: '6px 18px' }} aria-label="Your week">
              {preview.week.map((id, i) => {
                const d = preview.days.find((x) => x.id === id);
                if (!d) return null;
                return (
                  <div className="item" key={i}>
                    <span className="bold" style={{ width: 44 }}>{WEEKDAYS[i]}</span>
                    <span className="grow">{d.name}</span>
                    <span className="small mut">about {minutes(d.slots)} min</span>
                  </div>
                );
              })}
            </section>
            <p className="small mut">
              {gymDays.length >= 4 ? 'Two upper and two lower days, so nothing is trained hard two days in a row.' : gymDays.length ? 'Full-body sessions. Try to leave a rest day between them.' : 'Pick at least one day.'}
              {firstDay ? ` First up: ${firstDay.name} on ${fmtDate(start, { weekday: 'long', day: 'numeric', month: 'short' })} at ${clock12(time)}.` : gymDays.length ? ` ${fmtDate(start, { weekday: 'long', day: 'numeric', month: 'short' })} isn’t one of your gym days: pick the date of your first session.` : ''}
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="title">Before your first session</h1>
            {firstDay && (
              <section className="card soft stack" style={{ gap: 4 }}>
                <span className="label">{fmtDate(start, { weekday: 'long', day: 'numeric', month: 'long' })} · intro week</span>
                <span className="h2">{firstDay.name}</span>
                <p className="small">{firstDay.slots.map((s) => EX[s.exerciseId]?.name).join(' · ')}</p>
                <p className="small mut">Your first week is 2 light sets of each, to learn the movements and find your weights.</p>
              </section>
            )}
            <section className="card stack" style={{ gap: 10 }}>
              {SAFETY.lines.map((l) => (
                <div key={l} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <span className="acc" style={{ marginTop: 1 }}><Icon name="check" size={18} stroke={3} /></span>
                  <span className="small">{l}</span>
                </div>
              ))}
            </section>
            <button className="chip tall" aria-pressed={ok} onClick={() => setOk(!ok)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <span className={`dot ${ok ? 'on' : ''}`}>{ok && <Icon name="check" size={14} stroke={3} />}</span>
              <span className="bold" style={{ whiteSpace: 'normal', textAlign: 'left' }}>Got it: technique first, and I stop if something hurts</span>
            </button>
          </>
        )}
      </div>

      <div className="onb-foot">
        {step > 0 && (
          <button className="btn icon" aria-label="Back" onClick={() => setStep(step - 1)}>
            <Icon name="left" />
          </button>
        )}
        <button className="btn primary block" style={{ flex: 1 }} disabled={!canNext} onClick={() => (step === STEPS.length - 1 ? finish() : (setStep(step + 1), window.scrollTo(0, 0)))}>
          {step === 0 ? 'Set up my plan' : step === STEPS.length - 1 ? 'Start' : 'Next'}
        </button>
      </div>
    </main>
  );
}
