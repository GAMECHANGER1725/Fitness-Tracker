// Dev page (#/lab): every form demo, one at a time, for checking by eye and for scripts/perf-3d.mjs.
//   #/lab?demo=<id>   one demo        #/lab?flat=1   force the 2D fallback
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { DEMO_IDS, DEMOS } from '../lib/demos';
import { FormDemo } from '../components/FormDemo';
import { useRoute } from '../components/ui';

export default function Lab3d() {
  const { params } = useRoute();
  const view3d = useStore((s) => s.settings.view3d);
  const setSettings = useStore((s) => s.setSettings);
  const flat = params.get('flat') === '1';
  useEffect(() => {
    if (flat && view3d !== 'off') setSettings({ view3d: 'off' });
  }, [flat]);
  const [pick, setPick] = useState(params.get('demo') ?? DEMO_IDS[0]);
  const one = params.get('demo');
  const id = one ?? pick;
  return (
    <main className="page" style={{ paddingTop: 20 }}>
      <h1 className="title">Form demos</h1>
      {!one && (
        <div className="scroller" role="group" aria-label="Demos">
          {DEMO_IDS.map((d) => (
            <button key={d} className="chip" aria-pressed={pick === d} onClick={() => setPick(d)}>
              {DEMOS[d].name}
            </button>
          ))}
        </div>
      )}
      {DEMOS[id] ? (
        <section className="card stack">
          <h2 className="h2">{DEMOS[id].name}</h2>
          <FormDemo key={id} demo={id} />
        </section>
      ) : (
        <p className="empty">No demo called {id}.</p>
      )}
    </main>
  );
}
