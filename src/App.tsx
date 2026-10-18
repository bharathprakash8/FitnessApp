import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import type { ReactElement } from 'react';
import { Route, matchPath, useLocation } from 'react-router-dom';

import { HealthAutoSync } from './features/activity/HealthAutoSync';
import { HealthSyncPage } from './features/activity/HealthSyncPage';
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
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { PushAutoRegister } from './features/notifications/PushAutoRegister';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { MePage } from './features/profile/MePage';
import { MyDetailsPage } from './features/profile/MyDetailsPage';
import { AddMeasurementPage, ProgressPage } from './features/progress/ProgressPage';
import { MySessionsPage } from './features/sessions/MySessionsPage';
import { MySummariesPage } from './features/summaries/MySummariesPage';
import { SessionDetailPage } from './features/sessions/SessionDetailPage';
import { SessionEditorPage } from './features/sessions/SessionEditorPage';
import { SessionsPage } from './features/sessions/SessionsPage';
import { TodayPage } from './features/today/TodayPage';
import { MyTargetsPage } from './features/trainer/MyTargetsPage';
import { TrainerClientPage } from './features/trainer/TrainerClientPage';
import { TrainerClientsPage } from './features/trainer/TrainerClientsPage';
import { ExerciseLibraryPage } from './features/workouts/ExerciseLibraryPage';
import { MyWorkoutEditorPage } from './features/workouts/MyWorkoutEditorPage';
import { PlanEditorPage } from './features/workouts/PlanEditorPage';
import { PlansPage } from './features/workouts/PlansPage';
import { SelfWorkoutPage } from './features/workouts/SelfWorkoutPage';
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
  '/trainer/my-targets',
  '/trainer/sessions',
  '/trainer/sessions/new',
  '/trainer/sessions/:id',
  '/trainer/sessions/:id/edit',
  '/me/sessions',
  '/me/summaries',
  '/me/progress',
  '/me/progress/new',
  '/onboarding',
  '/today',
  '/food',
  '/food/new/:mode',
  '/food/meal/:id',
  '/workouts',
  '/workouts/day/:dayId',
  '/workouts/history',
  '/workouts/mine/:id',
  '/workouts/self/:id',
  '/me',
  '/me/details',
  '/me/health',
  '/me/notifications',
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

// Screens are imported eagerly on purpose: React.lazy inside IonRouterOutlet shows a blank
// page (Ionic animates the Suspense placeholder in, and the real page then stays hidden).
const guarded = (role: Role | Role[], page: ReactElement, onboarding = false) => (
  <RequireRole role={role} onboarding={onboarding}>
    {page}
  </RequireRole>
);

const SELF: Role[] = ['client', 'trainer'];

export function App() {
  return (
    <IonApp>
      <AuthProvider>
        <HealthAutoSync />
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
            <Route path="/trainer/my-targets" element={guarded('trainer', <MyTargetsPage />)} />
            <Route path="/trainer/sessions" element={guarded('trainer', <SessionsPage />)} />
            <Route
              path="/trainer/sessions/new"
              element={guarded('trainer', <SessionEditorPage />)}
            />
            <Route
              path="/trainer/sessions/:id"
              element={guarded('trainer', <SessionDetailPage />)}
            />
            <Route
              path="/trainer/sessions/:id/edit"
              element={guarded('trainer', <SessionEditorPage />)}
            />

            {/* Client – and trainers for their own fitness ("My fitness") */}
            <Route path="/onboarding" element={guarded(SELF, <OnboardingPage />, true)} />
            <Route path="/today" element={guarded(SELF, <TodayPage />)} />
            <Route path="/food" element={guarded(SELF, <FoodPage />)} />
            <Route path="/food/new/:mode" element={guarded(SELF, <LogMealPage />)} />
            <Route path="/food/meal/:id" element={guarded(SELF, <EditMealPage />)} />
            <Route path="/workouts" element={guarded(SELF, <WorkoutsPage />)} />
            <Route path="/workouts/day/:dayId" element={guarded(SELF, <WorkoutDayPage />)} />
            <Route path="/workouts/history" element={guarded(SELF, <WorkoutHistoryPage />)} />
            <Route path="/workouts/mine/:id" element={guarded(SELF, <MyWorkoutEditorPage />)} />
            <Route path="/workouts/self/:id" element={guarded(SELF, <SelfWorkoutPage />)} />
            <Route path="/me" element={guarded(SELF, <MePage />)} />
            <Route path="/me/details" element={guarded(SELF, <MyDetailsPage />)} />
            <Route path="/me/health" element={guarded(SELF, <HealthSyncPage />)} />
            <Route path="/me/sessions" element={guarded('client', <MySessionsPage />)} />
            <Route path="/me/summaries" element={guarded('client', <MySummariesPage />)} />
            <Route path="/me/progress" element={guarded(SELF, <ProgressPage />)} />
            <Route path="/me/progress/new" element={guarded(SELF, <AddMeasurementPage />)} />
            <Route path="/me/notifications" element={guarded(SELF, <NotificationsPage />)} />
          </IonRouterOutlet>
          <RootRedirect />
          <PushAutoRegister />
        </IonReactRouter>
      </AuthProvider>
    </IonApp>
  );
}
