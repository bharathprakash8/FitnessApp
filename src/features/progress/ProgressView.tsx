import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonAlert,
} from '@ionic/react';
import { trashOutline } from 'ionicons/icons';
import { useMemo, useState } from 'react';

import { DEFAULT_TIMEZONE, formatDate, todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { currentTarget, useTargets } from '../targets/api';
import { useWorkoutLogs } from '../workouts/api';
import {
  useDailyCalories,
  useDeleteMeasurement,
  useMeasurements,
  useProgressPhotoUrls,
  type Measurement,
} from './api';
import { BarChart, LineChart } from './Charts';
import './progress.css';
import { useT } from '../../i18n/i18n';

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const isoWeekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Charts, measurements and progress photos – the person's own (editable) or a client's. */
export function ProgressView({ person, editable }: { person: Profile; editable: boolean }) {
  const t = useT();
  const tz = person.timezone ?? DEFAULT_TIMEZONE;
  const today = todayIn(tz);
  const measurements = useMeasurements(person.id);
  const calories = useDailyCalories(person.id, today);
  const targets = useTargets(person.id);
  const logs = useWorkoutLogs(person.id);
  const target = currentTarget(targets.data, tz);

  const weights = useMemo(
    () =>
      (measurements.data ?? [])
        .filter((m) => m.weight_kg !== null && m.measured_on >= addDays(today, -180))
        .map((m) => ({ date: m.measured_on, value: Number(m.weight_kg) })),
    [measurements.data, today],
  );

  // Workout days per week, last 12 weeks (Monday-based)
  const perWeek = useMemo(() => {
    const thisMonday = addDays(today, 1 - isoWeekday(today));
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(thisMonday, (i - 11) * 7));
    const days = new Set((logs.data ?? []).map((l) => l.performed_on));
    return weeks.map((w) => ({
      date: w,
      value: Array.from({ length: 7 }, (_, d) => addDays(w, d)).filter((d) => days.has(d)).length,
    }));
  }, [logs.data, today]);

  if (measurements.isPending || calories.isPending) {
    return (
      <div className="ion-text-center">
        <IonSpinner name="crescent" />
      </div>
    );
  }

  return (
    <div className="progress-page">
      <ChartCard title={t('Weight (kg)')} subtitle="Last 6 months">
        <LineChart points={weights} unit="kg" label={t('Weight over time')} />
      </ChartCard>
      <ChartCard title={t('Calories eaten')} subtitle="Last 30 days">
        <BarChart
          points={calories.data?.eaten ?? []}
          target={target?.calories}
          label={t('Calories eaten per day')}
        />
      </ChartCard>
      <ChartCard title={t('Calories burnt')} subtitle="Last 30 days · from the phone or entered">
        <BarChart
          points={calories.data?.burnt ?? []}
          label={t('Calories burnt per day')}
          color="secondary"
        />
      </ChartCard>
      <ChartCard title={t('Workout days per week')} subtitle="Last 12 weeks">
        <BarChart points={perWeek} label={t('Workout days per week')} />
      </ChartCard>

      <h3>{t('Measurements and photos')}</h3>
      {(measurements.data ?? []).length === 0 ? (
        <p className="progress-empty">
          {editable ? t('No measurements yet – add your first one.') : t('No measurements yet.')}
        </p>
      ) : (
        measurements.data!.map((m) => (
          <MeasurementCard key={m.id} m={m} clientId={person.id} editable={editable} />
        ))
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <IonCard className="progress-card">
      <IonCardHeader>
        <IonCardSubtitle>{subtitle}</IonCardSubtitle>
        <IonCardTitle style={{ fontSize: '1.05rem' }}>{title}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>{children}</IonCardContent>
    </IonCard>
  );
}

function MeasurementCard({
  m,
  clientId,
  editable,
}: {
  m: Measurement;
  clientId: string;
  editable: boolean;
}) {
  const t = useT();
  const photos = useProgressPhotoUrls(m.photo_paths);
  const remove = useDeleteMeasurement(clientId);
  const [alert] = useIonAlert();
  const [open, setOpen] = useState<string | null>(null);
  const facts = [
    m.weight_kg !== null && `${Number(m.weight_kg)} kg`,
    m.waist_cm !== null && `waist ${Number(m.waist_cm)} cm`,
  ].filter(Boolean);

  return (
    <IonCard className="progress-card">
      <IonCardContent>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{formatDate(m.measured_on)}</strong>
          {editable && (
            <IonButton
              fill="clear"
              color="medium"
              size="small"
              aria-label={t('Delete this entry')}
              disabled={remove.isPending}
              onClick={() =>
                void alert({
                  header: t('Delete this entry?'),
                  message: m.photo_paths.length ? 'Its photos are deleted too.' : undefined,
                  buttons: [
                    { text: t('Cancel'), role: 'cancel' },
                    { text: t('Delete'), role: 'destructive', handler: () => remove.mutate(m) },
                  ],
                })
              }
            >
              <IonIcon icon={trashOutline} />
            </IonButton>
          )}
        </div>
        {facts.length > 0 && <p>{facts.join(' · ')}</p>}
        {m.notes && <p className="progress-note">{m.notes}</p>}
        {m.photo_paths.length > 0 && (
          <div className="progress-photos">
            {m.photo_paths.map((p) =>
              photos.data?.[p] ? (
                <img
                  key={p}
                  src={photos.data[p]}
                  alt={t('Progress photo')}
                  loading="lazy"
                  onClick={() => setOpen(photos.data![p]!)}
                />
              ) : null,
            )}
          </div>
        )}
      </IonCardContent>
      <IonModal isOpen={open !== null} onDidDismiss={() => setOpen(null)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>{formatDate(m.measured_on)}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setOpen(null)}>{t('Close')}</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          {open && <img src={open} alt={t('Progress photo')} className="photo-viewer" />}
        </IonContent>
      </IonModal>
    </IonCard>
  );
}
