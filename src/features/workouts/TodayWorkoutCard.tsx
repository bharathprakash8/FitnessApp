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
import { useCoachDay } from '../coach/api';
import { useActivePlan, useWorkoutLogs } from './api';
import { nextDay } from './model';
import './workouts.css';
import { useT } from '../../i18n/i18n';

/**
 * Today page: the next workout from the client's plan. The AI coach can choose today's day
 * from the plan, or make today a rest day (coach_day_plans).
 */
export function TodayWorkoutCard({ profile }: { profile: Profile }) {
  const t = useT();
  const today = todayIn(profile.timezone);
  const active = useActivePlan(profile.id);
  const logs = useWorkoutLogs(profile.id);
  const coach = useCoachDay(profile.id, today, profile.role === 'client');
  if (active.isPending || logs.isPending || !active.data) return null;
  const coachPlan = coach.data?.plan;
  if (coachPlan?.kind === 'rest') return null;

  const rotation = nextDay(active.data.plan.plan_days, logs.data ?? [], today);
  const chosen = active.data.plan.plan_days.find((d) => d.id === coachPlan?.plan_day_id);
  const next = chosen
    ? {
        day: chosen,
        inProgress: (logs.data ?? []).some(
          (l) => l.plan_day_id === chosen.id && l.performed_on === today,
        ),
      }
    : rotation;
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
