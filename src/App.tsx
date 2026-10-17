import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import type { ReactElement } from 'react';
import { Route, matchPath, useLocation } from 'react-router-dom';

import { AdminHomePage } from './features/admin/AdminHomePage';
import { CreateUserPage } from './features/admin/CreateUserPage';
import { UserDetailPage } from './features/admin/UserDetailPage';
import { AuthProvider } from './features/auth/AuthProvider';
import { LoginPage } from './features/auth/LoginPage';
import { HomeRedirect, RequireRole } from './features/auth/RequireRole';
import type { Role } from './features/auth/roles';
import { EditMealPage } from './features/food/EditMealPage';
import { FoodPage } from './features/food/FoodPage';
import { LogMealPage } from './features/food/LogMealPage';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { MePage } from './features/profile/MePage';
import { MyDetailsPage } from './features/profile/MyDetailsPage';
import { TodayPage } from './features/today/TodayPage';
import { TrainerClientPage } from './features/trainer/TrainerClientPage';
import { TrainerClientsPage } from './features/trainer/TrainerClientsPage';
import { ExerciseLibraryPage } from './features/workouts/ExerciseLibraryPage';
import { PlanEditorPage } from './features/workouts/PlanEditorPage';
import { PlansPage } from './features/workouts/PlansPage';
import { WorkoutDayPage } from './features/workouts/WorkoutDayPage';
import { WorkoutHistoryPage } from './features/workouts/WorkoutHistoryPage';
import { WorkoutsPage } from './features/workouts/WorkoutsPage';

const KNOWN_PATHS = [
  '/login',
  '/admin',
  '/admin/users/new',
  '/admin/users/:id',
  '/admin/exercises',
  '/trainer',
  '/trainer/clients/:id',
  '/trainer/plans',
  '/trainer/plans/:id',
  '/trainer/exercises',
  '/trainer/me',
  '/onboarding',
  '/today',
  '/food',
  '/food/new/:mode',
  '/food/meal/:id',
  '/workouts',
  '/workouts/day/:dayId',
  '/workouts/history',
  '/me',
  '/me/details',
];

/**
 * Handles "/" and unknown addresses by sending the user to their home (or login).
 * This lives outside IonRouterOutlet on purpose: a "/" or "*" route inside the outlet
 * matches every path for Ionic, which then reuses that redirect view for later
 * navigations, so taps on links bounce back.
 */
function RootRedirect() {
  const { pathname } = useLocation();
  const known = KNOWN_PATHS.some((p) => matchPath(p, pathname));
  return known ? null : <HomeRedirect />;
}

const guarded = (role: Role, page: ReactElement, onboarding = false) => (
  <RequireRole role={role} onboarding={onboarding}>
    {page}
  </RequireRole>
);

export function App() {
  return (
    <IonApp>
      <AuthProvider>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route path="/login" element={<LoginPage />} />

            {/* Admin */}
            <Route path="/admin" element={guarded('admin', <AdminHomePage />)} />
            <Route path="/admin/users/new" element={guarded('admin', <CreateUserPage />)} />
            <Route path="/admin/users/:id" element={guarded('admin', <UserDetailPage />)} />
            <Route path="/admin/exercises" element={guarded('admin', <ExerciseLibraryPage />)} />

            {/* Trainer */}
            <Route path="/trainer" element={guarded('trainer', <TrainerClientsPage />)} />
            <Route
              path="/trainer/clients/:id"
              element={guarded('trainer', <TrainerClientPage />)}
            />
            <Route path="/trainer/plans" element={guarded('trainer', <PlansPage />)} />
            <Route path="/trainer/plans/:id" element={guarded('trainer', <PlanEditorPage />)} />
            <Route
              path="/trainer/exercises"
              element={guarded('trainer', <ExerciseLibraryPage />)}
            />
            <Route path="/trainer/me" element={guarded('trainer', <MePage />)} />

            {/* Client */}
            <Route path="/onboarding" element={guarded('client', <OnboardingPage />, true)} />
            <Route path="/today" element={guarded('client', <TodayPage />)} />
            <Route path="/food" element={guarded('client', <FoodPage />)} />
            <Route path="/food/new/:mode" element={guarded('client', <LogMealPage />)} />
            <Route path="/food/meal/:id" element={guarded('client', <EditMealPage />)} />
            <Route path="/workouts" element={guarded('client', <WorkoutsPage />)} />
            <Route path="/workouts/day/:dayId" element={guarded('client', <WorkoutDayPage />)} />
            <Route path="/workouts/history" element={guarded('client', <WorkoutHistoryPage />)} />
            <Route path="/me" element={guarded('client', <MePage />)} />
            <Route path="/me/details" element={guarded('client', <MyDetailsPage />)} />
          </IonRouterOutlet>
          <RootRedirect />
        </IonReactRouter>
      </AuthProvider>
    </IonApp>
  );
}
