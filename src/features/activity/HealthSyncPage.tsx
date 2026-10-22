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
  IonText,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { HEALTH_CONNECT_PLAY_URL, IPHONE_SHORTCUT_URL } from '../../config';
import { isAndroidApp } from '../../lib/platform';
import { supabase } from '../../lib/supabase';
import { profileKey } from '../auth/api';
import { useAuth } from '../auth/useAuth';
import {
  connectHealthConnect,
  healthConnectState,
  lastHealthSync,
  openHealthConnectSettings,
  errorText,
  syncHealthConnect,
  type HcState,
} from './healthConnect';
import { LastSync } from './LastSync';
import { HealthAccessHelp } from './HealthAccessHelp';
import { rememberConnect, useIphoneSyncStuck } from './syncStuck';
import { SHORTCUT_RUN_URL, shortcutConnectUrl } from './shortcut';
import './activity.css';

/** Client: connect Health Connect (Android app) or set up the iPhone Shortcut. */
export function HealthSyncPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>Health sync</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p>
            FitCoach reads <strong>calories burnt, steps and sleep</strong> from your phone so your
            trainer can see your full picture. It never writes to your health data.
          </p>
          {isAndroidApp ? <AndroidSection /> : <IPhoneSection />}
          <p className="burn-muted">
            No phone data? You can always type your active calories on the Today screen.{' '}
            <a href="/privacy.html" target="_blank" rel="noopener">
              Privacy policy
            </a>
          </p>
        </div>
      </IonContent>
    </IonPage>
  );
}

