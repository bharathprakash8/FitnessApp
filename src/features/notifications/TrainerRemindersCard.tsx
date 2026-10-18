import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonItem,
  IonLabel,
  IonList,
  IonToggle,
  useIonToast,
} from '@ionic/react';

import { describeDays, useCustomReminders, useMuteCustomReminder } from './api';

/** Client: reminders their trainer set. They can mute the ones the trainer allows. */
export function TrainerRemindersCard({ clientId }: { clientId: string }) {
  const reminders = useCustomReminders(clientId);
  const mute = useMuteCustomReminder(clientId);
  const [toast] = useIonToast();
  const active = (reminders.data ?? []).filter((r) => r.is_active);
  if (active.length === 0) return null;

  return (
    <IonCard className="notif-card">
      <IonCardHeader>
        <IonCardTitle>From your trainer</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonList lines="full">
          {active.map((r) => (
            <IonItem key={r.id}>
              {r.client_can_mute ? (
                <IonToggle
                  checked={!r.muted}
                  disabled={mute.isPending}
                  onIonChange={(e) =>
                    mute.mutate(
                      { id: r.id, muted: !e.detail.checked },
                      {
                        onError: () =>
                          void toast({
                            message: 'Could not save',
                            duration: 2500,
                            color: 'danger',
                            position: 'top',
                          }),
                      },
                    )
                  }
                >
                  <ReminderText title={r.title} body={r.body} when={when(r)} />
                </IonToggle>
              ) : (
                <IonLabel>
                  <ReminderText title={r.title} body={r.body} when={when(r)} />
                  <p className="notif-muted">Always on – set by your trainer</p>
                </IonLabel>
              )}
            </IonItem>
          ))}
        </IonList>
      </IonCardContent>
    </IonCard>
  );
}

const when = (r: { remind_at: string; days: number[] }) =>
  `${r.remind_at.slice(0, 5)} · ${describeDays(r.days)}`;

function ReminderText({ title, body, when }: { title: string; body: string | null; when: string }) {
  return (
    <>
      <strong>{title}</strong>
      <p>{when}</p>
      {body && <p>{body}</p>}
    </>
  );
}
