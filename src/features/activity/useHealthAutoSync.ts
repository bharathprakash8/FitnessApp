import { App } from '@capacitor/app';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { isImpersonating } from '../../lib/impersonation';
import { isAndroidApp } from '../../lib/platform';
import type { Profile } from '../auth/roles';
import { healthConnectState, syncHealthConnect } from './healthConnect';

/** Android app: sync Health Connect when the app opens and whenever it comes back to the front. */
export function useHealthAutoSync(profile: Profile | null) {
  const qc = useQueryClient();
  // Clients, and trainers who set up "My fitness".
  const clientId =
    (profile?.role === 'client' || profile?.role === 'trainer') && profile.onboarded_at
      ? profile.id
      : null;
  const tz = profile?.timezone ?? 'Asia/Kolkata';

  useEffect(() => {
    // Admin logged in as someone: this phone's health data isn't theirs.
    if (!isAndroidApp || !clientId || isImpersonating()) return;
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        if ((await healthConnectState()) === 'connected') {
          await syncHealthConnect(clientId, tz);
          await qc.invalidateQueries({ queryKey: ['activity'] });
        }
      } catch {
        // offline or Health Connect busy – the next open will try again
      } finally {
        busy = false;
      }
    };
    void run();
    const sub = App.addListener('resume', () => void run());
    return () => {
      void sub.then((s) => s.remove());
    };
  }, [clientId, tz, qc]);
}
