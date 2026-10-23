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
import { logError } from '../../lib/errorLog';
import { impersonatedName, isImpersonating } from '../../lib/impersonation';
import { HealthAccessHelp } from './HealthAccessHelp';
import { rememberConnect, useIphoneSyncStuck } from './syncStuck';
import { SHORTCUT_RUN_URL, shortcutConnectUrl } from './shortcut';
import './activity.css';
import { useT } from '../../i18n/i18n';

/** Client: connect Health Connect (Android app) or set up the iPhone Shortcut. */
export function HealthSyncPage() {
  const t = useT();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>{t('Health sync')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p>
            {t('FitCoach reads')} <strong>{t('calories burnt, steps and sleep')}</strong>{' '}
            {t(
              'from your phone so your trainer can see your full picture. It never writes to your health data.',
            )}
          </p>
          {isImpersonating() ? (
            <p className="health-error">
              {t("You're logged in as")} {impersonatedName()}
              {t(
                ". Health sync uses the phone's own health data, so connecting or syncing is switched off here – it would send your data to their account.",
              )}
            </p>
          ) : isAndroidApp ? (
            <AndroidSection />
          ) : (
            <IPhoneSection />
          )}
          <p className="burn-muted">
            {t('No phone data? You can always type your active calories on the Today screen.')}{' '}
            <a href="/privacy.html" target="_blank" rel="noopener">
              {t('Privacy policy')}
            </a>
          </p>
        </div>
      </IonContent>
    </IonPage>
  );
}

