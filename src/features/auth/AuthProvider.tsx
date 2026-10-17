import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '../../lib/supabase';
import { useProfile } from './api';
import { AuthContext, type AuthState, type AuthStatus } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // undefined = still reading the saved session from storage
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    // Keep this callback synchronous: Supabase warns against awaiting inside it.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  const profileQuery = useProfile(userId);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const { refetch } = profileQuery;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<AuthState>(() => {
    let status: AuthStatus;
    if (session === undefined) status = 'loading';
    else if (session === null) status = 'signed_out';
    else if (profileQuery.isPending) status = 'loading';
    else if (profileQuery.isError) status = 'error';
    else if (profileQuery.data === null || !profileQuery.data.is_active) status = 'inactive';
    else status = 'ready';

    return {
      status,
      session: session ?? null,
      profile: status === 'ready' ? (profileQuery.data ?? null) : null,
      signOut,
      retry,
    };
  }, [session, profileQuery.isPending, profileQuery.isError, profileQuery.data, signOut, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
