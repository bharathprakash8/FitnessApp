import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonText } from '@ionic/react';

import { formatDate } from '../../lib/dates';
import { formatSet, groupByDate, type LogWithExercise } from './model';
import './workouts.css';

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
  const sessions = groupByDate(logs).slice(0, limitDays);
  if (sessions.length === 0) {
    return (
      <IonText color="medium">
        <p className="ion-text-center">{emptyText}</p>
      </IonText>
    );
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
                {ex.self && <span className="workout-self-tag">Self</span>}
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
