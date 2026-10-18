import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonChip,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { DEFAULT_TIMEZONE, todayIn } from '../../lib/dates';
import { zoneOptions } from '../../lib/timezones';
import { useAuth } from '../auth/useAuth';
import { WEEKDAYS } from '../notifications/api';
import { useMyClients } from '../trainer/api';
import {
  SessionError,
  useCreateSession,
  useGoogleStatus,
  useSession,
  useUpdateSession,
  type SessionInput,
  type SessionWithPeople,
} from './api';
import './sessions.css';

const DURATIONS = [15, 30, 45, 60, 75, 90, 120];

/** The date and HH:MM of an instant in a time zone. */
function localParts(iso: string, timeZone: string) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone }).format(d),
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d),
  };
}

const isoWeekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/**
 * /trainer/sessions/new – schedule a session or a repeating series.
 * /trainer/sessions/:id/edit?scope=one|series – change one session, or this and later ones.
 */
export function SessionEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const scope =
    new URLSearchParams(useLocation().search).get('scope') === 'series' ? 'series' : 'one';
  const session = useSession(id);
  const { profile } = useAuth();
  const clients = useMyClients(profile?.id);
  const google = useGoogleStatus();

  const loading = clients.isPending || google.isPending || (Boolean(id) && session.isPending);
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/trainer/sessions" />
          </IonButtons>
          <IonTitle>
            {!id ? 'New session' : scope === 'series' ? 'Edit this and later' : 'Edit session'}
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="sessions-page">
          {loading ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : id && !session.data ? (
            <IonText color="medium">
              <p className="ion-text-center">This session no longer exists.</p>
            </IonText>
          ) : (
            <Form
              existing={session.data ?? null}
              scope={scope}
              clients={(clients.data ?? [])
                .filter((c) => c.profile.is_active)
                .map((c) => ({ id: c.profile.id, name: c.profile.full_name || c.profile.email }))}
              googleConnected={Boolean(google.data?.connected)}
              defaultZone={profile?.timezone ?? DEFAULT_TIMEZONE}
            />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Form({
  existing,
  scope,
  clients,
  googleConnected,
  defaultZone,
}: {
  existing: SessionWithPeople | null;
  scope: 'one' | 'series';
  clients: { id: string; name: string }[];
  googleConnected: boolean;
  defaultZone: string;
}) {
  const router = useIonRouter();
  const [toast] = useIonToast();
  const create = useCreateSession();
  const update = useUpdateSession();
  const busy = create.isPending || update.isPending;

  const startZone = existing?.time_zone ?? defaultZone;
  const start = existing
    ? localParts(existing.starts_at, startZone)
    : { date: todayIn(startZone), time: '07:00' };

  const [f, setF] = useState<SessionInput>({
    title: existing?.title ?? 'Training session',
    type: (existing?.type as SessionInput['type']) ?? 'online',
    location: existing?.location ?? null,
    notes: existing?.notes ?? null,
    duration_min: existing?.duration_min ?? 60,
    time_zone: startZone,
    start_date: start.date,
    start_time: start.time,
    repeat: 'none',
    weekdays: [isoWeekday(start.date)],
    ends_after: 8,
    ends_on: null,
    client_ids: existing?.session_attendees.map((a) => a.client_id) ?? [],
    meet: googleConnected ? 'google' : 'link',
    meet_url: existing?.meet_url ?? null,
    send_invite: googleConnected,
  });
  const set = <K extends keyof SessionInput>(k: K, v: SessionInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const [endBy, setEndBy] = useState<'count' | 'date'>('count');

  const editing = Boolean(existing);
  const timeLocked = editing && scope === 'series';
  const online = f.type === 'online';

  function toggleClient(cid: string, on: boolean) {
    set('client_ids', on ? [...f.client_ids, cid] : f.client_ids.filter((x) => x !== cid));
  }
  function toggleDay(n: number) {
    set(
      'weekdays',
      f.weekdays.includes(n) ? f.weekdays.filter((x) => x !== n) : [...f.weekdays, n].sort(),
    );
  }

  const fail = (message: string) =>
    void toast({ message, duration: 3500, color: 'danger', position: 'top' });

  async function save() {
    if (!f.title.trim()) return fail('Give the session a title.');
    if (f.client_ids.length === 0) return fail('Pick at least one client.');
    if (!/^\d{2}:\d{2}$/.test(f.start_time)) return fail('Pick a start time.');
    if (online && (!googleConnected || f.meet === 'link') && !f.meet_url?.startsWith('https://')) {
      return fail('Paste the meeting link (starting with https://).');
    }
    if (f.repeat === 'weekly' && f.weekdays.length === 0) return fail('Pick the days of the week.');
    try {
      if (existing) {
        await update.mutateAsync({
          session_id: existing.id,
          scope,
          title: f.title.trim(),
          location: f.location,
          notes: f.notes,
          client_ids: f.client_ids,
          meet_url: f.meet_url,
          ...(scope === 'one'
            ? {
                start_date: f.start_date,
                start_time: f.start_time,
                time_zone: f.time_zone,
                duration_min: f.duration_min,
              }
            : {}),
        });
        void toast({ message: 'Session updated', duration: 1500, position: 'top' });
        router.goBack();
      } else {
        const r = await create.mutateAsync({
          ...f,
          title: f.title.trim(),
          meet: online && googleConnected && f.meet === 'google' ? 'google' : 'link',
          meet_url: online ? f.meet_url : null,
          send_invite: googleConnected && f.send_invite,
          ends_after: f.repeat !== 'none' && endBy === 'count' ? f.ends_after : null,
          ends_on: f.repeat !== 'none' && endBy === 'date' ? f.ends_on : null,
        });
        void toast({
          message: r.sessions > 1 ? `${r.sessions} sessions scheduled` : 'Session scheduled',
          duration: 2000,
          position: 'top',
        });
        router.push('/trainer/sessions', 'back');
      }
    } catch (err) {
      fail(err instanceof SessionError ? err.message : 'Could not save. Try again.');
    }
  }

  return (
    <div className="sessions-form">
      <IonInput
        fill="outline"
        label="Title"
        labelPlacement="floating"
        maxlength={80}
        value={f.title}
        onIonInput={(e) => set('title', String(e.detail.value ?? ''))}
      />

      {!editing && (
        <IonSegment
          value={f.type}
          onIonChange={(e) => set('type', e.detail.value as SessionInput['type'])}
        >
          <IonSegmentButton value="online">
            <IonLabel>Online</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="in_person">
            <IonLabel>In person</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      )}

      {online ? (
        !editing && googleConnected ? (
          <IonSelect
            fill="outline"
            label="Video call"
            labelPlacement="stacked"
            interface="action-sheet"
            value={f.meet}
            onIonChange={(e) => set('meet', e.detail.value as SessionInput['meet'])}
          >
            <IonSelectOption value="google">Google Meet – created automatically</IonSelectOption>
            <IonSelectOption value="link">Paste my own link (Zoom, Meet…)</IonSelectOption>
          </IonSelect>
        ) : null
      ) : (
        <IonInput
          fill="outline"
          label="Place"
          labelPlacement="floating"
          placeholder="e.g. Gold's Gym, Indiranagar"
          maxlength={200}
          value={f.location ?? ''}
          onIonInput={(e) => set('location', String(e.detail.value ?? '') || null)}
        />
      )}
      {online &&
        (editing ? Boolean(existing?.meet_url) : !googleConnected || f.meet === 'link') && (
          <IonInput
            fill="outline"
            label="Meeting link"
            labelPlacement="floating"
            type="url"
            inputmode="url"
            placeholder="https://meet.google.com/…"
            value={f.meet_url ?? ''}
            onIonInput={(e) => set('meet_url', String(e.detail.value ?? '').trim() || null)}
          />
        )}

      {!timeLocked && (
        <>
          <div className="sessions-row">
            <IonInput
              fill="outline"
              label={f.repeat === 'none' ? 'Date' : 'Starts on'}
              labelPlacement="stacked"
              type="date"
              value={f.start_date}
              onIonInput={(e) => {
                const v = String(e.detail.value ?? '');
                setF((p) => ({
                  ...p,
                  start_date: v,
                  weekdays: p.weekdays.length <= 1 && v ? [isoWeekday(v)] : p.weekdays,
                }));
              }}
            />
            <IonInput
              fill="outline"
              label="Time"
              labelPlacement="stacked"
              type="time"
              value={f.start_time}
              onIonInput={(e) => set('start_time', String(e.detail.value ?? ''))}
            />
          </div>
          <div className="sessions-row">
            <IonSelect
              fill="outline"
              label="Time zone"
              labelPlacement="stacked"
              interface="action-sheet"
              interfaceOptions={{ header: 'Time zone of this time' }}
              value={f.time_zone}
              onIonChange={(e) => set('time_zone', String(e.detail.value))}
            >
              {zoneOptions(f.time_zone).map((z) => (
                <IonSelectOption key={z.tz} value={z.tz}>
                  {z.label}
                </IonSelectOption>
              ))}
            </IonSelect>
            <IonSelect
              fill="outline"
              label="Length"
              labelPlacement="stacked"
              interface="action-sheet"
              value={f.duration_min}
              onIonChange={(e) => set('duration_min', Number(e.detail.value))}
            >
              {[...new Set([...DURATIONS, f.duration_min])]
                .sort((a, b) => a - b)
                .map((d) => (
                  <IonSelectOption key={d} value={d}>
                    {d} min
                  </IonSelectOption>
                ))}
            </IonSelect>
          </div>
          <p className="sessions-note" style={{ margin: 0 }}>
            Clients see the time in their own time zone.
          </p>
        </>
      )}

      {!editing && (
        <>
          <IonSegment
            value={f.repeat}
            onIonChange={(e) => set('repeat', e.detail.value as SessionInput['repeat'])}
          >
            <IonSegmentButton value="none">
              <IonLabel>Once</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="daily">
              <IonLabel>Daily</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="weekly">
              <IonLabel>Weekly</IonLabel>
            </IonSegmentButton>
          </IonSegment>
          {f.repeat === 'weekly' && (
            <div>
              <p className="sessions-label">On these days</p>
              {WEEKDAYS.map((w, i) => (
                <IonChip
                  key={w}
                  color={f.weekdays.includes(i + 1) ? 'primary' : 'medium'}
                  outline={!f.weekdays.includes(i + 1)}
                  onClick={() => toggleDay(i + 1)}
                >
                  {w}
                </IonChip>
              ))}
            </div>
          )}
          {f.repeat !== 'none' && (
            <div className="sessions-row">
              <IonSelect
                fill="outline"
                label="Ends"
                labelPlacement="stacked"
                interface="action-sheet"
                value={endBy}
                onIonChange={(e) => setEndBy(e.detail.value as 'count' | 'date')}
              >
                <IonSelectOption value="count">After a number of sessions</IonSelectOption>
                <IonSelectOption value="date">On a date</IonSelectOption>
              </IonSelect>
              {endBy === 'count' ? (
                <IonInput
                  fill="outline"
                  label="Sessions (max 60)"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="numeric"
                  value={f.ends_after ?? ''}
                  onIonInput={(e) =>
                    set('ends_after', Math.min(60, Math.max(1, Number(e.detail.value) || 1)))
                  }
                />
              ) : (
                <IonInput
                  fill="outline"
                  label="Last date"
                  labelPlacement="stacked"
                  type="date"
                  value={f.ends_on ?? ''}
                  onIonInput={(e) => set('ends_on', String(e.detail.value ?? '') || null)}
                />
              )}
            </div>
          )}
        </>
      )}

      <IonList inset style={{ margin: 0 }}>
        <IonListHeader>
          <IonLabel>Clients</IonLabel>
          {clients.length > 1 && (
            <IonButton
              size="small"
              onClick={() =>
                set(
                  'client_ids',
                  f.client_ids.length === clients.length ? [] : clients.map((c) => c.id),
                )
              }
            >
              {f.client_ids.length === clients.length ? 'None' : 'All'}
            </IonButton>
          )}
        </IonListHeader>
        {clients.length === 0 && (
          <IonItem lines="none">
            <IonLabel color="medium">You have no clients yet.</IonLabel>
          </IonItem>
        )}
        {clients.map((c) => (
          <IonItem key={c.id}>
            <IonCheckbox
              checked={f.client_ids.includes(c.id)}
              onIonChange={(e) => toggleClient(c.id, e.detail.checked)}
              justify="space-between"
            >
              {c.name}
            </IonCheckbox>
          </IonItem>
        ))}
      </IonList>

      {!editing &&
        (googleConnected ? (
          <IonToggle
            checked={f.send_invite}
            onIonChange={(e) => set('send_invite', e.detail.checked)}
          >
            <IonLabel>
              Send Google Calendar invites
              <p className="sessions-note">From your Gmail, to each client's email</p>
            </IonLabel>
          </IonToggle>
        ) : (
          <p className="sessions-note" style={{ margin: 0 }}>
            Connect Google on the Sessions page to send calendar invites automatically.
          </p>
        ))}

      <IonTextarea
        fill="outline"
        label="Notes for clients (optional)"
        labelPlacement="floating"
        autoGrow
        maxlength={1000}
        value={f.notes ?? ''}
        onIonInput={(e) => set('notes', String(e.detail.value ?? '') || null)}
      />

      <IonButton expand="block" size="large" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : editing ? 'Save changes' : 'Schedule'}
      </IonButton>
    </div>
  );
}
