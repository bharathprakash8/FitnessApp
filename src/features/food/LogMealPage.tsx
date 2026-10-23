import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { camera, images } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { compressImage } from '../../lib/image';
import { useOnline } from '../../lib/network';
import { useAuth } from '../auth/useAuth';
import { analyzeMeal, itemsJson, uploadMealPhoto, useSaveMeal, type Analysis } from './api';
import { MealEditor, type MealEditorValues } from './MealEditor';
import { localToIso, mealTypeForHour, nowIn, totalsOf, type MealSource } from './model';
import './food.css';
import { useT } from '../../i18n/i18n';

type Stage = 'input' | 'working' | 'review';

/** Log a meal: photo → AI estimate, text → AI estimate, or manual entry. */
export function LogMealPage() {
  const tx = useT();
  const { mode } = useParams<{ mode: string }>();
  const source: MealSource = mode === 'text' ? 'text' : mode === 'manual' ? 'manual' : 'photo';
  const { search } = useLocation();
  const { profile } = useAuth();
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const now = nowIn(tz);
  const day = new URLSearchParams(search).get('day') || now.date;
  const initialTime = day === now.date ? now.time : '13:00';
  const initialType = mealTypeForHour(Number(initialTime.slice(0, 2)));

  const router = useIonRouter();
  const [toast] = useIonToast();
  const save = useSaveMeal();
  const online = useOnline();
  const [stage, setStage] = useState<Stage>(source === 'manual' ? 'review' : 'input');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [answering, setAnswering] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  if (!profile) return null;
  const clientId = profile.id;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage('working');
    try {
      setStatus('Preparing photo…');
      const small = await compressImage(file);
      setPreview(URL.createObjectURL(small));
      setStatus('Uploading…');
      const path = await uploadMealPhoto(clientId, day, small);
      setPhotoPath(path);
      setStatus('Estimating calories…');
      setAnalysis(await analyzeMeal({ photo_path: path, meal_type: initialType }));
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStage('input');
    }
  }

  async function onText() {
    if (!text.trim()) return setError('Describe what you ate.');
    setError(null);
    setStage('working');
    setStatus('Estimating calories…');
    try {
      setAnalysis(await analyzeMeal({ text: text.trim(), meal_type: initialType }));
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStage('input');
    }
  }

  async function onAnswer(answer: string) {
    if (!analysis?.follow_up_question) return;
    setAnswering(true);
    try {
      const next = await analyzeMeal({
        photo_path: photoPath ?? undefined,
        text: text.trim() || undefined,
        meal_type: initialType,
        follow_up: { question: analysis.follow_up_question, answer },
      });
      setAnalysis(next);
      setEditorKey((k) => k + 1);
    } catch (err) {
      void toast({
        message: err instanceof Error ? err.message : 'Could not update the estimate',
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setAnswering(false);
    }
  }

  async function onSave(v: MealEditorValues) {
    const t = totalsOf(v.items);
    try {
      const result = await save.mutateAsync({
        client_id: clientId,
        eaten_on: v.date,
        eaten_at: localToIso(v.date, v.time, tz),
        meal_type: v.mealType,
        source: analysis ? source : 'manual',
        photo_path: photoPath,
        input_text: text.trim() || null,
        items: itemsJson(v.items),
        total_calories: t.calories,
        protein_g: t.protein_g,
        carbs_g: t.carbs_g,
        fat_g: t.fat_g,
        edited: Boolean(analysis) && v.edited,
      });
      void toast({
        message:
          result === 'offline' ? 'Saved offline – will sync when you’re back online' : 'Meal saved',
        duration: result === 'offline' ? 3000 : 1500,
        position: 'top',
      });
      router.push('/food', 'back');
    } catch {
      void toast({
        message: tx("Couldn't save the meal – check your internet and try again."),
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
    }
  }

  const title =
    source === 'photo' ? 'Snap your meal' : source === 'text' ? 'Describe your meal' : 'Add a meal';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/food" />
          </IonButtons>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="food-page">
          {!online && source !== 'manual' && stage === 'input' && (
            <div className="offline-note">
              <p>
                {tx(
                  "You're offline. Photo and text estimates need the internet – you can enter the meal yourself now and it will sync later.",
                )}
              </p>
              <IonButton size="small" routerLink="/food/new/manual" routerDirection="forward">
                {tx('Enter manually')}
              </IonButton>
            </div>
          )}
          {preview && <img src={preview} alt={tx('Your meal')} className="food-preview" />}

          {stage === 'input' && source === 'photo' && (
            <>
              <p className="food-muted">
                {tx(
                  'Photograph only your food, from above, with everything on the plate visible. Photos are deleted after 7 days.',
                )}
              </p>
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => void onPhoto(e.target.files?.[0])}
              />
              <input
                ref={galleryInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onPhoto(e.target.files?.[0])}
              />
              <IonButton expand="block" size="large" onClick={() => cameraInput.current?.click()}>
                <IonIcon slot="start" icon={camera} />
                {tx('Take photo')}
              </IonButton>
              <IonButton
                expand="block"
                fill="outline"
                onClick={() => galleryInput.current?.click()}
              >
                <IonIcon slot="start" icon={images} />
                {tx('Choose from gallery')}
              </IonButton>
            </>
          )}

          {stage === 'input' && source === 'text' && (
            <>
              <IonTextarea
                fill="outline"
                label={tx('What did you eat?')}
                labelPlacement="floating"
                placeholder={tx('e.g. 2 chapati, 1 bowl dal, bhindi sabzi, curd')}
                autoGrow
                rows={3}
                maxlength={1000}
                value={text}
                onIonInput={(e) => setText(String(e.detail.value ?? ''))}
              />
              <IonButton
                expand="block"
                size="large"
                style={{ marginTop: 12 }}
                onClick={() => void onText()}
              >
                {tx('Estimate calories')}
              </IonButton>
            </>
          )}

          {stage === 'working' && (
            <div className="ion-text-center" style={{ padding: 24 }}>
              <IonSpinner name="crescent" />
              <p>{status}</p>
            </div>
          )}

          {error && stage === 'input' && (
            <>
              <IonText color="danger" role="alert">
                <p>{error}</p>
              </IonText>
              <IonButton expand="block" fill="clear" onClick={() => setStage('review')}>
                {tx('Enter it manually instead')}
              </IonButton>
            </>
          )}

          {stage === 'review' && (
            <>
              {analysis && analysis.items.length === 0 && (
                <IonText color="warning">
                  <p>{tx('No food was recognised. Add the items yourself below.')}</p>
                </IonText>
              )}
              <MealEditor
                key={editorKey}
                initialItems={analysis?.items ?? []}
                initialMealType={initialType}
                initialDate={day}
                initialTime={initialTime}
                maxDate={now.date}
                estimated={Boolean(analysis)}
                followUp={
                  analysis?.follow_up_question
                    ? {
                        question: analysis.follow_up_question,
                        options: analysis.follow_up_options,
                        onAnswer: (a) => void onAnswer(a),
                        busy: answering,
                      }
                    : null
                }
                busy={save.isPending}
                saveLabel="Save meal"
                onSave={(v) => void onSave(v)}
              />
              {analysis && (
                <p className="food-muted ion-text-center">
                  {analysis.remaining_today} {tx('AI estimates left today')}
                </p>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
