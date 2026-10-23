import {
  IonButton,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonText,
  IonToggle,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';

import { DEFAULT_REMINDERS, useSaveReminderSettings, type ReminderSettings } from './api';
import { useT } from '../../i18n/i18n';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Evening snack' },
  { key: 'dinner', label: 'Dinner' },
] as const;

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

/**
 * Meal and workout reminder times. The client edits their own (unless the trainer locked
 * them); the trainer edits a client's and decides whether the client may change them.
 */
export function ReminderForm({
  clientId,
  initial,
  mode,
  clientName,
}: {
  clientId: string;
  initial: ReminderSettings;
  mode: 'client' | 'trainer';
  clientName?: string;
}) {
  const t = useT();
  const save = useSaveReminderSettings(clientId);
  const [toast] = useIonToast();
  const [s, setS] = useState({
    ...initial,
    breakfast_time: hhmm(initial.breakfast_time),
    lunch_time: hhmm(initial.lunch_time),
    snack_time: hhmm(initial.snack_time),
    dinner_time: hhmm(initial.dinner_time),
    workout_reminder_time: hhmm(initial.workout_reminder_time),
  });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  const trainer = mode === 'trainer';
  // The client can't change times the trainer locked; only their "all reminders" switch.
  const timesLocked = !trainer && initial.meal_times_locked;
  const timesDisabled = timesLocked || (!trainer && !s.enabled);

  async function submit() {
    try {
      await save.mutateAsync({
        enabled: trainer ? initial.enabled : s.enabled,
        breakfast_on: s.breakfast_on,
        breakfast_time: s.breakfast_time || DEFAULT_REMINDERS.breakfast_time,
        lunch_on: s.lunch_on,
        lunch_time: s.lunch_time || DEFAULT_REMINDERS.lunch_time,
        snack_on: s.snack_on,
        snack_time: s.snack_time || DEFAULT_REMINDERS.snack_time,
        dinner_on: s.dinner_on,
        dinner_time: s.dinner_time || DEFAULT_REMINDERS.dinner_time,
        workout_reminder_time: s.workout_reminder_time || null,
        meal_times_locked: trainer ? s.meal_times_locked : initial.meal_times_locked,
      });
      void toast({ message: t('Reminders saved'), duration: 1500, position: 'top' });
    } catch {
      void toast({
        message: t('Could not save'),
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
    }
  }

  return (
    <>
      {trainer && !initial.enabled && (
        <IonText color="warning">
          <p className="notif-muted">
            {clientName || t('This client')}{' '}
            {t("has paused reminders. Only reminders they can't change will arrive.")}
          </p>
        </IonText>
      )}
      <IonList lines="full">
        {!trainer && (
          <IonItem>
            <IonToggle checked={s.enabled} onIonChange={(e) => set('enabled', e.detail.checked)}>
              <strong>{t('All reminders')}</strong>
            </IonToggle>
          </IonItem>
        )}
        {MEALS.map((m) => (
          <IonItem key={m.key} disabled={timesDisabled}>
            <IonToggle
              slot="start"
              aria-label={m.label}
              checked={s[`${m.key}_on`]}
              onIonChange={(e) => set(`${m.key}_on`, e.detail.checked)}
            />
            <IonLabel>{m.label}</IonLabel>
            <IonInput
              slot="end"
              className="notif-time"
              type="time"
              aria-label={`${m.label} time`}
              disabled={!s[`${m.key}_on`]}
              value={s[`${m.key}_time`]}
              onIonInput={(e) => set(`${m.key}_time`, String(e.detail.value ?? ''))}
            />
          </IonItem>
        ))}
        <IonItem disabled={timesDisabled}>
          <IonToggle
            slot="start"
            aria-label={t('Workout reminder')}
            checked={Boolean(s.workout_reminder_time)}
            onIonChange={(e) => set('workout_reminder_time', e.detail.checked ? '18:00' : '')}
          />
          <IonLabel>{t('Workout')}</IonLabel>
          <IonInput
            slot="end"
            className="notif-time"
            type="time"
            aria-label={t('Workout reminder time')}
            disabled={!s.workout_reminder_time}
            value={s.workout_reminder_time}
            onIonInput={(e) => set('workout_reminder_time', String(e.detail.value ?? ''))}
          />
        </IonItem>
        {trainer && (
          <IonItem>
            <IonToggle
              checked={!s.meal_times_locked}
              onIonChange={(e) => set('meal_times_locked', !e.detail.checked)}
            >
              <IonLabel>
                <strong>{t('Client can change these')}</strong>
                <p>{t('Off = these times are fixed and arrive even if they pause reminders')}</p>
              </IonLabel>
            </IonToggle>
          </IonItem>
        )}
      </IonList>
      <IonText color="medium">
        <p className="notif-muted">
          {timesLocked ? t('Your trainer has set these times. ') : ''}
          {t('A reminder is sent only if')} {trainer ? t('they haven’t') : t('you haven’t')}{' '}
          {t("logged that meal (or today's workout) yet.")}
        </p>
      </IonText>
      <IonButton expand="block" disabled={save.isPending} onClick={() => void submit()}>
        {save.isPending ? t('Saving…') : t('Save reminders')}
      </IonButton>
    </>
  );
}
