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
} from '@ionic/react';
import { add } from 'ionicons/icons';
import { useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { useAdminUsers } from './api';
import { AssignmentsView } from './AssignmentsView';
import { UsersList } from './UsersList';

type Tab = 'users' | 'assignments';

export function AdminHomePage() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const users = useAdminUsers();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Admin</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => void signOut()}>Log out</IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
            <IonSegmentButton value="users">
              <IonLabel>Users</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="assignments">
              <IonLabel>Assignments</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) => void users.refetch().finally(() => e.detail.complete())}
        >
          <IonRefresherContent />
        </IonRefresher>

        {tab === 'users' ? <UsersList query={users} /> : <AssignmentsView query={users} />}

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
