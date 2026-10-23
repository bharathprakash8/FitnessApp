import { setupIonicReact } from '@ionic/react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Ionic core CSS */
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/palettes/dark.system.css';
import './theme/variables.css';
import './theme/app.css';
import './theme/design.css';

import { registerSW } from 'virtual:pwa-register';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { flushQueue, onSynced, startAutoSync } from './lib/offlineQueue';
import { logError } from './lib/errorLog';
import { isAndroidApp } from './lib/platform';
import { persistOptions, queryClient } from './lib/queryClient';

setupIonicReact();

// Anything that slips through is still recorded in the problem log.
window.addEventListener('error', (e) => void logError('js', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => void logError('js', e.reason));

if (isAndroidApp) {
  // Older APKs registered the web app's offline cache; remove it so updates show at once.
  void navigator.serviceWorker?.getRegistrations().then(async (regs) => {
    await Promise.all(regs.map((r) => r.unregister()));
    if (regs.length && navigator.serviceWorker.controller) window.location.reload();
  });
} else {
  registerSW({ immediate: true });
}

// Saves made offline are sent when the connection is back; then the screens refresh.
onSynced(() => void queryClient.invalidateQueries());
startAutoSync();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => void flushQueue()}
    >
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </PersistQueryClientProvider>
  </StrictMode>,
);
