import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import { add } from 'ionicons/icons';
import { useState } from 'react';

import type { Profile } from '../auth/roles';
import {
  REMINDER_KINDS,
  WEEKDAYS,
  describeDays,
  useCustomReminders,
  useDeleteCustomReminder,
  useHasPushDevice,
  useReminderSettings,
  useSaveCustomReminder,
  type CustomReminder,
  type ReminderKind,
} from '../notifications/api';
import { ReminderForm } from '../notifications/ReminderForm';
import '../notifications/notifications.css';
import { useT } from '../../i18n/i18n';

/** Trainer → client → Reminders: meal/workout times and the trainer's own reminders. */
export function ClientRemindersTab({ client }: { client: Profile }) {
  const t = useT();
  const settings = useReminderSettings(client.id);
  const device = useHasPushDevice(client.id);
  const name = client.full_name || 'This client';

  return (
    <>
      {device.data === false && (
        <IonText color="warning">
          <p className="trainer-note">
            {name}{' '}
            {t(
              "hasn't turned on notifications yet, so reminders won't reach them. Ask them to open Me → Notifications → Turn on notifications.",
            )}
          </p>
        </IonText>
      )}
      <IonCard className="trainer-card">
        <IonCardHeader>
          <IonCardTitle>{t('Meal and workout reminders')}</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          {settings.isPending || !settings.data ? (
            <IonSpinner name="dots" />
          ) : (
            <ReminderForm
              key={settings.data.updated_at || 'defaults'}
              clientId={client.id}
              initial={settings.data}
              mode="trainer"
              clientName={client.full_name ?? undefined}
            />
          )}
        </IonCardContent>
      </IonCard>
      <CustomReminders client={client} />
    </>
  );
}

type Draft = Omit<
  CustomReminder,
  'client_id' | 'created_by' | 'created_at' | 'updated_at' | 'id'
> & {
  id?: string;
};

const newDraft = (kind: ReminderKind = 'cardio'): Draft => ({
  kind,
  title: REMINDER_KINDS.find((k) => k.kind === kind)!.title,
  body: null,
  remind_at: '07:00',
  days: [1, 2, 3, 4, 5, 6, 7],
  client_can_mute: true,
  muted: false,
  is_active: true,
});

