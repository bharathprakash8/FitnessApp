import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { useCallback, useEffect, useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { useReminderSettings } from './api';
import {
  disablePush,
  enablePush,
  isThisDeviceRegistered,
  pushPermission,
  pushSupport,
  sendTestNotification,
  type PushPermission,
} from './push';
import { IosInstallSteps } from './IosInstallSteps';
import { ReminderForm } from './ReminderForm';
import { TrainerRemindersCard } from './TrainerRemindersCard';
import './notifications.css';
import { useT } from '../../i18n/i18n';

export function NotificationsPage() {
  const t = useT();
  const { profile } = useAuth();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>{t('Notifications')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="notif-page">
          <DeviceCard />
          {profile?.role === 'client' && (
            <>
              <RemindersCard clientId={profile.id} />
              <TrainerRemindersCard clientId={profile.id} />
            </>
          )}
          {profile?.role === 'trainer' && profile.onboarded_at && (
            <RemindersCard clientId={profile.id} />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function DeviceCard() {
  const t = useT();
  const [toast] = useIonToast();
  const support = pushSupport();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [registered, setRegistered] = useState(isThisDeviceRegistered());
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => void pushPermission().then(setPermission), []);
  useEffect(refresh, [refresh]);

  const notify = (message: string, color?: string) =>
    void toast({ message, duration: color ? 3500 : 2000, color, position: 'top' });

  async function turnOn() {
    setBusy(true);
    try {
      const p = await enablePush();
      setPermission(p);
      setRegistered(p === 'granted');
      if (p === 'granted') notify('Notifications are on for this device');
      else
        notify(
          'Notifications were not allowed. You can change this in your phone settings.',
          'warning',
        );
    } catch {
      notify('Could not turn on notifications. Check your internet and try again.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disablePush();
      setRegistered(false);
      notify('Notifications are off for this device');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await sendTestNotification();
      notify('Test sent – it should arrive in a few seconds');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send the test', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <IonCard className="notif-card">
      <IonCardHeader>
        <IonCardTitle>{t('This device')}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {support === 'ios_needs_install' ? (
          <IosInstallSteps />
        ) : support === 'ios_too_old' ? (
          <p>
            {t(
              'Notifications need iOS 16.4 or newer. Please update your iPhone (Settings → General → Software Update).',
            )}
          </p>
        ) : support === 'not_configured' ? (
          <p>{t("Notifications aren't set up yet. Please ask the admin.")}</p>
        ) : support === 'unsupported' ? (
          <p>
            {t(
              "This browser can't show notifications. Use Chrome on Android, or Safari on iPhone after “Add to Home Screen”.",
            )}
          </p>
        ) : permission === null ? (
          <IonSpinner name="dots" />
        ) : permission === 'denied' ? (
          <>
            <p>{t('Notifications are blocked for FitCoach on this device.')}</p>
            <p className="notif-muted">
              {support === 'android'
                ? t(
                    'Open Settings → Apps → FitCoach → Notifications and turn them on, then come back.',
                  )
                : t(
                    'Open Settings → Notifications → FitCoach (iPhone) or the site settings in your browser and allow notifications.',
                  )}
            </p>
            <IonButton fill="clear" onClick={refresh}>
              {t("I've changed it")}
            </IonButton>
          </>
        ) : permission === 'granted' && registered ? (
          <>
            <p>{t('✅ Notifications are on for this device.')}</p>
            <IonButton expand="block" disabled={busy} onClick={() => void test()}>
              {t('Send test notification')}
            </IonButton>
            <IonButton
              expand="block"
              fill="clear"
              color="medium"
              disabled={busy}
              onClick={() => void turnOff()}
            >
              {t('Turn off on this device')}
            </IonButton>
          </>
        ) : (
          <>
            <p>{t("Get a gentle reminder when it's time to log a meal or do your workout.")}</p>
            <IonButton expand="block" size="large" disabled={busy} onClick={() => void turnOn()}>
              {busy ? t('Turning on…') : t('Turn on notifications')}
            </IonButton>
          </>
        )}
        {support === 'android' && <BatteryTips />}
      </IonCardContent>
    </IonCard>
  );
}

function BatteryTips() {
  const t = useT();
  return (
    <details className="notif-tips">
      <summary>{t('Not getting reminders? (Xiaomi, Oppo, Vivo, Realme, OnePlus)')}</summary>
      <p>{t('Some phones stop apps in the background to save battery. To fix it:')}</p>
      <ol className="notif-steps">
        <li>
          {t('Long-press the FitCoach icon →')} <strong>{t('App info')}</strong>.
        </li>
        <li>
          <strong>{t('Battery')}</strong> {t('(or Battery saver) → choose')}{' '}
          <strong>{t('Unrestricted')}</strong> {t('/ No restrictions.')}
        </li>
        <li>
          {t('On Xiaomi also turn on')} <strong>{t('Autostart')}</strong> {t('in App info.')}
        </li>
      </ol>
    </details>
  );
}

function RemindersCard({ clientId }: { clientId: string }) {
  const t = useT();
  const settings = useReminderSettings(clientId);
  return (
    <IonCard className="notif-card">
      <IonCardHeader>
        <IonCardTitle>{t('Reminders')}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {settings.isPending || !settings.data ? (
          <IonSpinner name="dots" />
        ) : (
          <ReminderForm
            key={settings.data.updated_at || 'defaults'}
            clientId={clientId}
            initial={settings.data}
            mode="client"
          />
        )}
      </IonCardContent>
    </IonCard>
  );
}
