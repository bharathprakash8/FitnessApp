import type { Session } from '@supabase/supabase-js';
import { createContext } from 'react';

import type { Profile } from './roles';

export type AuthStatus =
  | 'loading' // checking the saved session or loading the profile
  | 'signed_out'
  | 'inactive' // signed in, but the account is deactivated
  | 'error' // profile could not be loaded (e.g. no network)
  | 'ready';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
  retry: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
