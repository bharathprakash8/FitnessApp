import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  useIonToast,
} from '@ionic/react';

import { add } from 'ionicons/icons';
import { IonIcon } from '@ionic/react';

import { formatDate } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { useActivePlan, useMyPlans, useSelfWorkouts, useWorkoutLogs } from '../workouts/api';
import { prescription } from '../workouts/model';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { WorkoutHistoryList } from '../workouts/WorkoutHistoryList';
import { useT } from '../../i18n/i18n';

const NONE = 'none';

/** Trainer → client detail → Workouts: current plan (change it here) and logged sessions. */
export function ClientWorkoutsTab({ client }: { client: Profile }) {
  const t = useT();
  const { profile: me } = useAuth();
  const active = useActivePlan(client.id);
  const plans = useMyPlans(me?.id);
  const logs = useWorkoutLogs(client.id);
  const own = useSelfWorkouts(client.id);
  const qc = useQueryClient();
  const [toast] = useIonToast();

  async function changePlan(planId: string) {
    const current = active.data?.plan.id;
    if (planId === (current ?? NONE)) return;
    try {
      if (planId === NONE) {
        const { error } = await supabase
          .from('plan_assignments')
          .update({ is_active: false })
          .eq('client_id', client.id)
          .eq('is_active', true);
        if (error) throw error;
      } else {
        // The database ends the previous assignment automatically.
        const { error } = await supabase
          .from('plan_assignments')
          .insert({ plan_id: planId, client_id: client.id });
        if (error) throw error;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['assignment'] }),
        qc.invalidateQueries({ queryKey: ['plans'] }),
        qc.invalidateQueries({ queryKey: ['plan-assignments'] }),
      ]);
      void toast({ message: t('Plan updated'), duration: 1500, position: 'top' });
    } catch {
      void toast({ message: t('Could not change the plan'), duration: 2500, color: 'danger' });
    }
  }

  if (active.isPending || plans.isPending || logs.isPending) {
    return (
      <div className="ion-text-center">
        <IonSpinner name="crescent" />
      </div>
    );
  }

  return (
    <>
      <IonCard className="trainer-card">
        <IonCardHeader>
          <IonCardSubtitle>{t('Current plan')}</IonCardSubtitle>
          <IonCardTitle>{active.data?.plan.name ?? t('No plan')}</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          {active.data && (
            <p className="trainer-note">
              {t('Since')} {formatDate(active.data.assignment.start_date)}
            </p>
          )}
          <IonSelect
            fill="outline"
            label={t('Change plan')}
            labelPlacement="stacked"
            interface="action-sheet"
            interfaceOptions={{ header: t('Choose a plan') }}
            value={active.data?.plan.id ?? NONE}
            onIonChange={(e) => void changePlan(String(e.detail.value))}
            style={{ marginTop: 12 }}
          >
            <IonSelectOption value={NONE}>{t('No plan')}</IonSelectOption>
            {(plans.data ?? []).map((p) => (
              <IonSelectOption key={p.id} value={p.id}>
                {p.name}
              </IonSelectOption>
            ))}
          </IonSelect>
          {(plans.data ?? []).length === 0 && (
            <IonText color="medium">
              <p className="trainer-note">{t('Build a plan in the Plans tab first.')}</p>
            </IonText>
          )}
        </IonCardContent>
      </IonCard>
      {(own.data ?? []).length > 0 && (
        <IonCard className="trainer-card">
          <IonCardHeader>
            <IonCardSubtitle>{t('Their own workouts (logged as Self)')}</IonCardSubtitle>
          </IonCardHeader>
          <IonCardContent>
            {own.data!.map((w) => (
              <p key={w.id} style={{ margin: '0 0 8px' }}>
                <strong>{w.name}</strong>
                <br />
                <span className="trainer-note">
                  {w.self_workout_exercises
                    .map((x) => `${x.exercises.name} ${prescription(x)}`)
                    .join(' · ') || t('No exercises yet')}
                </span>
              </p>
            ))}
          </IonCardContent>
        </IonCard>
      )}
      <IonButton expand="block" routerLink={`/trainer/clients/${client.id}/log`}>
        <IonIcon slot="start" icon={add} />
        {t('Log a workout for them')}
      </IonButton>
      <h3>{t('Logged workouts')}</h3>
      <WorkoutHistoryList
        logs={logs.data ?? []}
        emptyText={t('No workouts logged yet.')}
        limitDays={30}
      />
    </>
  );
}
