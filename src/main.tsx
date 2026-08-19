import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite/WebSocket errors that occur in this environment
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.message?.includes('WebSocket') || event.reason?.message?.includes('vite')) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });

  const originalError = console.error;
  console.error = (...args) => {
    const errorStr = args.map(a => typeof a === 'string' ? a : (a?.message || a?.toString() || '')).join(' ');
    if (errorStr.includes('failed to connect to websocket')) return;
    originalError.apply(console, args);
  };

  const originalWarn = console.warn;
  console.warn = (...args) => {
    const warnStr = args.map(a => typeof a === 'string' ? a : (a?.message || a?.toString() || '')).join(' ');
    if (warnStr.includes('maximum backoff delay')) return;
    originalWarn.apply(console, args);
  };
}

// Unregister service worker in dev environment to prevent stale cache chunk-loading "Script error"s
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) console.log('[Dev] Unregistered stale service worker successfully.');
      });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
