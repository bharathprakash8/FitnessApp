import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { formatWhen, timeZoneLabel, zoneAbbr } from '../../lib/timezones';
import { useAuth } from '../auth/useAuth';
import { sessionEnded, useClientSessions, type ClientSession } from './api';
import './sessions.css';

const STATUS_TEXT = { invited: 'Not marked', present: 'Present ✅', missed: 'Missed' } as const;

/** Client → Me → My sessions: upcoming (with Join) and past (with attendance). */
export function MySessionsPage() {
  const { profile } = useAuth();
  const sessions = useClientSessions(profile?.id);
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const all = sessions.data ?? [];
  const upcoming = all.filter((s) => s.status === 'scheduled' && !sessionEnded(s));
  const past = all
    .filter((s) => s.status === 'scheduled' && sessionEnded(s))
    .reverse()
    .slice(0, 50);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>My sessions</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="sessions-page">
          <p className="sessions-note" style={{ marginTop: 0 }}>
            Times are shown in your time zone: {timeZoneLabel(tz)}. You can change it on the Me
            page.
          </p>
          {sessions.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : all.length === 0 ? (
            <IonText color="medium">
              <p className="ion-text-center">
                No sessions yet. Your trainer will schedule them here.
              </p>
            </IonText>
          ) : (
            <>
              <IonList inset style={{ margin: '12px 0' }}>
                <IonListHeader>
                  <IonLabel>Upcoming</IonLabel>
                </IonListHeader>
                {upcoming.length === 0 && (
                  <IonItem lines="none">
                    <IonLabel color="medium">Nothing scheduled.</IonLabel>
                  </IonItem>
                )}
                {upcoming.map((s) => (
                  <Row key={s.id} s={s} tz={tz} />
                ))}
              </IonList>
              {past.length > 0 && (
                <IonList inset style={{ margin: '12px 0' }}>
                  <IonListHeader>
                    <IonLabel>Past</IonLabel>
                  </IonListHeader>
                  {past.map((s) => (
                    <Row key={s.id} s={s} tz={tz} past />
                  ))}
                </IonList>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Row({ s, tz, past = false }: { s: ClientSession; tz: string; past?: boolean }) {
  return (
    <IonItem>
      <IonLabel>
        <h3>{s.title}</h3>
        <p>
          {formatWhen(s.starts_at, tz)} {zoneAbbr(s.starts_at, tz)} · {s.duration_min} min ·{' '}
          {s.type === 'online' ? 'online' : (s.location ?? 'in person')}
        </p>
        {past && <p>{STATUS_TEXT[s.my_status]}</p>}
      </IonLabel>
      {!past && s.type === 'online' && s.meet_url && (
        <IonButton slot="end" size="small" href={s.meet_url} target="_blank" rel="noopener">
          Join
        </IonButton>
      )}
    </IonItem>
  );
}
