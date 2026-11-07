import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App';

// Automatic reload retry for failed chunk or stylesheet loading (e.g. ChunkLoadError / failed CSS chunks)
function setupChunkReloadRetry() {
  const RETRY_KEY = 'ff_chunk_reload_retry';

  const tryReload = (reason) => {
    try {
      const lastRetry = sessionStorage.getItem(RETRY_KEY);
      const now = Date.now();
      // Only reload if we haven't reloaded within the last 15 seconds
      if (!lastRetry || now - Number(lastRetry) > 15000) {
        sessionStorage.setItem(RETRY_KEY, String(now));
        console.warn(`[FleetFlow] Failed chunk/CSS detected (${reason}). Reloading page once...`);
        window.location.reload();
      }
    } catch {
      // sessionStorage might fail in restricted environments
    }
  };

  window.addEventListener(
    'error',
    (event) => {
      const msg = event?.message || '';
      const isChunkError =
        msg.includes('Loading chunk') ||
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading CSS chunk') ||
        msg.includes('CSS chunk load failed');

      const isStylesheetFailure =
        event?.target?.tagName === 'LINK' && event?.target?.rel === 'stylesheet';

      if (isChunkError || isStylesheetFailure) {
        tryReload(isStylesheetFailure ? 'stylesheet load error' : msg);
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason?.message || String(event?.reason || '');
    if (
      reason.includes('Loading chunk') ||
      reason.includes('ChunkLoadError') ||
      reason.includes('Loading CSS chunk') ||
      reason.includes('CSS chunk load failed')
    ) {
      tryReload(reason);
    }
  });
}

// In development, CRA registers an unhandled error listener that mounts an iframe overlay.
// If an ErrorBoundary caught the error or if the user closes it, allow the user to dismiss/suppress it so friendly fallbacks show.
if (process.env.NODE_ENV === 'development') {
  const originalError = console.error;
  console.error = (...args) => {
    // Keep logging technical errors to dev console
    originalError.apply(console, args);
  };

  // Prevent CRA webpack-dev-server error overlay from masking component ErrorBoundary fallbacks
  window.addEventListener('error', (event) => {
    // If the error was caught by ErrorBoundary, stop propagation to CRA overlay iframe
    if (event?.error?._caughtByBoundary) {
      event.stopImmediatePropagation();
    }
  });
}

setupChunkReloadRetry();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
