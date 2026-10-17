import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route } from 'react-router-dom';

import { PlaceholderPage } from './components/PlaceholderPage';

export function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route
            path="/login"
            element={<PlaceholderPage title="FitCoach" message="Login comes in step 8." />}
          />
          <Route
            path="/admin"
            element={<PlaceholderPage title="Admin" message="Admin console comes in step 10." />}
          />
          <Route
            path="/trainer"
            element={<PlaceholderPage title="Trainer" message="Trainer home – coming soon." />}
          />
          <Route
            path="/today"
            element={<PlaceholderPage title="Today" message="Client home – coming soon." />}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
