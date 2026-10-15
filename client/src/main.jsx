import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SyncProvider } from './context/SyncContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Check for a newer build now and whenever the tab regains focus.
        reg.update().catch(() => {});
        window.addEventListener('focus', () => reg.update().catch(() => {}));
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Service worker registration failed:', err);
      });
  });

  // When a new service worker takes control, reload once so the latest
  // assets (and theme) are shown instead of a stale cached version.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <I18nProvider>
          <AuthProvider>
            <SyncProvider>
              <App />
            </SyncProvider>
          </AuthProvider>
        </I18nProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
