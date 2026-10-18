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
import { ReminderForm } from './ReminderForm';
import { TrainerRemindersCard } from './TrainerRemindersCard';
import './notifications.css';

export function NotificationsPage() {
  const { profile } = useAuth();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>Notifications</IonTitle>
        </IonToolbar>
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
        <IonCardTitle>This device</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {support === 'ios_needs_install' ? (
          <IosInstallSteps />
        ) : support === 'ios_too_old' ? (
          <p>
            Notifications need iOS 16.4 or newer. Please update your iPhone (Settings → General →
            Software Update).
          </p>
        ) : support === 'not_configured' ? (
          <p>Notifications aren't set up yet. Please ask the admin.</p>
        ) : support === 'unsupported' ? (
          <p>
            This browser can't show notifications. Use Chrome on Android, or Safari on iPhone after
            “Add to Home Screen”.
          </p>
        ) : permission === null ? (
          <IonSpinner name="dots" />
        ) : permission === 'denied' ? (
          <>
            <p>Notifications are blocked for FitCoach on this device.</p>
            <p className="notif-muted">
              {support === 'android'
                ? 'Open Settings → Apps → FitCoach → Notifications and turn them on, then come back.'
                : 'Open Settings → Notifications → FitCoach (iPhone) or the site settings in your browser and allow notifications.'}
            </p>
            <IonButton fill="clear" onClick={refresh}>
              I've changed it
            </IonButton>
          </>
        ) : permission === 'granted' && registered ? (
          <>
            <p>✅ Notifications are on for this device.</p>
            <IonButton expand="block" disabled={busy} onClick={() => void test()}>
              Send test notification
            </IonButton>
            <IonButton
              expand="block"
              fill="clear"
              color="medium"
              disabled={busy}
              onClick={() => void turnOff()}
            >
              Turn off on this device
            </IonButton>
          </>
        ) : (
          <>
            <p>Get a gentle reminder when it's time to log a meal or do your workout.</p>
            <IonButton expand="block" size="large" disabled={busy} onClick={() => void turnOn()}>
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </IonButton>
          </>
        )}
        {support === 'android' && <BatteryTips />}
      </IonCardContent>
    </IonCard>
  );
}

function IosInstallSteps() {
  return (
    <>
      <p>
        On iPhone, notifications work only when FitCoach is added to your Home Screen (iOS 16.4 or
        newer):
      </p>
      <ol className="notif-steps">
        <li>
          Tap the <strong>Share</strong> button (square with an arrow) at the bottom of Safari.
        </li>
        <li>
          Scroll down and tap <strong>Add to Home Screen</strong> → <strong>Add</strong>.
        </li>
        <li>Open FitCoach from the new Home Screen icon and come back to Me → Notifications.</li>
      </ol>
    </>
  );
}

function BatteryTips() {
  return (
    <details className="notif-tips">
      <summary>Not getting reminders? (Xiaomi, Oppo, Vivo, Realme, OnePlus)</summary>
      <p>Some phones stop apps in the background to save battery. To fix it:</p>
      <ol className="notif-steps">
        <li>
          Long-press the FitCoach icon → <strong>App info</strong>.
        </li>
        <li>
          <strong>Battery</strong> (or Battery saver) → choose <strong>Unrestricted</strong> / No
          restrictions.
        </li>
        <li>
          On Xiaomi also turn on <strong>Autostart</strong> in App info.
        </li>
      </ol>
    </details>
  );
}

function RemindersCard({ clientId }: { clientId: string }) {
  const settings = useReminderSettings(clientId);
  return (
    <IonCard className="notif-card">
      <IonCardHeader>
        <IonCardTitle>Reminders</IonCardTitle>
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
