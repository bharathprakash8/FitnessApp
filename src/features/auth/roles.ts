import type { Tables } from '../../lib/database.types';

export type Profile = Tables<'profiles'>;
export type Role = 'admin' | 'trainer' | 'client';

/** Where each role lands after login. Client onboarding (/onboarding) arrives in Milestone 1. */
export function homePathFor(role: string): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'trainer':
      return '/trainer';
    default:
      return '/today';
  }
}
