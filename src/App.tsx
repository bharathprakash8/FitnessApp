import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Suspense, lazy, type ComponentType, type ReactElement } from 'react';
import { Route, matchPath, useLocation } from 'react-router-dom';

import { StatusScreen } from './components/StatusScreen';

import { HealthAutoSync } from './features/activity/HealthAutoSync';
import { AuthProvider } from './features/auth/AuthProvider';
import { LoginPage } from './features/auth/LoginPage';
import { HomeRedirect, RequireRole } from './features/auth/RequireRole';
import type { Role } from './features/auth/roles';
import { PushAutoRegister } from './features/notifications/PushAutoRegister';
import { TodayPage } from './features/today/TodayPage';

/**
 * Screens other than Login and Today load when first opened, so the app starts faster on
 * a slow connection (the service worker still caches all of them for offline use).
 */
function lazyPage(load: () => Promise<ComponentType>) {
  return lazy(async () => ({ default: await load() }));
}

const HealthSyncPage = lazyPage(() =>
  import('./features/activity/HealthSyncPage').then((m) => m.HealthSyncPage),
);
const AdminHomePage = lazyPage(() =>
  import('./features/admin/AdminHomePage').then((m) => m.AdminHomePage),
);
const CreateUserPage = lazyPage(() =>
  import('./features/admin/CreateUserPage').then((m) => m.CreateUserPage),
);
const UserDetailPage = lazyPage(() =>
  import('./features/admin/UserDetailPage').then((m) => m.UserDetailPage),
);
const EditMealPage = lazyPage(() =>
  import('./features/food/EditMealPage').then((m) => m.EditMealPage),
);
const FoodPage = lazyPage(() => import('./features/food/FoodPage').then((m) => m.FoodPage));
const LogMealPage = lazyPage(() =>
  import('./features/food/LogMealPage').then((m) => m.LogMealPage),
);
const NotificationsPage = lazyPage(() =>
  import('./features/notifications/NotificationsPage').then((m) => m.NotificationsPage),
);
const OnboardingPage = lazyPage(() =>
  import('./features/onboarding/OnboardingPage').then((m) => m.OnboardingPage),
);
const MePage = lazyPage(() => import('./features/profile/MePage').then((m) => m.MePage));
const MyDetailsPage = lazyPage(() =>
  import('./features/profile/MyDetailsPage').then((m) => m.MyDetailsPage),
);
const MyTargetsPage = lazyPage(() =>
  import('./features/trainer/MyTargetsPage').then((m) => m.MyTargetsPage),
);
const TrainerClientPage = lazyPage(() =>
  import('./features/trainer/TrainerClientPage').then((m) => m.TrainerClientPage),
);
const TrainerClientsPage = lazyPage(() =>
  import('./features/trainer/TrainerClientsPage').then((m) => m.TrainerClientsPage),
);
const ExerciseLibraryPage = lazyPage(() =>
  import('./features/workouts/ExerciseLibraryPage').then((m) => m.ExerciseLibraryPage),
);
const MyWorkoutEditorPage = lazyPage(() =>
  import('./features/workouts/MyWorkoutEditorPage').then((m) => m.MyWorkoutEditorPage),
);
const PlanEditorPage = lazyPage(() =>
  import('./features/workouts/PlanEditorPage').then((m) => m.PlanEditorPage),
);
const PlansPage = lazyPage(() => import('./features/workouts/PlansPage').then((m) => m.PlansPage));
const SelfWorkoutPage = lazyPage(() =>
  import('./features/workouts/SelfWorkoutPage').then((m) => m.SelfWorkoutPage),
);
const WorkoutDayPage = lazyPage(() =>
  import('./features/workouts/WorkoutDayPage').then((m) => m.WorkoutDayPage),
);
const WorkoutHistoryPage = lazyPage(() =>
  import('./features/workouts/WorkoutHistoryPage').then((m) => m.WorkoutHistoryPage),
);
const WorkoutsPage = lazyPage(() =>
  import('./features/workouts/WorkoutsPage').then((m) => m.WorkoutsPage),
);

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

const guarded = (role: Role | Role[], page: ReactElement, onboarding = false) => (
  <RequireRole role={role} onboarding={onboarding}>
    <Suspense fallback={<StatusScreen loading />}>{page}</Suspense>
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
            <Route path="/me/notifications" element={guarded(SELF, <NotificationsPage />)} />
          </IonRouterOutlet>
          <RootRedirect />
          <PushAutoRegister />
        </IonReactRouter>
      </AuthProvider>
    </IonApp>
  );
}
