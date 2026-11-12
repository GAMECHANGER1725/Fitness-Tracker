// Dev page (#/lab): every 3D view and its 2D fallback in one place, for checking by eye and for scripts/perf-3d.mjs.
//   #/lab              everything          #/lab?demo=<id>   one form demo
//   #/lab?only=body    the body map only   #/lab?flat=1      force the 2D fallbacks
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { DEMO_IDS, DEMOS } from '../lib/demos';
import { emptyVolume, exerciseVolume } from '../lib/muscles';
import { BodyMap } from '../components/Body';
import { FormDemo } from '../components/FormDemo';
import { useRoute } from '../components/ui';

const SAMPLE = { ...emptyVolume(), chest: 6, shoulders: 9, biceps: 14, triceps: 7, forearms: 5, lats: 11, upperBack: 9, lowerBack: 2, abs: 8, obliques: 3, glutes: 12, quads: 18, hamstrings: 10, calves: 4 };

export default function Lab3d() {
  const { params } = useRoute();
  const view3d = useStore((s) => s.settings.view3d);
  const setSettings = useStore((s) => s.setSettings);
  const flat = params.get('flat') === '1';
  useEffect(() => {
    if (flat && view3d !== 'off') setSettings({ view3d: 'off' });
  }, [flat]);
  const one = params.get('demo');
  const only = params.get('only');
  // One demo at a time: phones allow only a handful of WebGL contexts at once.
  const [pick, setPick] = useState(DEMO_IDS[0]);
  return (
    <main className="page" style={{ paddingTop: 20 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h1 className="title">3D lab</h1>
        <div className="seg" role="group" aria-label="3D views">
          {(['auto', 'on', 'off'] as const).map((k) => (
            <button key={k} aria-pressed={view3d === k} onClick={() => (k !== 'off' && localStorage.removeItem('fitness-3d-slow'), setSettings({ view3d: k }))}>
              {k === 'off' ? 'Force 2D' : k === 'on' ? '3D' : 'Auto'}
            </button>
          ))}
        </div>
      </div>
      {one ? (
        DEMOS[one] ? <section className="card"><FormDemo demo={one} /></section> : <p className="empty">No demo called {one}.</p>
      ) : (
        <>
          <section className="card stack">
            <h2 className="h2">Body map: weekly sets</h2>
            <BodyMap volume={SAMPLE} scale="heat" height={380} />
          </section>
          {only !== 'body' && (
            <>
              <section className="card stack">
                <h2 className="h2">Body map: one exercise (curl)</h2>
                <BodyMap volume={exerciseVolume('db-curl')} scale="focus" height={260} />
              </section>
              <div className="scroller" role="group" aria-label="Demos">
                {DEMO_IDS.map((id) => (
                  <button key={id} className="chip" aria-pressed={pick === id} onClick={() => setPick(id)}>
                    {DEMOS[id].name}
                  </button>
                ))}
              </div>
              <section className="card stack">
                <h2 className="h2">{DEMOS[pick].name}</h2>
                <FormDemo key={pick} demo={pick} />
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
