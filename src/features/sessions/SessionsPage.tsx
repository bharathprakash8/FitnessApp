import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import { add, logoGoogle, videocam, walk } from 'ionicons/icons';
import { useEffect, useState } from 'react';

import { AppTabBar } from '../../components/AppTabBar';
import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { TRAINER_TABS } from '../../components/tabs';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { formatWhen } from '../../lib/timezones';
import { useAuth } from '../auth/useAuth';
import {
  connectGoogle,
  daysAgoIso,
  sessionEnded,
  useDisconnectGoogle,
  useGoogleStatus,
  useTrainerSessions,
  type SessionWithPeople,
} from './api';
import './sessions.css';

/** Trainer → Sessions: Google connection, upcoming sessions and recent ones to mark. */
export function SessionsPage() {
  const { profile } = useAuth();
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  // Look back 60 days for attendance; fixed for this visit so the query key is stable.
  const [since] = useState(() => daysAgoIso(60));
  const sessions = useTrainerSessions(profile?.id, since);

  const all = sessions.data ?? [];
  const upcoming = all.filter((s) => s.status === 'scheduled' && !sessionEnded(s));
  const past = all.filter((s) => sessionEnded(s) || s.status === 'cancelled').reverse();
  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Sessions</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as typeof tab)}>
            <IonSegmentButton value="upcoming">
              <IonLabel>Upcoming ({upcoming.length})</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="past">
              <IonLabel>Past</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="sessions-page">
          <GoogleCard />
          {sessions.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : list.length === 0 ? (
            <IonText color="medium">
              <p className="ion-text-center">
                {tab === 'upcoming'
                  ? 'No upcoming sessions. Tap + to schedule one.'
                  : 'No sessions in the last 60 days.'}
              </p>
            </IonText>
          ) : (
            <IonList inset style={{ margin: '12px 0 80px' }}>
              {tab === 'past' && (
                <IonListHeader>
                  <IonLabel>Last 60 days – tap to mark attendance</IonLabel>
                </IonListHeader>
              )}
              {list.map((s) => (
                <SessionRow key={s.id} s={s} tz={tz} />
              ))}
            </IonList>
          )}
        </div>
        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          <IonFabButton routerLink="/trainer/sessions/new" aria-label="Schedule a session">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={TRAINER_TABS} selected="sessions" />
      </IonFooter>
    </IonPage>
  );
}

function SessionRow({ s, tz }: { s: SessionWithPeople; tz: string }) {
  const names = s.session_attendees
    .map((a) => a.profiles?.full_name || a.profiles?.email || '')
    .filter(Boolean);
  const unmarked =
    s.status === 'scheduled' &&
    sessionEnded(s) &&
    s.session_attendees.some((a) => a.status === 'invited');
  return (
    <IonItem routerLink={`/trainer/sessions/${s.id}`} detail>
      <IonIcon slot="start" icon={s.type === 'online' ? videocam : walk} color="primary" />
      <IonLabel>
        <h3>
          {s.title}
          {s.series_id && <span className="sessions-tag">Repeats</span>}
          {s.status === 'cancelled' && <span className="sessions-tag cancelled">Cancelled</span>}
          {unmarked && <span className="sessions-tag todo">Mark attendance</span>}
        </h3>
        <p>
          {formatWhen(s.starts_at, tz)} · {s.duration_min} min
        </p>
        <p>{names.join(', ') || 'No clients'}</p>
      </IonLabel>
    </IonItem>
  );
}

/** Connect / disconnect the trainer's own Google account. */
function GoogleCard() {
  const status = useGoogleStatus();
  const disconnect = useDisconnectGoogle();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [opening, setOpening] = useState(false);
  const { refetch } = status;

  // Coming back from Google's page: check the connection again.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refetch();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  if (status.isPending) return null;
  if (status.isError) {
    return (
      <IonText color="medium">
        <p className="sessions-note">Couldn't check your Google connection. Tap ↻ to retry.</p>
      </IonText>
    );
  }
  const s = status.data;
  if (!s.configured) {
    return (
      <IonCard className="sessions-card">
        <IonCardContent>
          Google Calendar isn't set up for FitCoach yet (the admin does this once). Until then you
          can paste your own Meet link when you schedule an online session.
        </IonCardContent>
      </IonCard>
    );
  }
  if (s.connected) {
    return (
      <p className="sessions-note">
        <IonIcon icon={logoGoogle} /> Invites and Meet links come from <strong>{s.email}</strong>.{' '}
        <button
          type="button"
          className="sessions-link"
          onClick={() =>
            void alert({
              header: 'Disconnect Google?',
              message:
                'Existing calendar events stay in your calendar. New sessions will not send invites until you connect again.',
              buttons: [
                { text: 'Cancel', role: 'cancel' },
                {
                  text: 'Disconnect',
                  role: 'destructive',
                  handler: () => disconnect.mutate(),
                },
              ],
            })
          }
        >
          Disconnect
        </button>
      </p>
    );
  }
  return (
    <IonCard className="sessions-card">
      <IonCardContent>
        <p style={{ marginTop: 0 }}>
          <strong>Connect your Google account</strong> so FitCoach can send calendar invites with a
          Google Meet link from your Gmail.
        </p>
        <p className="sessions-note">
          Google will show “Google hasn't verified this app” – tap <strong>Advanced</strong> →{' '}
          <strong>Go to FitCoach</strong>, tick the calendar box and tap <strong>Continue</strong>.
          Then come back here.
        </p>
        <IonButton
          expand="block"
          disabled={opening}
          onClick={() => {
            setOpening(true);
            connectGoogle()
              .catch((err: Error) =>
                toast({ message: err.message, duration: 3000, color: 'danger', position: 'top' }),
              )
              .finally(() => setOpening(false));
          }}
        >
          <IonIcon slot="start" icon={logoGoogle} />
          {opening ? 'Opening Google…' : 'Connect Google Calendar'}
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
}
