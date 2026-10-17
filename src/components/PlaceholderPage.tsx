import { IonContent, IonHeader, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react';

interface PlaceholderPageProps {
  title: string;
  message: string;
}

/** Temporary screen used until a milestone builds the real page. */
export function PlaceholderPage({ title, message }: PlaceholderPageProps) {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonText>
          <p>{message}</p>
        </IonText>
      </IonContent>
    </IonPage>
  );
}
