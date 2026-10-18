import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonInput,
  IonText,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';

import { ageFrom, todayIn } from '../../lib/dates';
import { isAndroidApp, isIOSWeb } from '../../lib/platform';
import type { Profile } from '../auth/roles';
import { useLatestWeight } from '../profile/api';
import { useWorkoutLogs } from '../workouts/api';
import { useActivityDay, useSaveManualActivity } from './api';
import { dayFraction, formatSleep, resolveBurn } from './model';
import './activity.css';

/**
 * Calories burnt for one day and the net balance against food eaten.
 * `editable` (the client themself) shows manual entry and a sync prompt when there's no
 * device data.
 */
export function BurnCard({
  client,
  day,
  eatenKcal,
  editable,
}: {
  client: Profile;
  day: string;
  eatenKcal: number;
  editable: boolean;
}) {
  const tz = client.timezone;
  const today = todayIn(tz);
  const activity = useActivityDay(client.id, day);
  const logs = useWorkoutLogs(client.id);
  const weight = useLatestWeight(client.id);
  const saveManual = useSaveManualActivity(client.id);
  const [toast] = useIonToast();
  const [manual, setManual] = useState('');

  if (activity.isPending || logs.isPending || weight.isPending) return null;

  const burn = resolveBurn({
    row: activity.data ?? null,
    dayLogs: (logs.data ?? []).filter((l) => l.performed_on === day),
    profile: client,
    weightKg: weight.data?.weight_kg ?? null,
    age: ageFrom(client.date_of_birth, tz),
    fraction: dayFraction(day, today, tz),
  });
  const net = eatenKcal - burn.total;

  async function saveManualEntry() {
    const n = Math.round(Number(manual));
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      void toast({
        message: 'Enter a number of calories (0–10,000)',
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      return;
    }
    try {
      const result = await saveManual.mutateAsync({ day, activeCalories: n });
      setManual('');
      if (result === 'offline') {
        void toast({
          message: 'Saved offline – will sync when you’re back online',
          duration: 2500,
          position: 'top',
        });
      }
    } catch {
      void toast({
        message: 'Could not save. Try again.',
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
    }
  }

  return (
    <IonCard className="burn-card">
      <IonCardHeader>
        <IonCardSubtitle>Calories burnt</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        <div className="burn-row">
          <div>
            <div className="burn-big">{burn.total.toLocaleString('en-IN')} kcal</div>
            <div className="burn-muted">
              Active {burn.active.toLocaleString('en-IN')}
              {burn.activeEstimated ? ' (estimated)' : ''} · Resting{' '}
              {burn.resting.toLocaleString('en-IN')}
              {burn.restingEstimated ? ' (estimated)' : ''}
            </div>
            <div className="burn-muted">{burn.activeSource}</div>
          </div>
          <div className="burn-net">
            <div className={net > 0 ? 'burn-big surplus' : 'burn-big deficit'}>
              {net > 0 ? '+' : ''}
              {net.toLocaleString('en-IN')}
            </div>
            <div className="burn-muted">net kcal ({net > 0 ? 'surplus' : 'deficit'})</div>
          </div>
        </div>
        {(burn.steps !== null || burn.sleepMinutes !== null) && (
          <p className="burn-muted" style={{ marginTop: 8 }}>
            {burn.steps !== null ? `${burn.steps.toLocaleString('en-IN')} steps` : ''}
            {burn.steps !== null && burn.sleepMinutes !== null ? ' · ' : ''}
            {burn.sleepMinutes !== null ? `Sleep ${formatSleep(burn.sleepMinutes)}` : ''}
          </p>
        )}

        {editable && !burn.hasDeviceData && (
          <div className="burn-manual">
            <IonText color="medium">
              <p>
                {day === today ? "Enter today's" : 'Enter'} active calories from your watch or phone
                app:
              </p>
            </IonText>
            <div className="burn-manual-row">
              <IonInput
                fill="outline"
                type="number"
                inputmode="numeric"
                placeholder="e.g. 350"
                value={manual}
                onIonInput={(e) => setManual(String(e.detail.value ?? ''))}
              />
              <IonButton
                disabled={!manual || saveManual.isPending}
                onClick={() => void saveManualEntry()}
              >
                Save
              </IonButton>
            </div>
            {(isAndroidApp || isIOSWeb) && (
              <IonButton fill="clear" size="small" routerLink="/me/health">
                {isAndroidApp ? 'Connect Health Connect' : 'Set up iPhone sync'}
              </IonButton>
            )}
          </div>
        )}
      </IonCardContent>
    </IonCard>
  );
}
