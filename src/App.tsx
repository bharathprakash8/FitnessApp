import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route } from 'react-router-dom';

import { PlaceholderPage } from './components/PlaceholderPage';
import { AdminHomePage } from './features/admin/AdminHomePage';
import { CreateUserPage } from './features/admin/CreateUserPage';
import { UserDetailPage } from './features/admin/UserDetailPage';
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
                  <AdminHomePage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users/new"
              element={
                <RequireRole role="admin">
                  <CreateUserPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users/:id"
              element={
                <RequireRole role="admin">
                  <UserDetailPage />
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
