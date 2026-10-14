import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount element');

// The design is a 600×600 canvas. If the glasses (or any host) report a smaller
// viewport, scale the canvas down so nothing ever overflows or needs scrolling.
function fit() {
  const s = Math.min(window.innerWidth, window.innerHeight) / 600;
  root!.style.zoom = s > 0 && s < 0.999 ? String(Math.round(s * 1000) / 1000) : '';
}
fit();
window.addEventListener('resize', fit);

// Add ?debug to the URL to show a live readout of glasses input (for troubleshooting).
if (/[?&]debug\b/.test(location.search)) void import('./lib/debug').then(m => m.installDebug());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
