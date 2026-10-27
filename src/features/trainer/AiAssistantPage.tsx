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
import { AiCoachTab } from '../admin/AiCoachTab';
import { useAuth } from '../auth/useAuth';
import { useT } from '../../i18n/i18n';

/** Trainer: the AI assistant's suggestions and questions for their own clients. */
export function AiAssistantPage() {
  const t = useT();
  const { profile } = useAuth();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/trainer" />
          </IonButtons>
          <IonTitle>{t('AI assistant')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent>{profile && <AiCoachTab trainerId={profile.id} />}</IonContent>
    </IonPage>
  );
}
