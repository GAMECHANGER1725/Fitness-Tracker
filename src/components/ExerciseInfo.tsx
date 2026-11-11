// Everything about one exercise: the form demo (3D, or 2D on phones that ask for less), cues, common
// mistakes, the muscles it works and where it sits on its ladder. Loaded on demand, so the workout logger
// never pays for it until "Form" is tapped.

import { EX, EXERCISES, MUSCLE_LABEL } from '../lib/exercises';
import { exerciseVolume } from '../lib/muscles';
import { BodyMap } from './Body';
import { FormDemo } from './FormDemo';
import { Icon } from './ui';

export default function ExerciseInfo({ exerciseId }: { exerciseId: string }) {
  const e = EX[exerciseId];
  if (!e) return null;
  const ladder = EXERCISES.filter((x) => x.ladder === e.ladder && !!x.home === !!e.home).sort((a, b) => a.step - b.step);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <h2 className="h2">{e.name}</h2>
        <span className="small mut">
          {e.primary.map((m) => MUSCLE_LABEL[m]).join(', ')}
          {e.secondary.length ? ` · helps: ${e.secondary.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')}` : ''}
        </span>
      </div>
      {e.demo && <FormDemo demo={e.demo} />}
      <section className="stack" style={{ gap: 6 }}>
        <span className="label">How to do it</span>
        {e.cues.map((c) => (
          <div key={c} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <span className="acc" style={{ marginTop: 1 }}><Icon name="check" size={18} stroke={3} /></span>
            <span>{c}</span>
          </div>
        ))}
      </section>
      {!!e.mistakes?.length && (
        <section className="stack" style={{ gap: 6 }}>
          <span className="label">Common mistakes</span>
          {e.mistakes.map((c) => (
            <div key={c} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span style={{ color: 'var(--warn)', marginTop: 1 }}><Icon name="close" size={18} stroke={3} /></span>
              <span>{c}</span>
            </div>
          ))}
        </section>
      )}
      {ladder.length > 1 && (
        <section className="stack" style={{ gap: 6 }}>
          <span className="label">Progression</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {ladder.map((x, i) => (
              <span key={x.id} className="row" style={{ gap: 6 }}>
                {i > 0 && <span className="dim">→</span>}
                <span className={`pill ${x.id === e.id ? '' : 'mut'}`}>{x.name}</span>
              </span>
            ))}
          </div>
        </section>
      )}
      <section className="stack" style={{ gap: 6 }}>
        <span className="label">Muscles worked</span>
        <BodyMap volume={exerciseVolume(e.id)} scale="focus" height={260} />
      </section>
      <p className="small mut">Stop if anything hurts. Not sure about your form? Ask a trainer at the gym to watch a set.</p>
    </div>
  );
}
