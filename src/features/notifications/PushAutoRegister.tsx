import { PushNotifications } from '@capacitor/push-notifications';
import { useIonRouter, useIonToast } from '@ionic/react';
import { useEffect } from 'react';

import { isAndroidApp } from '../../lib/platform';
import { useAuth } from '../auth/useAuth';
import { refreshPushToken } from './push';

/**
 * Renders nothing. Keeps this device's push token fresh after login, and in the Android
 * app opens the right screen when a notification is tapped (and shows ones that arrive
 * while the app is open).
 */
export function PushAutoRegister() {
  const { profile } = useAuth();
  const router = useIonRouter();
  const [toast] = useIonToast();
  const userId = profile?.is_active ? profile.id : null;

  useEffect(() => {
    if (!userId) return;
    void refreshPushToken().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!isAndroidApp) return;
    const tapped = PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const url = (a.notification.data as { url?: string } | undefined)?.url;
      if (url?.startsWith('/')) router.push(url);
    });
    const received = PushNotifications.addListener('pushNotificationReceived', (n) => {
      void toast({
        header: n.title,
        message: n.body,
        duration: 5000,
        position: 'top',
        color: 'primary',
      });
    });
    return () => {
      void tapped.then((h) => h.remove());
      void received.then((h) => h.remove());
    };
  }, [router, toast]);

  return null;
}
