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
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import {
  DEFAULT_REMINDERS,
  useReminderSettings,
  useSaveReminderSettings,
  type ReminderSettings,
} from './api';
import {
  disablePush,
  enablePush,
  isThisDeviceRegistered,
  pushPermission,
  pushSupport,
  sendTestNotification,
  type PushPermission,
} from './push';
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
          {profile?.role === 'client' && <RemindersCard clientId={profile.id} />}
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

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Evening snack' },
  { key: 'dinner', label: 'Dinner' },
] as const;

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

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
          />
        )}
      </IonCardContent>
    </IonCard>
  );
}

function ReminderForm({ clientId, initial }: { clientId: string; initial: ReminderSettings }) {
  const save = useSaveReminderSettings(clientId);
  const [toast] = useIonToast();
  const [s, setS] = useState({
    ...initial,
    breakfast_time: hhmm(initial.breakfast_time),
    lunch_time: hhmm(initial.lunch_time),
    snack_time: hhmm(initial.snack_time),
    dinner_time: hhmm(initial.dinner_time),
    workout_reminder_time: hhmm(initial.workout_reminder_time),
  });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  async function submit() {
    try {
      await save.mutateAsync({
        enabled: s.enabled,
        breakfast_on: s.breakfast_on,
        breakfast_time: s.breakfast_time || DEFAULT_REMINDERS.breakfast_time,
        lunch_on: s.lunch_on,
        lunch_time: s.lunch_time || DEFAULT_REMINDERS.lunch_time,
        snack_on: s.snack_on,
        snack_time: s.snack_time || DEFAULT_REMINDERS.snack_time,
        dinner_on: s.dinner_on,
        dinner_time: s.dinner_time || DEFAULT_REMINDERS.dinner_time,
        workout_reminder_time: s.workout_reminder_time || null,
      });
      void toast({ message: 'Reminders saved', duration: 1500, position: 'top' });
    } catch {
      void toast({ message: 'Could not save', duration: 2500, color: 'danger', position: 'top' });
    }
  }

  return (
    <>
      <IonList lines="full">
        <IonItem>
          <IonToggle checked={s.enabled} onIonChange={(e) => set('enabled', e.detail.checked)}>
            <strong>All reminders</strong>
          </IonToggle>
        </IonItem>
        {MEALS.map((m) => (
          <IonItem key={m.key} disabled={!s.enabled}>
            <IonToggle
              slot="start"
              aria-label={m.label}
              checked={s[`${m.key}_on`]}
              onIonChange={(e) => set(`${m.key}_on`, e.detail.checked)}
            />
            <IonLabel>{m.label}</IonLabel>
            <IonInput
              slot="end"
              className="notif-time"
              type="time"
              aria-label={`${m.label} time`}
              disabled={!s[`${m.key}_on`]}
              value={s[`${m.key}_time`]}
              onIonInput={(e) => set(`${m.key}_time`, String(e.detail.value ?? ''))}
            />
          </IonItem>
        ))}
        <IonItem disabled={!s.enabled}>
          <IonToggle
            slot="start"
            aria-label="Workout reminder"
            checked={Boolean(s.workout_reminder_time)}
            onIonChange={(e) => set('workout_reminder_time', e.detail.checked ? '18:00' : '')}
          />
          <IonLabel>Workout</IonLabel>
          <IonInput
            slot="end"
            className="notif-time"
            type="time"
            aria-label="Workout reminder time"
            disabled={!s.workout_reminder_time}
            value={s.workout_reminder_time}
            onIonInput={(e) => set('workout_reminder_time', String(e.detail.value ?? ''))}
          />
        </IonItem>
      </IonList>
      <IonText color="medium">
        <p className="notif-muted">
          A reminder is sent only if you haven't logged that meal (or today's workout) yet.
        </p>
      </IonText>
      <IonButton expand="block" disabled={save.isPending} onClick={() => void submit()}>
        {save.isPending ? 'Saving…' : 'Save reminders'}
      </IonButton>
    </>
  );
}
