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

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { flushQueue, onSynced, startAutoSync } from './lib/offlineQueue';
import { persistOptions, queryClient } from './lib/queryClient';

setupIonicReact();

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
