import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
} from '@ionic/react';

import { todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useActivePlan, useWorkoutLogs } from './api';
import { nextDay } from './model';
import './workouts.css';
import { useT } from '../../i18n/i18n';

/** Today page: the next workout from the client's plan. */
export function TodayWorkoutCard({ profile }: { profile: Profile }) {
  const t = useT();
  const active = useActivePlan(profile.id);
  const logs = useWorkoutLogs(profile.id);
  if (active.isPending || logs.isPending || !active.data) return null;

  const next = nextDay(active.data.plan.plan_days, logs.data ?? [], todayIn(profile.timezone));
  if (!next || next.day.plan_exercises.length === 0) return null;

  return (
    <IonCard className="workout-card">
      <IonCardHeader>
        <IonCardSubtitle>
          {next.inProgress ? t("Today's workout – in progress") : t("Today's workout")}
        </IonCardSubtitle>
        <IonCardTitle>{next.day.title}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p className="workout-muted">
          {next.day.plan_exercises.map((pe) => pe.exercises.name).join(' · ')}
        </p>
        <IonButton
          expand="block"
          style={{ marginTop: 12 }}
          routerLink={`/workouts/day/${next.day.id}`}
        >
          {next.inProgress ? t('Continue workout') : t('Start workout')}
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
}
