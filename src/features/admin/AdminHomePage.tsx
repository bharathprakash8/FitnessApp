import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/react';
import { add } from 'ionicons/icons';
import { useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { useAdminUsers } from './api';
import { AppHealthTab } from './AppHealthTab';
import { AssignmentsView } from './AssignmentsView';
import { UsersList } from './UsersList';

type Tab = 'users' | 'assignments' | 'health';

export function AdminHomePage() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  // "Exercises" opens its own page; remount the segment so the current tab stays selected.
  const [segmentKey, setSegmentKey] = useState(0);
  const router = useIonRouter();
  const users = useAdminUsers();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Admin</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
            <IonButton onClick={() => void signOut()}>Log out</IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSegment
            key={segmentKey}
            scrollable
            value={tab}
            onIonChange={(e) => {
              if (e.detail.value === 'exercises') {
                router.push('/admin/exercises');
                setSegmentKey((k) => k + 1);
              } else {
                setTab(e.detail.value as Tab);
              }
            }}
          >
            <IonSegmentButton value="users">
              <IonLabel>Users</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="assignments">
              <IonLabel>Assignments</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="health">
              <IonLabel>App health</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="exercises">
              <IonLabel>Exercises</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) => void users.refetch().finally(() => e.detail.complete())}
        >
          <IonRefresherContent />
        </IonRefresher>

        {tab === 'users' ? (
          <UsersList query={users} />
        ) : tab === 'assignments' ? (
          <AssignmentsView query={users} />
        ) : (
          <AppHealthTab />
        )}

        {tab === 'users' && (
          <IonFab slot="fixed" vertical="bottom" horizontal="end">
            <IonFabButton routerLink="/admin/users/new" aria-label="Add user">
              <IonIcon icon={add} />
            </IonFabButton>
          </IonFab>
        )}
      </IonContent>
    </IonPage>
  );
}
