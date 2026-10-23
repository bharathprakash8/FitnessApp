import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonPage,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { add, camera } from 'ionicons/icons';
import { useRef, useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { DEFAULT_TIMEZONE, todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useAddMeasurement } from './api';
import { ProgressView } from './ProgressView';
import './progress.css';
import { useT } from '../../i18n/i18n';

/** Me → Progress (clients, and trainers for themselves). */
export function ProgressPage() {
  const t = useT();
  const { profile } = useAuth();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>{t('Progress')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <IonButton expand="block" routerLink="/me/progress/new">
          <IonIcon slot="start" icon={add} />
          {t('Add measurement')}
        </IonButton>
        {profile && <ProgressView person={profile} editable />}
      </IonContent>
    </IonPage>
  );
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Me → Progress → Add: weight, waist, a note and up to 3 photos. */
export function AddMeasurementPage() {
  const t = useT();
  const { profile } = useAuth();
  const save = useAddMeasurement(profile?.id);
  const router = useIonRouter();
  const [toast] = useIonToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayIn(profile?.timezone ?? DEFAULT_TIMEZONE));
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);

  const fail = (message: string) =>
    void toast({ message, duration: 3500, color: 'danger', position: 'top' });

  async function submit() {
    const w = num(weight);
    const c = num(waist);
    if (w === null && c === null && photos.length === 0 && !notes.trim()) {
      return fail('Enter a weight, a waist size or add photos.');
    }
    if (w !== null && !(w >= 20 && w <= 400)) return fail('Weight must be 20–400 kg.');
    if (c !== null && !(c >= 30 && c <= 250)) return fail('Waist must be 30–250 cm.');
    try {
      await save.mutateAsync({
        measured_on: date,
        weight_kg: w,
        waist_cm: c,
        notes: notes.trim() || null,
        photos,
      });
      void toast({ message: t('Saved'), duration: 1500, position: 'top' });
      router.goBack();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not save. Try again.');
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me/progress" />
          </IonButtons>
          <IonTitle>{t('Add measurement')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="progress-page progress-form">
          <IonInput
            fill="outline"
            label={t('Date')}
            labelPlacement="stacked"
            type="date"
            value={date}
            onIonInput={(e) => setDate(String(e.detail.value ?? ''))}
          />
          <div className="progress-row">
            <IonInput
              fill="outline"
              label={t('Weight (kg)')}
              labelPlacement="floating"
              type="number"
              inputmode="decimal"
              value={weight}
              onIonInput={(e) => setWeight(String(e.detail.value ?? ''))}
            />
            <IonInput
              fill="outline"
              label={t('Waist (cm)')}
              labelPlacement="floating"
              type="number"
              inputmode="decimal"
              value={waist}
              onIonInput={(e) => setWaist(String(e.detail.value ?? ''))}
            />
          </div>
          <IonTextarea
            fill="outline"
            label={t('Note (optional)')}
            labelPlacement="floating"
            autoGrow
            maxlength={1000}
            value={notes}
            onIonInput={(e) => setNotes(String(e.detail.value ?? ''))}
          />

          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])].slice(0, 3);
                setPhotos(files);
                e.target.value = '';
              }}
            />
            <IonButton fill="outline" expand="block" onClick={() => fileInput.current?.click()}>
              <IonIcon slot="start" icon={camera} />
              {photos.length
                ? `${photos.length} photo(s) chosen – change`
                : t('Add progress photos (up to 3)')}
            </IonButton>
            <IonText color="medium">
              <p className="progress-note">
                {t(
                  'Front, side and back work best, in the same light each time. Photos are private: only you, your trainer and the admin can see them. You can add photos once a week.',
                )}
              </p>
            </IonText>
          </div>

          <IonButton
            expand="block"
            size="large"
            disabled={save.isPending}
            onClick={() => void submit()}
          >
            {save.isPending ? t('Saving…') : t('Save')}
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}
