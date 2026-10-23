import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';

import { StatusScreen } from '../../components/StatusScreen';
import { homePathFor, needsOnboarding, type Role } from './roles';
import { useAuth } from './useAuth';
import { useT } from '../../i18n/i18n';

/**
 * Shows `children` only to a signed-in, active user with one of the given roles.
 * Others are sent to login or to their own home. Clients who haven't finished
 * onboarding are kept on /onboarding (`onboarding` marks that page itself). Trainers may
 * open /onboarding once, to set up "My fitness"; afterwards it sends them to /today.
 * The database enforces access through RLS; this guard is for a sensible UI.
 */
export function RequireRole({
  role,
  onboarding = false,
  children,
}: {
  role: Role | Role[];
  onboarding?: boolean;
  children: ReactElement;
}) {
  const t = useT();
  const { status, profile, signOut, retry } = useAuth();

  switch (status) {
    case 'loading':
      return <StatusScreen loading />;
    case 'signed_out':
      return <Navigate to="/login" replace />;
    case 'inactive':
      return (
        <StatusScreen
          title={t('Account not active')}
          message={t('Your FitCoach account is not active. Ask your trainer or admin for access.')}
          actions={[{ label: t('Log out'), onClick: () => void signOut() }]}
        />
      );
    case 'error':
      return (
        <StatusScreen
          title={t("Can't load your account")}
          message={t('Please check your internet connection and try again.')}
          actions={[
            { label: t('Try again'), onClick: retry },
            { label: t('Log out'), onClick: () => void signOut() },
          ]}
        />
      );
    case 'ready':
      if (!profile) return <StatusScreen loading />;
      if (!(Array.isArray(role) ? role : [role]).includes(profile.role as Role)) {
        return <Navigate to={homePathFor(profile)} replace />;
      }
      if (profile.role === 'trainer') {
        return onboarding && profile.onboarded_at ? <Navigate to="/today" replace /> : children;
      }
      if (needsOnboarding(profile) !== onboarding) {
        return <Navigate to={homePathFor(profile)} replace />;
      }
      return children;
  }
}

/**
 * `/` and unknown paths: go to the user's home, or to login.
 * Rendered outside the IonRouterOutlet, so it shows nothing itself while loading.
 */
export function HomeRedirect() {
  const { status, profile } = useAuth();
  if (status === 'loading') return null;
  if (status === 'ready' && profile) return <Navigate to={homePathFor(profile)} replace />;
  if (status === 'signed_out') return <Navigate to="/login" replace />;
  // inactive / error: the guarded page shows the right message
  return <Navigate to="/today" replace />;
}
