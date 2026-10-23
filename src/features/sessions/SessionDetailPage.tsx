import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
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
  useIonActionSheet,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { videocam } from 'ionicons/icons';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { formatWhen, timeZoneLabel, zoneAbbr } from '../../lib/timezones';
import { useAuth } from '../auth/useAuth';
import {
  SessionError,
  sessionStarted,
  useCancelSession,
  useMarkAttendance,
  useSession,
  type AttendeeStatus,
  type SessionWithPeople,
} from './api';
import './sessions.css';
import { useT } from '../../i18n/i18n';

/** Trainer → one session: details, Join, attendance, edit and cancel. */
export function SessionDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const session = useSession(id);
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/trainer/sessions" />
          </IonButtons>
          <IonTitle>{session.data?.title ?? t('Session')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="sessions-page">
          {session.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !session.data ? (
            <IonText color="medium">
              <p className="ion-text-center">{t('This session no longer exists.')}</p>
            </IonText>
          ) : (
            <Detail s={session.data} />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Detail({ s }: { s: SessionWithPeople }) {
  const t = useT();
  const { profile } = useAuth();
  const myTz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const router = useIonRouter();
  const [sheet] = useIonActionSheet();
  const [toast] = useIonToast();
  const cancel = useCancelSession();
  const mark = useMarkAttendance(s.id);
  const started = sessionStarted(s);
  const cancelled = s.status === 'cancelled';

  function edit() {
    if (!s.series_id) return router.push(`/trainer/sessions/${s.id}/edit`);
    void sheet({
      header: t('This session repeats'),
      buttons: [
        {
          text: t('Change only this session'),
          handler: () => router.push(`/trainer/sessions/${s.id}/edit?scope=one`),
        },
        {
          text: t('Change this and later sessions'),
          handler: () => router.push(`/trainer/sessions/${s.id}/edit?scope=series`),
        },
        { text: t('Back'), role: 'cancel' },
      ],
    });
  }

  function doCancel(scope: 'one' | 'series') {
    cancel.mutate(
      { session_id: s.id, scope },
      {
        onSuccess: (r) => {
          void toast({
            message: r.cancelled > 1 ? `${r.cancelled} sessions cancelled` : 'Session cancelled',
            duration: 2000,
            position: 'top',
          });
          router.push('/trainer/sessions', 'back');
        },
        onError: (err) =>
          void toast({
            message: err instanceof SessionError ? err.message : 'Could not cancel. Try again.',
            duration: 3500,
            color: 'danger',
            position: 'top',
          }),
      },
    );
  }

  function askCancel() {
    void sheet({
      header: t('Cancel – clients are told by notification and calendar update'),
      buttons: [
        ...(s.series_id
          ? [
              {
                text: t('Cancel only this session'),
                role: 'destructive',
                handler: () => doCancel('one'),
              },
              {
                text: t('Cancel this and all later sessions'),
                role: 'destructive',
                handler: () => doCancel('series'),
              },
            ]
          : [{ text: t('Cancel session'), role: 'destructive', handler: () => doCancel('one') }]),
        { text: t('Keep it'), role: 'cancel' },
      ],
    });
  }

  return (
    <>
      <IonCard className="sessions-card">
        <IonCardHeader>
          <IonCardSubtitle>
            {s.type === 'online' ? t('Online') : t('In person')}
            {s.series_id ? t(' · repeating') : ''}
            {cancelled ? t(' · cancelled') : ''}
          </IonCardSubtitle>
          <IonCardTitle>
            {formatWhen(s.starts_at, myTz)} {zoneAbbr(s.starts_at, myTz)}
          </IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <p>
            {s.duration_min} {t('min')}
            {s.time_zone !== myTz && (
              <>
                {' '}
                {t('· scheduled as')} {formatWhen(s.starts_at, s.time_zone)} (
                {timeZoneLabel(s.time_zone)})
              </>
            )}
          </p>
          {s.location && <p>📍 {s.location}</p>}
          {s.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{s.notes}</p>}
          {s.type === 'online' && s.meet_url && !cancelled && (
            <IonButton
              className="sessions-join"
              expand="block"
              href={s.meet_url}
              target="_blank"
              rel="noopener"
            >
              <IonIcon slot="start" icon={videocam} />
              {t('Join')}
            </IonButton>
          )}
          {!s.send_invite && (
            <p className="sessions-note">{t('No calendar invites were sent for this session.')}</p>
          )}
        </IonCardContent>
      </IonCard>

      <IonList inset style={{ margin: '16px 0' }}>
        <IonListHeader>
          <IonLabel>{started ? t('Attendance') : t('Clients')}</IonLabel>
        </IonListHeader>
        {s.session_attendees.map((a) => (
          <IonItem key={a.client_id}>
            <IonLabel>{a.profiles?.full_name || a.profiles?.email || t('Client')}</IonLabel>
            {started && !cancelled ? (
              <IonSegment
                slot="end"
                className="sessions-attendance"
                value={a.status === 'invited' ? undefined : a.status}
                onIonChange={(e) =>
                  mark.mutate({
                    clientId: a.client_id,
                    status: e.detail.value as AttendeeStatus,
                  })
                }
              >
                <IonSegmentButton value="present">
                  <IonLabel>{t('Present')}</IonLabel>
                </IonSegmentButton>
                <IonSegmentButton value="missed">
                  <IonLabel>{t('Missed')}</IonLabel>
                </IonSegmentButton>
              </IonSegment>
            ) : (
              <IonLabel slot="end" color="medium">
                {t('Invited')}
              </IonLabel>
            )}
          </IonItem>
        ))}
      </IonList>

      {!cancelled && !started && (
        <>
          <IonButton expand="block" fill="outline" onClick={edit}>
            {t('Edit')}
          </IonButton>
          <IonButton
            expand="block"
            fill="clear"
            color="danger"
            disabled={cancel.isPending}
            onClick={askCancel}
          >
            {cancel.isPending ? t('Cancelling…') : t('Cancel session')}
          </IonButton>
        </>
      )}
    </>
  );
}
