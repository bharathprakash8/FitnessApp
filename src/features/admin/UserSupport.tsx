import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonSpinner,
  IonText,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';

import { startImpersonation } from '../../lib/impersonation';
import { homePathFor } from '../auth/roles';
import type { AdminUser } from './api';
import { ProblemsTab } from './ProblemsTab';
import { impersonationTokens, useDiagnostics } from './supportApi';
import './admin.css';

const when = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(iso))
    : '–';

/** More than a day and a half ago (or never). */
const isOld = (iso: string | undefined) => !iso || Date.now() - Date.parse(iso) > 36 * 3600_000;

const SOURCES: Record<string, string> = {
  apple_shortcut: 'iPhone Shortcut',
  health_connect: 'Health Connect',
};

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="diag-row">
      <span>{label}</span>
      <strong className={warn ? 'diag-warn' : undefined}>{value}</strong>
    </div>
  );
}

/**
 * Admin → user: a quick check-up (which app, sync, notifications, AI use, problems), the
 * person's problem log and "Log in as" to see and use the app exactly as they do.
 */
export function UserSupport({ user, all }: { user: AdminUser; all: AdminUser[] }) {
  const diag = useDiagnostics(user.id);
  const [toast] = useIonToast();
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const d = diag.data;
  const name = user.full_name || user.email;

  async function logInAs() {
    setBusy(true);
    try {
      const tokens = await impersonationTokens(user.id);
      await startImpersonation(tokens, name);
      // Full reload: every screen starts fresh as this person.
      window.location.href = homePathFor({
        role: user.role,
        onboarded_at: d?.onboarded ? 'yes' : null,
      });
    } catch (e) {
      setBusy(false);
      void toast({
        message: e instanceof Error ? e.message : 'Could not log in as this user',
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
    }
  }

  const tracksSelf = user.role === 'client' || user.role === 'trainer';
  const syncOld = isOld(d?.last_sync?.at);
  return (
    <IonCard className="trainer-card">
      <IonCardHeader>
        <IonCardSubtitle>Support</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        {user.role !== 'admin' && user.is_active && (
          <IonButton expand="block" disabled={busy} onClick={() => void logInAs()}>
            {busy ? 'Opening…' : `Log in as ${name}`}
          </IonButton>
        )}
        {diag.isPending ? (
          <IonSpinner name="dots" />
        ) : !d ? (
          <IonText color="medium">
            <p>No details.</p>
          </IonText>
        ) : (
          <div className="diag">
            <Row label="Last login" value={when(d.last_sign_in_at)} />
            <Row label="Last opened the app" value={when(d.last_seen_at)} />
            <Row label="App" value={`${d.app_version ?? '–'} · ${d.platform ?? '–'}`} />
            <Row
              label="Notifications"
              value={
                d.push_devices.length
                  ? d.push_devices.map((p) => `${p.platform} (${when(p.last_seen_at)})`).join(', ')
                  : 'not turned on'
              }
              warn={!d.push_devices.length}
            />
            {tracksSelf && (
              <>
                <Row
                  label="Last health sync"
                  value={
                    d.last_sync
                      ? `${SOURCES[d.last_sync.source] ?? d.last_sync.source}, ${when(d.last_sync.at)}`
                      : 'never'
                  }
                  warn={syncOld}
                />
                <Row
                  label="Synced days (7)"
                  value={`${d.synced_days_7} · watch on ${d.watch_days_7}`}
                />
                <Row label="iPhone Shortcut code" value={d.iphone_code_set ? 'set' : 'not set'} />
                <Row
                  label="Food"
                  value={`${d.meals_today} today · last ${d.last_meal_on ?? 'never'}`}
                />
                <Row label="Last workout" value={d.last_workout_on ?? 'never'} />
                <Row
                  label="AI today"
                  value={
                    Object.entries(d.ai_today)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(', ') || 'none'
                  }
                />
              </>
            )}
            <Row label="Problems (7 days)" value={String(d.errors_7d)} warn={d.errors_7d > 0} />
            <p className="diag-device">{d.device ?? ''}</p>
            {d.admin_logins.length > 0 && (
              <p className="diag-device">
                Your log-ins as them: {d.admin_logins.map((l) => when(l.at)).join(', ')}
              </p>
            )}
          </div>
        )}
        <IonButton fill="outline" size="small" onClick={() => setShowProblems((s) => !s)}>
          {showProblems ? 'Hide problems' : 'Show their problems'}
        </IonButton>
        {showProblems && <ProblemsTab users={all} userId={user.id} />}
      </IonCardContent>
    </IonCard>
  );
}
