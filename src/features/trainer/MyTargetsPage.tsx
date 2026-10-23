import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { TargetsTab } from './TargetsTab';
import './trainer.css';
import { useT } from '../../i18n/i18n';

/** Trainer → My fitness: set your own calorie and macro targets (same editor as for clients). */
export function MyTargetsPage() {
  const t = useT();
  const { profile } = useAuth();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/today" />
          </IonButtons>
          <IonTitle>{t('My targets')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="trainer-page">{profile && <TargetsTab client={profile} />}</div>
      </IonContent>
    </IonPage>
  );
}
