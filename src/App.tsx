import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route } from 'react-router-dom';

import { PlaceholderPage } from './components/PlaceholderPage';
import { AuthProvider } from './features/auth/AuthProvider';
import { LoginPage } from './features/auth/LoginPage';
import { HomeRedirect, RequireRole } from './features/auth/RequireRole';

export function App() {
  return (
    <IonApp>
      <AuthProvider>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <RequireRole role="admin">
                  <PlaceholderPage title="Admin" message="The admin console comes in step 10." />
                </RequireRole>
              }
            />
            <Route
              path="/trainer"
              element={
                <RequireRole role="trainer">
                  <PlaceholderPage title="Trainer" message="Your trainer home is coming soon." />
                </RequireRole>
              }
            />
            <Route
              path="/today"
              element={
                <RequireRole role="client">
                  <PlaceholderPage title="Today" message="Your daily view is coming soon." />
                </RequireRole>
              }
            />
            <Route path="*" element={<HomeRedirect />} />
          </IonRouterOutlet>
        </IonReactRouter>
      </AuthProvider>
    </IonApp>
  );
}
