import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle } from '@ionic/react';
import { barbellOutline } from 'ionicons/icons';

import { EmptyState } from '../../components/EmptyState';
import { formatDate } from '../../lib/dates';
import { formatSet, groupByDate, type LogWithExercise } from './model';
import './workouts.css';
import { useT } from '../../i18n/i18n';

/** Logged sessions by date, used by the client (history) and the trainer (client detail). */
export function WorkoutHistoryList({
  logs,
  emptyText,
  limitDays,
}: {
  logs: LogWithExercise[];
  emptyText: string;
  limitDays?: number;
}) {
  const t = useT();
  const sessions = groupByDate(logs).slice(0, limitDays);
  if (sessions.length === 0) {
    return <EmptyState icon={barbellOutline} title={emptyText} />;
  }
  return (
    <>
      {sessions.map((s) => (
        <IonCard key={s.date} className="workout-card">
          <IonCardHeader>
            <IonCardSubtitle>{formatDate(s.date)}</IonCardSubtitle>
          </IonCardHeader>
          <IonCardContent>
            {s.exercises.map((ex) => (
              <p key={ex.key} style={{ margin: '0 0 6px' }}>
                <strong>{ex.name}</strong>
                {ex.self && <span className="workout-self-tag">{t('Self')}</span>}
                {ex.byTrainer && <span className="workout-self-tag">{t('Logged by trainer')}</span>}
                <br />
                <span className="workout-muted">
                  {ex.sets.map((set) => formatSet(set, ex.type)).join(' · ')}
                </span>
              </p>
            ))}
          </IonCardContent>
        </IonCard>
      ))}
    </>
  );
}