function AndroidSection() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [toast] = useIonToast();
  const [state, setState] = useState<HcState | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => void healthConnectState().then(setState), []);

  useEffect(refresh, [refresh]);

  // The real reason a sync failed, shown on the page (so it can be reported).
  const [syncError, setSyncError] = useState<string | null>(null);
  const failed = (e: unknown) => {
    const text = navigator.onLine ? errorText(e) : 'No internet connection';
    setSyncError(text);
    void toast({
      message: `Sync failed: ${text}`,
      duration: 4000,
      color: 'danger',
      position: 'top',
    });
  };

  const [noData, setNoData] = useState(false);
  function reportDays(days: number) {
    setNoData(days === 0);
    void toast({
      message:
        days === 0
          ? 'Connected – but Health Connect has no activity yet (see below)'
          : `${days} day${days === 1 ? '' : 's'} synced`,
      duration: days === 0 ? 3500 : 1500,
      position: 'top',
    });
  }

  async function connect() {
    setBusy(true);
    setSyncError(null);
    try {
      const ok = await connectHealthConnect();
      if (ok && profile) {
        const days = await syncHealthConnect(profile.id, profile.timezone);
        await qc.invalidateQueries({ queryKey: ['activity'] });
        reportDays(days);
      } else {
        void toast({
          message: 'FitCoach needs at least "Active calories burned" to show your burn.',
          duration: 3500,
          color: 'warning',
          position: 'top',
        });
      }
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function syncNow() {
    if (!profile) return;
    setBusy(true);
    setSyncError(null);
    try {
      const days = await syncHealthConnect(profile.id, profile.timezone);
      await qc.invalidateQueries({ queryKey: ['activity'] });
      reportDays(days);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }

  const last = lastHealthSync();

  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardTitle>Health Connect</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {state === null ? (
          <IonSpinner name="dots" />
        ) : state === 'not_installed' ? (
          <>
            <p>Health Connect isn't installed on this phone. Install it, then come back here.</p>
            <IonButton expand="block" href={HEALTH_CONNECT_PLAY_URL} target="_blank">
              Get Health Connect
            </IonButton>
            <IonButton expand="block" fill="clear" onClick={refresh}>
              I've installed it
            </IonButton>
          </>
        ) : state === 'connected' ? (
          <>
            <p>
              ✅ Connected. FitCoach syncs the last 7 days each time you open the app.
              {last ? ` Last sync: ${last.toLocaleString('en-IN')}.` : ''}
            </p>
            <IonButton expand="block" disabled={busy} onClick={() => void syncNow()}>
              {busy ? 'Syncing…' : 'Sync now'}
            </IonButton>
            <IonButton expand="block" fill="clear" onClick={() => void openHealthConnectSettings()}>
              Manage permissions
            </IonButton>
          </>
        ) : (
          <>
            <p>
              Allow FitCoach to <strong>read</strong> active calories, total calories, steps, sleep
              and heart rate (only used to see when a watch was worn). Your fitness app or watch
              (e.g. Google Fit, Samsung Health, Fitbit) must also share its data with Health
              Connect.
            </p>
            <IonButton expand="block" disabled={busy} onClick={() => void connect()}>
              {busy ? 'Connecting…' : 'Connect Health Connect'}
            </IonButton>
          </>
        )}
        {noData && !syncError && (
          <IonText color="warning">
            <p className="health-error">
              <strong>No activity in Health Connect yet.</strong> Health Connect only stores data –
              an app has to record it. Install <strong>Google Fit</strong> (or your watch or band's
              app), turn on activity tracking and its <strong>Health Connect</strong> sharing, then
              tap Sync now. Until then FitCoach estimates your burn.
            </p>
          </IonText>
        )}
        {syncError && (
          <IonText color="danger">
            <p className="health-error">
              <strong>Sync failed:</strong> {syncError}
              <br />
              Check Manage permissions (allow all), then Sync now. If it keeps failing, send a
              screenshot of this message to your trainer.
            </p>
          </IonText>
        )}
      </IonCardContent>
    </IonCard>
  );
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function IPhoneSection() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasToken = Boolean(profile?.health_sync_token_hash);
  const stuck = useIphoneSyncStuck(profile?.id, hasToken);

  async function generate() {
    if (!profile) return;
    setBusy(true);
    try {
      const t = randomToken();
      const { error } = await supabase
        .from('profiles')
        .update({ health_sync_token_hash: await sha256Hex(t) })
        .eq('id', profile.id);
      if (error) throw error;
      setToken(t);
      rememberConnect();
      await qc.invalidateQueries({ queryKey: profileKey(profile.id) });
    } catch {
      void toast({
        message: 'Could not create a sync code',
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setBusy(false);
    }
  }

  function confirmNew() {
    if (!hasToken) return void generate();
    void alert({
      header: 'Connect again?',
      message:
        'This makes a new connection code; the old one stops working. Use it after changing phones or reinstalling the Shortcut.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Connect again', handler: () => void generate() },
      ],
    });
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      void toast({ message: `${what} copied`, duration: 1500, position: 'top' });
    } catch {
      void toast({
        message: 'Could not copy – select and copy it by hand',
        duration: 2500,
        position: 'top',
      });
    }
  }

  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardTitle>iPhone (Apple Health)</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {profile && <LastSync clientId={profile.id} />}
        {stuck && (
          <IonText color="warning">
            <p>
              <strong>Nothing has arrived from the Shortcut yet.</strong> Usually Health access is
              off – see the help under step 2.
            </p>
          </IonText>
        )}
        {hasToken && !token && (
          <IonButton expand="block" href={SHORTCUT_RUN_URL}>
            Sync now
          </IonButton>
        )}
        <p>
          An Apple Shortcut sends your Apple Health numbers (and, if you wear an Apple Watch, the
          hours you wore it) to FitCoach. Set it up once – about 2 minutes.
        </p>

        <ol className="health-steps">
          <li>
            <strong>Get the Shortcut.</strong> Tap the button, then <strong>Add Shortcut</strong>.
            If you already have an older “FitCoach Sync”, delete it first (press and hold → Delete).
            <IonButton
              expand="block"
              fill="outline"
              href={IPHONE_SHORTCUT_URL}
              target="_blank"
              rel="noopener"
            >
              Get “FitCoach Sync”
            </IonButton>
          </li>
          <li>
            <strong>Connect.</strong> Come back here and tap Connect, then{' '}
            <strong>Finish in Shortcuts</strong>. The first time, iPhone asks to allow Health data
            (tap <strong>Turn On All</strong> → <strong>Allow</strong>) and sending to FitCoach (tap{' '}
            <strong>Always Allow</strong>).
            {token ? (
              <>
                <IonButton expand="block" href={shortcutConnectUrl(token)}>
                  Finish in Shortcuts
                </IonButton>
                <details className="health-manual">
                  <summary>Shortcut didn’t open?</summary>
                  <p>
                    Copy this code, open the Shortcuts app, run “FitCoach Sync” and paste it when
                    asked.
                  </p>
                  <p className="health-code">{token}</p>
                  <IonButton size="small" fill="outline" onClick={() => void copy(token, 'Code')}>
                    Copy code
                  </IonButton>
                </details>
              </>
            ) : (
              <IonButton
                expand="block"
                fill={hasToken ? 'outline' : 'solid'}
                disabled={busy}
                onClick={confirmNew}
              >
                {hasToken ? 'Connect again' : 'Connect'}
              </IonButton>
            )}
            <HealthAccessHelp open={stuck} />
          </li>
          <li>
            <strong>Sync automatically.</strong> Apple doesn’t let apps do this step, so it takes a
            few taps, once: open Shortcuts → <strong>Automation</strong> → <strong>+</strong> →{' '}
            <strong>Time of Day</strong> → set <strong>10:00 PM</strong>, Daily →{' '}
            <strong>Run Immediately</strong> → Next → choose <strong>FitCoach Sync</strong>. Then do
            the same again for <strong>7:00 AM</strong> (it catches the end of the previous day).
            <IonButton expand="block" fill="outline" href="shortcuts://">
              Open Shortcuts
            </IonButton>
          </li>
        </ol>
      </IonCardContent>
    </IonCard>
  );
}
