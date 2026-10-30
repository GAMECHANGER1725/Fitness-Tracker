// "Install the app": Chrome and Samsung Internet hand over a prompt event we can trigger from a button; elsewhere
// (Safari, Firefox) we show where Add to Home screen lives. Hidden once the app runs installed.

import { create } from 'zustand';

interface PromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const useInstall = create<{ prompt: PromptEvent | null; installed: boolean }>(() => ({
  prompt: null,
  installed: typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ prompt: e as PromptEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, prompt: null }));
}

/** Shows the browser's install dialog; true if the app was installed. */
export async function install(): Promise<boolean> {
  const p = useInstall.getState().prompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  useInstall.setState({ prompt: null, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}
