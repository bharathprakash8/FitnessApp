import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import { useAuth } from '../features/auth/useAuth';

interface PlaceholderPageProps {
  title: string;
  message: string;
}

/** Temporary home screen used until a milestone builds the real page. */
export function PlaceholderPage({ title, message }: PlaceholderPageProps) {
  const { profile, signOut } = useAuth();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => void signOut()}>Log out</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonText>
          <h2>Hi {profile?.full_name || profile?.email}!</h2>
          <p>{message}</p>
        </IonText>
      </IonContent>
    </IonPage>
  );
}
