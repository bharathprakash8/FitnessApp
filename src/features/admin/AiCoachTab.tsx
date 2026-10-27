import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  useIonToast,
} from '@ionic/react';
import { useMemo, useState } from 'react';

import { ListSkeleton } from '../../components/ListSkeleton';
import { AiCoachView } from './AiCoachView';
import { useCoachAdmin, useCoachOverview } from './coachAdminApi';
import './admin.css';

/** Admin → AI Coach. Approved / skipped cards disappear at once; the list refreshes behind. */
export function AiCoachTab() {
  const overview = useCoachOverview();
  const admin = useCoachAdmin();
  const [toast] = useIonToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const data = useMemo(() => {
    if (!overview.data) return null;
    return {
      ...overview.data,
      proposed: overview.data.proposed.filter((a) => !hidden.has(a.id)),
      questions: overview.data.questions.filter((q) => !hidden.has(q.id)),
    };
  }, [overview.data, hidden]);

  const onAction = (body: Record<string, unknown>, done: string) => {
    const ids = [
      ...(typeof body.action_id === 'string' && body.action !== 'undo' ? [body.action_id] : []),
      ...(Array.isArray(body.action_ids) ? (body.action_ids as string[]) : []),
      ...(typeof body.query_id === 'string' ? [body.query_id] : []),
    ];
    if (ids.length) setHidden((h) => new Set([...h, ...ids]));
    return admin
      .mutateAsync(body)
      .then((r) => {
        const failed = (r as { failed?: { reason?: string }[] } | null)?.failed ?? [];
        const msg = failed.length
          ? `${done} – ${failed.length} blocked by the safety rules (see History)`
          : done;
        if (msg)
          void toast({
            message: msg,
            duration: 2000,
            position: 'top',
            color: failed.length ? 'warning' : 'success',
          });
      })
      .catch((e: Error) => {
        // Show the card again so nothing is lost.
        if (ids.length) setHidden((h) => new Set([...h].filter((x) => !ids.includes(x))));
        void toast({ message: e.message, duration: 3500, color: 'danger', position: 'top' });
      });
  };

  if (overview.isPending) {
    return (
      <div className="ion-padding">
        <ListSkeleton />
      </div>
    );
  }
  if (!data?.coach) {
    return (
      <div className="ion-padding admin-coach">
        <IonCard>
          <IonCardHeader>
            <IonCardTitle>Set up the AI coach</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>
              Creates the “FitCoach AI Coach” trainer account (nobody can log in as it), four safe
              starter plans and the shared coaching playbook. Then map people to it like any
              trainer.
            </p>
            <IonButton
              expand="block"
              disabled={admin.isPending}
              onClick={() => void onAction({ action: 'setup' }, 'AI coach set up')}
            >
              Set up AI coach
            </IonButton>
          </IonCardContent>
        </IonCard>
      </div>
    );
  }
  return (
    <div className="ion-padding">
      <AiCoachView data={data} busy={admin.isPending} onAction={onAction} />
    </div>
  );
}
