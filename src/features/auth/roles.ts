import type { Tables } from '../../lib/database.types';

export type Profile = Tables<'profiles'>;
export type Role = 'admin' | 'trainer' | 'client';

/** True for a client who hasn't finished onboarding yet. */
export function needsOnboarding(profile: Pick<Profile, 'role' | 'onboarded_at'>): boolean {
  return profile.role === 'client' && !profile.onboarded_at;
}

/** Where each user lands after login. */
export function homePathFor(profile: Pick<Profile, 'role' | 'onboarded_at'>): string {
  switch (profile.role) {
    case 'admin':
      return '/admin';
    case 'trainer':
      return '/trainer';
    default:
      return needsOnboarding(profile) ? '/onboarding' : '/today';
  }
}
