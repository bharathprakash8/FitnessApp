import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { DEFAULT_TIMEZONE, todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { itemsJson, useDeleteMeal, useMeal, usePhotoUrls, useSaveMeal } from './api';
import { MealEditor } from './MealEditor';
import { itemsOf, localToIso, timeIn, totalsOf, type MealType } from './model';
import './food.css';

/** Client: change or delete a saved meal. */
export function EditMealPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const meal = useMeal(id);
  const photos = usePhotoUrls(meal.data?.photo_path ? [meal.data.photo_path] : []);
  const save = useSaveMeal();
  const remove = useDeleteMeal();
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();

  const m = meal.data;
  const photo = m?.photo_path ? photos.data?.[m.photo_path] : undefined;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/food" />
          </IonButtons>
          <IonTitle>Edit meal</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="food-page">
          {meal.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !m ? (
            <IonText color="medium">
              <p className="ion-text-center">This meal no longer exists.</p>
            </IonText>
          ) : (
            <>
              {photo && <img src={photo} alt="Your meal" className="food-preview" />}
              <MealEditor
                key={m.id}
                initialItems={itemsOf(m)}
                initialMealType={m.meal_type as MealType}
                initialDate={m.eaten_on}
                initialTime={timeIn(m.eaten_at, tz)}
                maxDate={todayIn(tz)}
                estimated={m.source !== 'manual'}
                busy={save.isPending}
                saveLabel="Save changes"
                onSave={(v) => {
                  const t = totalsOf(v.items);
                  save
                    .mutateAsync({
                      id: m.id,
                      client_id: m.client_id,
                      eaten_on: v.date,
                      eaten_at: localToIso(v.date, v.time, tz),
                      meal_type: v.mealType,
                      source: m.source,
                      items: itemsJson(v.items),
                      total_calories: t.calories,
                      protein_g: t.protein_g,
                      carbs_g: t.carbs_g,
                      fat_g: t.fat_g,
                      edited: m.edited || v.edited,
                    })
                    .then(() => router.push('/food', 'back'))
                    .catch(() =>
                      toast({
                        message: 'Could not save',
                        duration: 2500,
                        color: 'danger',
                        position: 'top',
                      }),
                    );
                }}
              />
              <IonButton
                expand="block"
                fill="clear"
                color="danger"
                style={{ marginTop: 8 }}
                onClick={() =>
                  void alert({
                    header: 'Delete this meal?',
                    buttons: [
                      { text: 'Cancel', role: 'cancel' },
                      {
                        text: 'Delete',
                        role: 'destructive',
                        handler: () => {
                          remove.mutate(m, { onSuccess: () => router.push('/food', 'back') });
                        },
                      },
                    ],
                  })
                }
              >
                Delete meal
              </IonButton>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
