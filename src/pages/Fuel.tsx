import { useStore } from '../lib/store';
import { refreshFuel, useFuel, useSync } from '../lib/sync';
import { FUEL_URL } from '../lib/fuel';
import { addDays, daysBetween, fmtDate } from '../lib/dates';
import { clock12, clockOf, lateMeal, minsOf } from '../lib/sleep';
import { Bar, Head, Icon, toast, useToday } from '../components/ui';
import { useWeight } from '../components/data';

export default function Fuel() {
  const today = useToday();
  const { data, local, gist, at, error } = useFuel();
  const conn = useSync((s) => s.conn);
  const sessions = useStore((s) => s.sessions);
  const nights = useStore((s) => s.nights);
  const bedtime = useStore((s) => s.settings.bedtime);
  const mb = (minsOf(bedtime) - 150 + 1440) % 1440;
  const mealBy = `${String(Math.floor(mb / 60)).padStart(2, '0')}:${String(mb % 60).padStart(2, '0')}`;
  const weight = useWeight();
  const t = data?.targets;
  const f = data?.days[today];
  const src = local && gist ? 'this phone and your gist' : local ? 'this phone' : gist ? 'your gist' : null;

  const open = (
    <a href={FUEL_URL} className="pill fuel" style={{ minHeight: 40, padding: '0 14px', textDecoration: 'none' }}>
      Open Fuel Log <Icon name="out" size={16} />
    </a>
  );

  if (!data) {
    return (
      <main>
        <Head over="From Fuel Log" title="Fuel" right={open} />
        <div className="page">
          <section className="card ember stack" style={{ gap: 10 }}>
            <h2 className="h2">Not linked yet</h2>
            <p className="small">Fuel shows what you’ve eaten in Fuel Log next to your training and sleep. It links by itself when:</p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Fuel Log is used on this phone (same website), or</li>
              <li>both apps sync with the same GitHub token (Profile → Sync).</li>
            </ul>
            {error && <p className="small" style={{ color: 'var(--danger)' }}>{error}</p>}
            <button className="btn fuel" onClick={() => refreshFuel(true).then(() => toast(useFuel.getState().data ? 'Linked to Fuel Log' : 'No Fuel Log data found'))}>
              <Icon name="refresh" size={18} /> Check again
            </button>
          </section>
        </div>
      </main>
    );
  }

  const past = Array.from({ length: 7 }, (_, i) => addDays(today, -1 - i)).map((k) => [k, data.days[k]] as const).filter(([, d]) => d);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgP = avg(past.map(([, d]) => d!.protein));
  const perKg = avgP != null ? avgP / weight : null;
  const trained = new Set(Object.values(sessions).map((s) => s.date));
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today, -1 - i)).filter((k) => data.days[k]);
  const tk = avg(last28.filter((k) => trained.has(k)).map((k) => data.days[k].kcal));
  const rk = avg(last28.filter((k) => !trained.has(k)).map((k) => data.days[k].kcal));
  const w = data.weighIns;
  // Over the last 4 weeks of weigh-ins, in kg a week.
  const recentW = w.filter((x) => x.date >= addDays(today, -28));
  const rate = recentW.length >= 2 ? (recentW.at(-1)!.kg - recentW[0].kg) / Math.max(1, daysBetween(recentW[0].date, recentW.at(-1)!.date) / 7) : null;
  const maxK = Math.max(tk ?? 0, rk ?? 0, 1);

  return (
    <main>
      <Head over={`Synced from ${src}${at ? ` · ${new Date(at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : ''}`} title="Fuel" right={open} />
      <div className="page">
        <section className="card stack" style={{ gap: 14 }} aria-label="Today">
          <div className="stack" style={{ gap: 6 }}>
            <div className="between">
              <span className="bold">Energy</span>
              <span className="bold">
                {(f?.kcal ?? 0).toLocaleString('en-AU')} <span className="mut">/ {t ? t.kcal.toLocaleString('en-AU') : '?'} kcal</span>
              </span>
            </div>
            <Bar value={f?.kcal ?? 0} max={t?.kcal ?? 1} color="var(--fuel)" height={10} label="Energy" />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="between">
              <span className="bold">Protein</span>
              <span className="bold">
                {Math.round(f?.protein ?? 0)} <span className="mut">/ {t ? Math.round(t.protein) : '?'} g</span>
              </span>
            </div>
            <Bar value={f?.protein ?? 0} max={t?.protein ?? 1} color="var(--pro)" height={10} label="Protein" />
          </div>
          <div className="grid3">
            <div className="tile">
              <span className="small mut">Carbs</span>
              <p className="bold">{Math.round(f?.carbs ?? 0)} g</p>
            </div>
            <div className="tile">
              <span className="small mut">Fat</span>
              <p className="bold">{Math.round(f?.fat ?? 0)} g</p>
            </div>
            <div className="tile">
              <span className="small mut">Last food</span>
              <p className="bold">{f?.last ? clockOf(f.last) : '–'}</p>
            </div>
          </div>
          <p className="small mut">
            Last big meal by {clock12(mealBy)}, 2.5 h before lights out at {clock12(bedtime)}. A small snack later is fine.
          </p>
        </section>

        <div className="grid2">
          <section className="card tight">
            <span className="small mut">Protein per kg</span>
            <p className="num" style={{ fontSize: 28 }}>{perKg != null ? `${perKg.toFixed(1)} g` : '–'}</p>
            <span className="small" style={{ color: perKg == null ? 'var(--mut)' : perKg >= 1.6 ? 'var(--acc)' : 'var(--warn)' }}>
              {perKg == null ? 'no days logged' : perKg >= 1.6 ? '7-day avg, in range' : '7-day avg, aim for 1.6+'}
            </span>
          </section>
          <section className="card tight">
            <span className="small mut">Weight</span>
            <p className="num" style={{ fontSize: 28 }}>{weight.toFixed(1)} kg</p>
            <span className="small" style={{ color: rate == null ? 'var(--mut)' : rate >= 0.2 && rate <= 0.6 ? 'var(--acc)' : 'var(--warn)' }}>
              {rate == null ? 'weigh in on Fuel Log' : `${rate >= 0 ? '+' : ''}${rate.toFixed(2)} kg a week`}
            </span>
          </section>
        </div>

        {w.length >= 3 && (() => {
          const pts = w.slice(-12);
          const lo = Math.min(...pts.map((x) => x.kg)) - 0.3;
          const hi = Math.max(...pts.map((x) => x.kg)) + 0.3;
          const xy = pts.map((x, i) => [4 + (i / (pts.length - 1)) * 292, 70 - ((x.kg - lo) / (hi - lo)) * 60] as const);
          return (
            <section className="card stack" style={{ gap: 8 }} aria-label="Weight trend">
              <div className="between">
                <h2 className="h2">Weight</h2>
                <span className="small mut">last {pts.length} weigh-ins</span>
              </div>
              <svg viewBox="0 0 300 80" width="100%" height="80" preserveAspectRatio="none" role="img" aria-label={`Weight from ${pts[0].kg} to ${pts.at(-1)!.kg} kg`}>
                <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="var(--fuel)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="between small mut">
                <span>{fmtDate(pts[0].date, { day: 'numeric', month: 'short' })} · {pts[0].kg.toFixed(1)} kg</span>
                <span>{fmtDate(pts.at(-1)!.date, { day: 'numeric', month: 'short' })} · <span className="bold" style={{ color: 'var(--ink)' }}>{pts.at(-1)!.kg.toFixed(1)} kg</span></span>
              </div>
            </section>
          );
        })()}

        {tk != null && rk != null && (
          <section className="card stack" style={{ gap: 12 }} aria-label="Training days vs rest days">
            <h2 className="h2">Training days vs rest days</h2>
            <div className="row" style={{ gap: 12 }}>
              <span className="small mut" style={{ width: 72 }}>Training</span>
              <div className="grow"><Bar value={tk} max={maxK} height={10} label="Training days" /></div>
              <span className="bold" style={{ width: 56, textAlign: 'right' }}>{Math.round(tk).toLocaleString('en-AU')}</span>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <span className="small mut" style={{ width: 72 }}>Rest</span>
              <div className="grow"><Bar value={rk} max={maxK} color="var(--dim)" height={10} label="Rest days" /></div>
              <span className="bold" style={{ width: 56, textAlign: 'right' }}>{Math.round(rk).toLocaleString('en-AU')}</span>
            </div>
            <p className="small mut">
              {tk - rk > 250 ? `You eat about ${Math.round(tk - rk)} kcal less on rest days. Muscle grows on those days too, so keep eating to target.` : rk - tk > 250 ? 'You eat less on training days. Add a snack after your workout.' : 'You eat about the same on training and rest days. Good.'}
            </p>
          </section>
        )}

        <section className="card" style={{ padding: '14px 18px 6px' }} aria-label="Last 7 days">
          <h2 className="h2" style={{ marginBottom: 4 }}>Last 7 days</h2>
          {past.length ? (
            past.map(([k, d]) => (
              <div className="item" key={k}>
                <span className="grow">
                  <span className="bold" style={{ display: 'block' }}>{fmtDate(k, { weekday: 'short', day: 'numeric', month: 'short' })}{trained.has(k) ? ' · trained' : ''}</span>
                  <span className="small mut">
                    last food {d!.last ? clockOf(d!.last) : '–'}
                    {lateMeal(d!.last, nights, k) && <span style={{ color: 'var(--warn)' }}> · late, close to bed</span>}
                  </span>
                </span>
                <span className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
                  <span className="bold" style={{ color: t && d!.kcal >= t.kcal * 0.95 ? 'var(--acc)' : undefined }}>{d!.kcal.toLocaleString('en-AU')} kcal</span>
                  <span className="small" style={{ color: 'var(--pro)' }}>{Math.round(d!.protein)} g protein</span>
                </span>
              </div>
            ))
          ) : (
            <p className="small mut" style={{ paddingBottom: 10 }}>Nothing logged in the last week.</p>
          )}
        </section>
        {!conn && <p className="small mut">Tip: connect sync in Profile to see food you log on other devices.</p>}
      </div>
    </main>
  );
}
