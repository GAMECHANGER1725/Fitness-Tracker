import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/manrope';
import './styles.css';
import App from './App';
import { startHash, useLayout } from './lib/layout';

// Opened with no page in the URL (home-screen icon): go to the chosen start page.
const to = startHash(location.hash, useLayout.getState().start);
if (to) history.replaceState(null, '', to);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
