import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { formatDate } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useWorkoutLogs } from './api';
import { personalBests, type LogWithExercise } from './model';
import { WorkoutHistoryList } from './WorkoutHistoryList';
import './workouts.css';

type Tab = 'history' | 'bests';

export function WorkoutHistoryPage() {
  const { profile } = useAuth();
  const logs = useWorkoutLogs(profile?.id);
  const [tab, setTab] = useState<Tab>('history');

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/workouts" />
          </IonButtons>
          <IonTitle>My workouts</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
            <IonSegmentButton value="history">
              <IonLabel>History</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="bests">
              <IonLabel>Personal bests</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="workout-page">
          {logs.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : tab === 'history' ? (
            <WorkoutHistoryList logs={logs.data ?? []} emptyText="No workouts logged yet." />
          ) : (
            <Bests logs={logs.data ?? []} />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Bests({ logs }: { logs: LogWithExercise[] }) {
  const bests = personalBests(logs);
  if (bests.length === 0) {
    return (
      <IonText color="medium">
        <p className="ion-text-center">Your personal bests appear here once you log sets.</p>
      </IonText>
    );
  }
  return (
    <IonList inset>
      {bests.map((b) => (
        <IonItem key={b.exerciseId}>
          <IonLabel>
            <h3>{b.name}</h3>
            <p>{formatDate(b.date)}</p>
          </IonLabel>
          <IonNote slot="end" color="dark">
            <strong>{b.text}</strong>
          </IonNote>
        </IonItem>
      ))}
    </IonList>
  );
}
