import { useEffect } from 'react';
import { useStore } from './lib/store';
import { Icon, Toast, toast, useGame, useRoute, useToday } from './components/ui';
import Today from './pages/Today';
import Workout from './pages/Workout';
import Train from './pages/Train';
import Sleep from './pages/Sleep';
import Fuel from './pages/Fuel';
import Coach from './pages/Coach';
import ProfilePage from './pages/Profile';
import Lock from './pages/Lock';
import { useAuth } from './lib/auth';
import { startSync, useSync } from './lib/sync';
import { autoDue, checkIn, currentAi, useCoach } from './lib/coach';
import { hasAi } from './lib/ai';
import { startReminders } from './lib/reminders';
import { WhatsNewOnce } from './components/WhatsNew';
import { useLayout } from './lib/layout';

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const unlocked = useAuth((s) => s.unlocked);
  const { path } = useRoute();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0C1013');
  }, [theme]);

  const large = useLayout((l) => l.large);
  useEffect(() => {
    // ponytail: CSS zoom scales the px-based design as a whole; fine on current Chrome, Safari and Samsung Internet.
    document.documentElement.style.setProperty('zoom', large ? '1.12' : '');
  }, [large]);
  const accent = useLayout((l) => l.accent);
  useEffect(() => {
    const root = document.documentElement;
    if (accent === 'mint') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', accent);
  }, [accent]);

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  useEffect(() => (unlocked ? startSync() : undefined), [unlocked]);
  useEffect(() => (unlocked ? startReminders() : undefined), [unlocked]);
  const sync = useSync();

  // Weekly coach check-in, by itself. With sync on, waits for the first sync so it sees both devices' data.
  const auto = useCoach((c) => c.auto);
  const today = useToday();
  const synced = !sync.conn || (sync.status !== 'syncing' && (!!sync.last || sync.status === 'error'));
  useEffect(() => {
    if (!unlocked || !hasAi(currentAi()) || !synced || !autoDue(today)) return;
    const t = setTimeout(() => {
      if (!autoDue(today)) return;
      useCoach.getState().set({ tried: Date.now() });
      checkIn()
        .then((r) => r.applied && (r.lines.length || r.sleep.bedtime !== r.sleep.prevBedtime) && toast('Your coach did the weekly check-in. See Coach.'))
        .catch(() => {}); // Tried again in a few hours.
    }, 4000);
    return () => clearTimeout(t);
  }, [unlocked, synced, auto, today]);

  if (!unlocked) return <Lock />;

  const page =
    path === 'workout' ? <Workout /> : path === 'train' ? <Train /> : path === 'sleep' ? <Sleep /> : path === 'fuel' ? <Fuel /> : path === 'coach' ? <Coach /> : path === 'profile' ? <ProfilePage /> : <Today />;

  return (
    <div className="app">
      {sync.status === 'error' && sync.kind !== 'offline' && sync.kind !== 'rate' && path !== 'profile' && (
        <a href="#/profile?open=sync" className="card tight" style={{ display: 'block', margin: '12px 16px 0', color: 'var(--ink)', textDecoration: 'none', boxShadow: 'inset 0 0 0 1.5px var(--danger)' }}>
          <span className="bold" style={{ color: 'var(--danger)' }}>Sync problem</span>
          <span className="small" style={{ display: 'block' }}>{sync.error} Tap to fix.</span>
        </a>
      )}
      {page}
      {path !== 'workout' && <Nav path={path} />}
      <Badges />
      {path !== 'workout' && <WhatsNewOnce />}
      <Toast />
    </div>
  );
}

function Nav({ path }: { path: string }) {
  const link = (to: string, icon: string, label: string, cls = '') => (
    <a href={`#/${to}`} className={cls} aria-current={path === to || (to === 'today' && !['train', 'sleep', 'fuel', 'coach'].includes(path)) ? 'page' : undefined} aria-label={label}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );
  return (
    <nav className="nav" aria-label="Sections">
      <div>
        {link('today', 'home', 'Today')}
        {link('train', 'train', 'Train')}
        {link('sleep', 'moon', 'Sleep', 'sleep')}
        {link('fuel', 'flame', 'Fuel', 'fuel')}
        {link('coach', 'spark', 'Coach')}
      </div>
    </nav>
  );
}

/** New badges get a toast once. */
function Badges() {
  const g = useGame();
  const seen = useStore((s) => s.seen);
  const markSeen = useStore((s) => s.markSeen);
  const earned = g.badges.filter((b) => b.earned);
  const fresh = earned.filter((b) => !seen.badges.includes(b.id));
  useEffect(() => {
    if (!fresh.length) return;
    markSeen(earned.map((b) => b.id));
    setTimeout(() => toast(`Badge unlocked: ${fresh.map((b) => b.name).join(', ')}`), 1200);
  }, [fresh.length]);
  return null;
}