function AndroidSection() {
  const t = useT();
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
    void logError('sync', e, { where: 'health-connect' });
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
          message: t('FitCoach needs at least "Active calories burned" to show your burn.'),
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
        <IonCardTitle>{t('Health Connect')}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {state === null ? (
          <IonSpinner name="dots" />
        ) : state === 'not_installed' ? (
          <>
            <p>
              {t("Health Connect isn't installed on this phone. Install it, then come back here.")}
            </p>
            <IonButton expand="block" href={HEALTH_CONNECT_PLAY_URL} target="_blank">
              {t('Get Health Connect')}
            </IonButton>
            <IonButton expand="block" fill="clear" onClick={refresh}>
              {t("I've installed it")}
            </IonButton>
          </>
        ) : state === 'connected' ? (
          <>
            <p>
              {t('✅ Connected. FitCoach syncs the last 7 days each time you open the app.')}
              {last ? ` Last sync: ${last.toLocaleString('en-IN')}.` : ''}
            </p>
            <IonButton expand="block" disabled={busy} onClick={() => void syncNow()}>
              {busy ? t('Syncing…') : t('Sync now')}
            </IonButton>
            <IonButton expand="block" fill="clear" onClick={() => void openHealthConnectSettings()}>
              {t('Manage permissions')}
            </IonButton>
          </>
        ) : (
          <>
            <p>
              {t('Allow FitCoach to')} <strong>{t('read')}</strong>{' '}
              {t(
                'active calories, total calories, steps, sleep and heart rate (only used to see when a watch was worn). Your fitness app or watch (e.g. Google Fit, Samsung Health, Fitbit) must also share its data with Health Connect.',
              )}
            </p>
            <IonButton expand="block" disabled={busy} onClick={() => void connect()}>
              {busy ? t('Connecting…') : t('Connect Health Connect')}
            </IonButton>
          </>
        )}
        {noData && !syncError && (
          <IonText color="warning">
            <p className="health-error">
              <strong>{t('No activity in Health Connect yet.')}</strong>{' '}
              {t('Health Connect only stores data – an app has to record it. Install')}{' '}
              <strong>{t('Google Fit')}</strong>{' '}
              {t("(or your watch or band's app), turn on activity tracking and its")}{' '}
              <strong>{t('Health Connect')}</strong>{' '}
              {t('sharing, then tap Sync now. Until then FitCoach estimates your burn.')}
            </p>
          </IonText>
        )}
        {syncError && (
          <IonButton size="small" fill="outline" routerLink="/me/report">
            {t('Report a problem')}
          </IonButton>
        )}
        {syncError && (
          <IonText color="danger">
            <p className="health-error">
              <strong>{t('Sync failed:')}</strong> {syncError}
              <br />
              {t(
                'Check Manage permissions (allow all), then Sync now. If it keeps failing, tap Report a problem below.',
              )}
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
  const tx = useT();
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
        message: tx('Could not create a sync code'),
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
      header: tx('Connect again?'),
      message: tx(
        'This makes a new connection code; the old one stops working. Use it after changing phones or reinstalling the Shortcut.',
      ),
      buttons: [
        { text: tx('Cancel'), role: 'cancel' },
        { text: tx('Connect again'), handler: () => void generate() },
      ],
    });
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      void toast({ message: `${what} copied`, duration: 1500, position: 'top' });
    } catch {
      void toast({
        message: tx('Could not copy – select and copy it by hand'),
        duration: 2500,
        position: 'top',
      });
    }
  }

  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardTitle>{tx('iPhone (Apple Health)')}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {profile && <LastSync clientId={profile.id} />}
        {stuck && (
          <IonText color="warning">
            <p>
              <strong>{tx('Nothing has arrived from the Shortcut yet.')}</strong>{' '}
              {tx('Usually Health access is off – see the help under step 2.')}
            </p>
          </IonText>
        )}
        {hasToken && !token && (
          <IonButton expand="block" href={SHORTCUT_RUN_URL}>
            {tx('Sync now')}
          </IonButton>
        )}
        <p>
          {tx(
            'An Apple Shortcut sends your Apple Health numbers (and, if you wear an Apple Watch, the hours you wore it) to FitCoach. Set it up once – about 2 minutes.',
          )}
        </p>

        <ol className="health-steps">
          <li>
            <strong>{tx('Get the Shortcut.')}</strong> {tx('Tap the button, then')}{' '}
            <strong>{tx('Add Shortcut')}</strong>
            {tx(
              '. If you already have an older “FitCoach Sync”, delete it first (press and hold → Delete).',
            )}
            <IonButton
              expand="block"
              fill="outline"
              href={IPHONE_SHORTCUT_URL}
              target="_blank"
              rel="noopener"
            >
              {tx('Get “FitCoach Sync”')}
            </IonButton>
          </li>
          <li>
            <strong>{tx('Connect.')}</strong> {tx('Come back here and tap Connect, then')}{' '}
            <strong>{tx('Finish in Shortcuts')}</strong>
            {tx('. The first time, iPhone asks to allow Health data (tap')}{' '}
            <strong>{tx('Turn On All')}</strong> → <strong>{tx('Allow')}</strong>
            {tx(') and sending to FitCoach (tap')} <strong>{tx('Always Allow')}</strong>).
            {token ? (
              <>
                <IonButton expand="block" href={shortcutConnectUrl(token)}>
                  {tx('Finish in Shortcuts')}
                </IonButton>
                <details className="health-manual">
                  <summary>{tx('Shortcut didn’t open?')}</summary>
                  <p>
                    {tx(
                      'Copy this code, open the Shortcuts app, run “FitCoach Sync” and paste it when asked.',
                    )}
                  </p>
                  <p className="health-code">{token}</p>
                  <IonButton size="small" fill="outline" onClick={() => void copy(token, 'Code')}>
                    {tx('Copy code')}
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
                {hasToken ? tx('Connect again') : tx('Connect')}
              </IonButton>
            )}
            <HealthAccessHelp open={stuck} />
          </li>
          <li>
            <strong>{tx('Sync automatically.')}</strong>{' '}
            {tx(
              'Apple doesn’t let apps do this step, so it takes a few taps, once: open Shortcuts →',
            )}{' '}
            <strong>{tx('Automation')}</strong> → <strong>+</strong> →{' '}
            <strong>{tx('Time of Day')}</strong> {tx('→ set')} <strong>{tx('10:00 PM')}</strong>
            {tx(', Daily →')} <strong>{tx('Run Immediately')}</strong> {tx('→ Next → choose')}{' '}
            <strong>{tx('FitCoach Sync')}</strong>
            {tx('. Then do the same again for')} <strong>{tx('7:00 AM')}</strong>{' '}
            {tx('(it catches the end of the previous day).')}
            <IonButton expand="block" fill="outline" href="shortcuts://">
              {tx('Open Shortcuts')}
            </IonButton>
          </li>
        </ol>
      </IonCardContent>
    </IonCard>
  );
}
