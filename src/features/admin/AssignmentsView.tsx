import {
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonText,
  useIonToast,
} from '@ionic/react';
import type { UseQueryResult } from '@tanstack/react-query';

import { displayName, useAdminAction, type AdminUser } from './api';
import { QueryState } from './QueryState';

export function AssignmentsView({ query }: { query: UseQueryResult<AdminUser[]> }) {
  return <QueryState query={query}>{(users) => <Assignments users={users} />}</QueryState>;
}

function Assignments({ users }: { users: AdminUser[] }) {
  const action = useAdminAction();
  const [toast] = useIonToast();

  const trainers = users.filter((u) => u.role === 'trainer');
  const activeTrainers = trainers.filter((t) => t.is_active);
  const clients = users.filter((u) => u.role === 'client');
  const unassigned = clients.filter((c) => !c.trainer_id);

  async function move(client: AdminUser, trainerId: string) {
    if (trainerId === client.trainer_id) return;
    try {
      await action.mutateAsync({ action: 'assign', client_id: client.id, trainer_id: trainerId });
      const to = trainers.find((t) => t.id === trainerId);
      void toast({
        message: `${displayName(client)} moved to ${to ? displayName(to) : 'new trainer'}`,
        duration: 2000,
        position: 'top',
      });
    } catch (err) {
      void toast({
        message: err instanceof Error ? err.message : 'Could not move the client',
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
    }
  }

  if (trainers.length === 0) {
    return (
      <IonText color="medium">
        <p className="ion-padding ion-text-center">
          No trainers yet. Add a trainer from the Users tab first.
        </p>
      </IonText>
    );
  }

  const groups = [
    ...trainers.map((t) => ({
      key: t.id,
      title: `${displayName(t)}${t.is_active ? '' : ' (deactivated)'}`,
      clients: clients.filter((c) => c.trainer_id === t.id),
    })),
    ...(unassigned.length ? [{ key: 'none', title: 'No trainer', clients: unassigned }] : []),
  ];

  return (
    <IonList>
      {groups.map((g) => (
        <div key={g.key}>
          <IonItemDivider sticky>
            <IonLabel>
              {g.title} · {g.clients.length} client{g.clients.length === 1 ? '' : 's'}
            </IonLabel>
          </IonItemDivider>
          {g.clients.length === 0 && (
            <IonItem lines="none">
              <IonLabel color="medium">No clients</IonLabel>
            </IonItem>
          )}
          {g.clients.map((c) => (
            <IonItem key={c.id}>
              <IonSelect
                label={displayName(c)}
                interface="action-sheet"
                interfaceOptions={{ header: `Move ${displayName(c)} to` }}
                value={c.trainer_id ?? undefined}
                placeholder="Pick trainer"
                disabled={action.isPending}
                onIonChange={(e) => void move(c, String(e.detail.value))}
              >
                {activeTrainers.map((t) => (
                  <IonSelectOption key={t.id} value={t.id}>
                    {displayName(t)}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
          ))}
        </div>
      ))}
    </IonList>
  );
}