function CustomReminders({ client }: { client: Profile }) {
  const t = useT();
  const reminders = useCustomReminders(client.id);
  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <IonCard className="trainer-card">
      <IonCardHeader>
        <IonCardTitle>{t('Your reminders')}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p className="trainer-note" style={{ marginTop: 0 }}>
          {t('Cardio, session, food update or anything else – on the days and time you choose.')}
        </p>
        {reminders.isPending ? (
          <IonSpinner name="dots" />
        ) : (
          <IonList lines="full">
            {(reminders.data ?? []).map((r) => (
              <IonItem key={r.id} button detail onClick={() => setEditing({ ...r })}>
                <IonLabel color={r.is_active ? undefined : 'medium'}>
                  <h3>
                    {r.title}
                    {!r.is_active && t(' (off)')}
                  </h3>
                  <p>
                    {r.remind_at.slice(0, 5)} · {describeDays(r.days)}
                  </p>
                  <p>
                    {!r.client_can_mute
                      ? t('Always on (client can’t mute)')
                      : r.muted
                        ? t('Muted by the client')
                        : t('Client can mute')}
                  </p>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
        <IonButton expand="block" fill="outline" onClick={() => setEditing(newDraft())}>
          <IonIcon slot="start" icon={add} />
          {t('Add reminder')}
        </IonButton>
      </IonCardContent>
      <ReminderModal clientId={client.id} draft={editing} onClose={() => setEditing(null)} />
    </IonCard>
  );
}

function ReminderModal({
  clientId,
  draft,
  onClose,
}: {
  clientId: string;
  draft: Draft | null;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <IonModal isOpen={draft !== null} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{draft?.id ? t('Edit reminder') : t('New reminder')}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>{t('Close')}</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {draft && (
          <ReminderFields
            key={draft.id ?? 'new'}
            clientId={clientId}
            initial={draft}
            onDone={onClose}
          />
        )}
      </IonContent>
    </IonModal>
  );
}

function ReminderFields({
  clientId,
  initial,
  onDone,
}: {
  clientId: string;
  initial: Draft;
  onDone: () => void;
}) {
  const t = useT();
  const save = useSaveCustomReminder(clientId);
  const remove = useDeleteCustomReminder(clientId);
  const [toast] = useIonToast();
  const [alert] = useIonAlert();
  const [d, setD] = useState<Draft>({ ...initial, remind_at: initial.remind_at.slice(0, 5) });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const busy = save.isPending || remove.isPending;

  function pickKind(kind: ReminderKind) {
    // Switch the title too, unless the trainer already wrote their own.
    const isDefault = REMINDER_KINDS.some((k) => k.title === d.title) || !d.title.trim();
    setD((p) => ({
      ...p,
      kind,
      title: isDefault ? REMINDER_KINDS.find((k) => k.kind === kind)!.title : p.title,
    }));
  }

  function toggleDay(n: number) {
    set('days', d.days.includes(n) ? d.days.filter((x) => x !== n) : [...d.days, n].sort());
  }

  const fail = (message = 'Could not save. Try again.') =>
    void toast({ message, duration: 3000, color: 'danger', position: 'top' });

  async function submit() {
    if (!d.title.trim()) return fail('Give the reminder a title.');
    if (!/^\d{2}:\d{2}$/.test(d.remind_at)) return fail('Pick a time.');
    if (d.days.length === 0) return fail('Pick at least one day.');
    try {
      await save.mutateAsync({
        id: d.id,
        kind: d.kind,
        title: d.title.trim(),
        body: d.body?.trim() || null,
        remind_at: d.remind_at,
        days: d.days,
        client_can_mute: d.client_can_mute,
        is_active: d.is_active,
      });
      onDone();
    } catch (err) {
      fail(err instanceof Error && err.message.includes('up to 20') ? err.message : undefined);
    }
  }

  function confirmDelete() {
    void alert({
      header: t('Delete this reminder?'),
      buttons: [
        { text: t('Cancel'), role: 'cancel' },
        {
          text: t('Delete'),
          role: 'destructive',
          handler: () =>
            remove.mutate(d.id!, { onSuccess: onDone, onError: () => fail('Could not delete.') }),
        },
      ],
    });
  }

  return (
    <div className="workout-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p className="notif-muted" style={{ margin: '0 0 6px' }}>
          {t('Type')}
        </p>
        {REMINDER_KINDS.map((k) => (
          <IonChip
            key={k.kind}
            color={d.kind === k.kind ? 'primary' : 'medium'}
            outline={d.kind !== k.kind}
            onClick={() => pickKind(k.kind)}
          >
            {k.label}
          </IonChip>
        ))}
      </div>
      <IonInput
        fill="outline"
        label={t('Title')}
        labelPlacement="floating"
        maxlength={60}
        value={d.title}
        onIonInput={(e) => set('title', String(e.detail.value ?? ''))}
      />
      <IonTextarea
        fill="outline"
        label={t('Message (optional)')}
        labelPlacement="floating"
        placeholder={t('e.g. 30 min brisk walk')}
        autoGrow
        maxlength={200}
        value={d.body ?? ''}
        onIonInput={(e) => set('body', String(e.detail.value ?? ''))}
      />
      <IonInput
        fill="outline"
        label={t("Time (client's time)")}
        labelPlacement="floating"
        type="time"
        value={d.remind_at}
        onIonInput={(e) => set('remind_at', String(e.detail.value ?? ''))}
      />
      <div>
        <p className="notif-muted" style={{ margin: '0 0 6px' }}>
          {t('Days ·')} {d.days.length ? describeDays(d.days) : t('none')}
        </p>
        {WEEKDAYS.map((w, i) => (
          <IonChip
            key={w}
            color={d.days.includes(i + 1) ? 'primary' : 'medium'}
            outline={!d.days.includes(i + 1)}
            onClick={() => toggleDay(i + 1)}
          >
            {w}
          </IonChip>
        ))}
        <IonButton size="small" fill="clear" onClick={() => set('days', [1, 2, 3, 4, 5, 6, 7])}>
          {t('Every day')}
        </IonButton>
      </div>
      <IonList lines="full">
        <IonItem>
          <IonToggle
            checked={d.client_can_mute}
            onIonChange={(e) => set('client_can_mute', e.detail.checked)}
          >
            <IonLabel>
              <strong>{t('Client can mute this')}</strong>
              <p>{t('Off = always on, even if they pause reminders')}</p>
            </IonLabel>
          </IonToggle>
        </IonItem>
        <IonItem>
          <IonToggle checked={d.is_active} onIonChange={(e) => set('is_active', e.detail.checked)}>
            <strong>{t('Reminder on')}</strong>
          </IonToggle>
        </IonItem>
      </IonList>
      <IonButton expand="block" disabled={busy} onClick={() => void submit()}>
        {save.isPending ? t('Saving…') : t('Save reminder')}
      </IonButton>
      {d.id && (
        <IonButton
          expand="block"
          fill="clear"
          color="danger"
          disabled={busy}
          onClick={confirmDelete}
        >
          {t('Delete reminder')}
        </IonButton>
      )}
    </div>
  );
}
