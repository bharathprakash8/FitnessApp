import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonRouter,
  useIonToast,
} from '@ionic/react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { useLatestWeight, useSaveClientDetails } from './api';
import { ClientDetailsForm } from './ClientDetailsForm';
import './profile.css';

/** Client: edit the answers given during onboarding. */
export function MyDetailsPage() {
  const { profile } = useAuth();
  const weight = useLatestWeight(profile?.id);
  const save = useSaveClientDetails(profile);
  const router = useIonRouter();
  const [toast] = useIonToast();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>My details</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="profile-page">
          {!profile || weight.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : (
            <ClientDetailsForm
              key={`${profile.id}:${weight.data?.id ?? 'none'}`}
              profile={profile}
              weightKg={weight.data?.weight_kg ?? null}
              submitLabel="Save"
              busy={save.isPending}
              onSubmit={(details) =>
                save
                  .mutateAsync({ details, previousWeight: weight.data?.weight_kg ?? null })
                  .then(() => {
                    void toast({ message: 'Saved', duration: 1500, position: 'top' });
                    router.goBack();
                  })
                  .catch(() =>
                    toast({
                      message: 'Could not save. Try again.',
                      duration: 3000,
                      color: 'danger',
                      position: 'top',
                    }),
                  )
              }
            />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
