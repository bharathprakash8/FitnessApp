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
  syncHealthConnect,
  type HcState,
} from './healthConnect';
import './activity.css';

const SYNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-sync`;

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
        </IonToolbar>
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

  async function connect() {
    setBusy(true);
    try {
      const ok = await connectHealthConnect();
      if (ok && profile) {
        const days = await syncHealthConnect(profile.id, profile.timezone);
        await qc.invalidateQueries({ queryKey: ['activity'] });
        void toast({
          message: `Connected – ${days} day(s) synced`,
          duration: 2000,
          position: 'top',
        });
      } else {
        void toast({
          message: 'FitCoach needs at least "Active calories burned" to show your burn.',
          duration: 3500,
          color: 'warning',
          position: 'top',
        });
      }
    } catch {
      void toast({
        message: 'Could not connect to Health Connect',
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function syncNow() {
    if (!profile) return;
    setBusy(true);
    try {
      const days = await syncHealthConnect(profile.id, profile.timezone);
      await qc.invalidateQueries({ queryKey: ['activity'] });
      void toast({ message: `${days} day(s) synced`, duration: 1500, position: 'top' });
    } catch {
      void toast({
        message: 'Sync failed – check your internet',
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
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
              Allow FitCoach to <strong>read</strong> active calories, total calories, steps and
              sleep. Your fitness app or watch (e.g. Google Fit, Samsung Health, Fitbit) must also
              share its data with Health Connect.
            </p>
            <IonButton expand="block" disabled={busy} onClick={() => void connect()}>
              {busy ? 'Connecting…' : 'Connect Health Connect'}
            </IonButton>
          </>
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
      header: 'Create a new sync code?',
      message: 'The old code stops working. You will need to paste the new one into your Shortcut.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Create new code', handler: () => void generate() },
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
        <p>
          An Apple Shortcut sends your Apple Health numbers to FitCoach every night. You set it up
          once (about 3 minutes).
        </p>
        {token ? (
          <>
            <IonText color="warning">
              <p>
                <strong>Copy your sync code now – it is shown only once.</strong>
              </p>
            </IonText>
            <p className="health-code">{token}</p>
            <IonButton expand="block" onClick={() => void copy(token, 'Sync code')}>
              Copy sync code
            </IonButton>
            <p style={{ marginTop: 12 }}>Sync address:</p>
            <p className="health-code">{SYNC_URL}</p>
            <IonButton expand="block" fill="outline" onClick={() => void copy(SYNC_URL, 'Address')}>
              Copy address
            </IonButton>
          </>
        ) : (
          <IonButton expand="block" disabled={busy} onClick={confirmNew}>
            {hasToken ? 'Create a new sync code' : 'Set up iPhone sync'}
          </IonButton>
        )}
        {hasToken && !token && (
          <p className="burn-muted">
            Sync is set up. Create a new code only if you changed phones or lost the Shortcut.
          </p>
        )}
        <ol className="health-steps">
          <li>
            {IPHONE_SHORTCUT_URL ? (
              <a href={IPHONE_SHORTCUT_URL} target="_blank" rel="noopener">
                Install the “FitCoach Sync” shortcut
              </a>
            ) : (
              'Install the “FitCoach Sync” shortcut (ask your trainer for the link)'
            )}
            . When it asks, paste your <strong>sync code</strong> from above.
          </li>
          <li>Run it once by hand. Allow it to read Health data when iPhone asks.</li>
          <li>
            Open <strong>Shortcuts → Automation → +</strong> → <strong>Time of Day</strong> → 22:00,
            Daily → <strong>Run Immediately</strong> → choose “FitCoach Sync”.
          </li>
        </ol>
      </IonCardContent>
    </IonCard>
  );
}
