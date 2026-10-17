import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonList,
  IonModal,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { useMyClients } from '../trainer/api';
import { usePlanAssignments, useSetPlanClients } from './api';

/** Choose which of the trainer's clients follow this plan. */
export function AssignPlanModal({
  planId,
  isOpen,
  onClose,
}: {
  planId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Assign plan</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {isOpen && <Picker planId={planId} onDone={onClose} />}
      </IonContent>
    </IonModal>
  );
}

function Picker({ planId, onDone }: { planId: string; onDone: () => void }) {
  const { profile } = useAuth();
  const clients = useMyClients(profile?.id);
  const assignments = usePlanAssignments(planId);
  const setClients = useSetPlanClients(planId);
  const [toast] = useIonToast();
  const current = new Set((assignments.data ?? []).map((a) => a.client_id));
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const selected = chosen ?? current;

  if (clients.isPending || assignments.isPending) return null;
  const active = (clients.data ?? []).filter((c) => c.profile.is_active);
  if (active.length === 0) {
    return (
      <IonText color="medium">
        <p>You don't have any active clients yet.</p>
      </IonText>
    );
  }

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  }

  async function save() {
    const add = [...selected].filter((id) => !current.has(id));
    const remove = [...current].filter((id) => !selected.has(id));
    try {
      await setClients.mutateAsync({ add, remove });
      void toast({ message: 'Assignments saved', duration: 1500, position: 'top' });
      onDone();
    } catch {
      void toast({ message: 'Could not save', duration: 2500, color: 'danger', position: 'top' });
    }
  }

  return (
    <>
      <IonText color="medium">
        <p className="workout-note">
          A client follows one plan at a time – ticking a client here replaces their current plan.
          Their history is kept.
        </p>
      </IonText>
      <IonList>
        {active.map(({ profile: p }) => (
          <IonItem key={p.id}>
            <IonCheckbox
              justify="space-between"
              checked={selected.has(p.id)}
              onIonChange={(e) => toggle(p.id, e.detail.checked)}
            >
              {p.full_name || p.email}
            </IonCheckbox>
          </IonItem>
        ))}
      </IonList>
      <IonButton expand="block" disabled={setClients.isPending} onClick={() => void save()}>
        {setClients.isPending ? 'Saving…' : 'Save'}
      </IonButton>
    </>
  );
}
