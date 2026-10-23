import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import { trashOutline } from 'ionicons/icons';
import { useState, type FormEvent } from 'react';

import { ageFrom, formatDate, todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { useLatestWeight } from '../profile/api';
import type { Goal, Sex } from '../profile/options';
import { currentTarget, useDeleteTarget, useSetTarget, useTargets } from '../targets/api';
import {
  ACTIVITY_LABELS,
  estimateTargets,
  macroCalories,
  macrosMismatch,
  type Activity,
} from '../targets/estimate';
import { tr, useT } from '../../i18n/i18n';

const toInt = (v: string) => (v.trim() === '' ? NaN : Math.round(Number(v)));

export function TargetsTab({ client }: { client: Profile }) {
  const targets = useTargets(client.id);
  const weight = useLatestWeight(client.id);
  if (targets.isPending || weight.isPending) {
    return (
      <div className="ion-text-center">
        <IonSpinner name="crescent" />
      </div>
    );
  }
  // Mount the editor once data is loaded so the form starts from the current targets.
  return <TargetsEditor client={client} />;
}

function TargetsEditor({ client }: { client: Profile }) {
  const tx = useT();
  const { profile: me } = useAuth();
  const targets = useTargets(client.id);
  const weight = useLatestWeight(client.id);
  const setTarget = useSetTarget(client.id);
  const deleteTarget = useDeleteTarget(client.id);
  const [alert] = useIonAlert();
  const [toast] = useIonToast();

  const current = currentTarget(targets.data, client.timezone);
  const [from, setFrom] = useState(todayIn(client.timezone));
  const [activity, setActivity] = useState<Activity>('light');
  const [kcal, setKcal] = useState(current?.calories.toString() ?? '');
  const [protein, setProtein] = useState(current?.protein_g.toString() ?? '');
  const [carbs, setCarbs] = useState(current?.carbs_g.toString() ?? '');
  const [fat, setFat] = useState(current?.fat_g.toString() ?? '');
  // Water goal in litres (empty = the default 2.5 L)
  const [water, setWater] = useState(current?.water_ml ? String(current.water_ml / 1000) : '');
  const [estimated, setEstimated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = estimateTargets({
    weightKg: weight.data?.weight_kg ?? null,
    heightCm: client.height_cm,
    age: ageFrom(client.date_of_birth, client.timezone),
    sex: client.sex as Sex | null,
    goal: client.goal as Goal | null,
    activity,
  });

  const values = {
    calories: toInt(kcal),
    protein_g: toInt(protein),
    carbs_g: toInt(carbs),
    fat_g: toInt(fat),
  };
  const complete = Object.values(values).every((n) => Number.isFinite(n));
  const mismatch = complete && macrosMismatch(values);

  function applyEstimate() {
    if (!estimate) return;
    setKcal(String(estimate.calories));
    setProtein(String(estimate.protein_g));
    setCarbs(String(estimate.carbs_g));
    setFat(String(estimate.fat_g));
    setEstimated(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const problem =
      (!complete && 'Please fill in calories, protein, carbs and fat.') ||
      ((values.calories < 800 || values.calories > 6000) && 'Calories must be 800–6000.') ||
      ((values.protein_g < 0 || values.protein_g > 500) && 'Protein must be 0–500 g.') ||
      ((values.carbs_g < 0 || values.carbs_g > 1000) && 'Carbs must be 0–1000 g.') ||
      ((values.fat_g < 0 || values.fat_g > 400) && 'Fat must be 0–400 g.') ||
      (!from && 'Please pick a start date.') ||
      (water.trim() !== '' &&
        !(Number(water.replace(',', '.')) >= 0.5 && Number(water.replace(',', '.')) <= 8) &&
        'Water must be 0.5–8 litres.') ||
      null;
    if (problem || !me) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      await setTarget.mutateAsync({
        ...values,
        water_ml: water.trim() ? Math.round(Number(water.replace(',', '.')) * 1000) : null,
        effective_from: from,
        set_by: me.id,
      });
      setEstimated(false);
      void toast({ message: tx('Targets saved'), duration: 1800, position: 'top' });
    } catch {
      setError('Could not save the targets. Check your connection and try again.');
    }
  }

  function remove(id: string, when: string) {
    void alert({
      header: tx('Delete these targets?'),
      message: `The targets starting ${formatDate(when)} will be removed.`,
      buttons: [
        { text: tx('Cancel'), role: 'cancel' },
        {
          text: tx('Delete'),
          role: 'destructive',
          handler: () => {
            deleteTarget.mutate(id, {
              onError: () =>
                void toast({
                  message: tx('Could not delete'),
                  duration: 2500,
                  color: 'danger',
                  position: 'top',
                }),
            });
          },
        },
      ],
    });
  }

  return (
    <>
      <IonCard className="trainer-card">
        <IonCardHeader>
          <IonCardTitle>{tx('Set new targets')}</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <form className="trainer-form" onSubmit={save} noValidate>
            <div className="trainer-estimate">
              <IonSelect
                fill="outline"
                label={tx('Activity level (for the estimate)')}
                labelPlacement="stacked"
                interface="action-sheet"
                value={activity}
                onIonChange={(e) => setActivity(e.detail.value as Activity)}
              >
                {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => (
                  <IonSelectOption key={a} value={a}>
                    {tr(ACTIVITY_LABELS[a])}
                  </IonSelectOption>
                ))}
              </IonSelect>
              {estimate ? (
                <>
                  <IonText color="medium">
                    <p className="trainer-note">
                      {tx('Estimated:')} {estimate.calories} {tx('kcal · P')} {estimate.protein_g} g
                      · C {estimate.carbs_g} g · F {estimate.fat_g} g
                    </p>
                  </IonText>
                  <IonButton size="small" fill="outline" onClick={applyEstimate}>
                    {tx('Use estimate')}
                  </IonButton>
                </>
              ) : (
                <IonText color="medium">
                  <p className="trainer-note">
                    {tx('An estimate appears once the client has entered age, height and weight.')}
                  </p>
                </IonText>
              )}
            </div>

            <IonInput
              fill="outline"
              label={tx('Calories (kcal)')}
              labelPlacement="floating"
              type="number"
              inputmode="numeric"
              value={kcal}
              onIonInput={(e) => setKcal(String(e.detail.value ?? ''))}
            />
            <div className="trainer-row">
              <IonInput
                fill="outline"
                label={tx('Protein (g)')}
                labelPlacement="floating"
                type="number"
                inputmode="numeric"
                value={protein}
                onIonInput={(e) => setProtein(String(e.detail.value ?? ''))}
              />
              <IonInput
                fill="outline"
                label={tx('Carbs (g)')}
                labelPlacement="floating"
                type="number"
                inputmode="numeric"
                value={carbs}
                onIonInput={(e) => setCarbs(String(e.detail.value ?? ''))}
              />
              <IonInput
                fill="outline"
                label={tx('Fat (g)')}
                labelPlacement="floating"
                type="number"
                inputmode="numeric"
                value={fat}
                onIonInput={(e) => setFat(String(e.detail.value ?? ''))}
              />
            </div>
            {mismatch && (
              <IonText color="warning">
                <p className="trainer-note">
                  {tx('Protein, carbs and fat add up to')} {macroCalories(values)}{' '}
                  {tx('kcal, which is quite different from')} {values.calories}{' '}
                  {tx('kcal. You can still save.')}
                </p>
              </IonText>
            )}
            {estimated && !mismatch && (
              <IonText color="medium">
                <p className="trainer-note">{tx('These are estimates – adjust them if needed.')}</p>
              </IonText>
            )}
            <IonInput
              fill="outline"
              label={tx('Water per day (litres)')}
              labelPlacement="floating"
              type="number"
              inputmode="decimal"
              placeholder="2.5"
              value={water}
              onIonInput={(e) => setWater(String(e.detail.value ?? ''))}
            />
            <IonInput
              fill="outline"
              label={tx('Starts on')}
              labelPlacement="stacked"
              type="date"
              value={from}
              onIonInput={(e) => setFrom(String(e.detail.value ?? ''))}
            />
            {error && (
              <IonText color="danger" role="alert">
                <p className="trainer-note">{error}</p>
              </IonText>
            )}
            <IonButton type="submit" expand="block" disabled={setTarget.isPending}>
              {setTarget.isPending ? tx('Saving…') : tx('Save targets')}
            </IonButton>
          </form>
        </IonCardContent>
      </IonCard>

      <IonList inset style={{ margin: '16px 0' }}>
        <IonListHeader>
          <IonLabel>{tx('History')}</IonLabel>
        </IonListHeader>
        {(targets.data ?? []).length === 0 && (
          <IonItem lines="none">
            <IonLabel color="medium">{tx('No targets yet')}</IonLabel>
          </IonItem>
        )}
        {(targets.data ?? []).map((t) => (
          <IonItem key={t.id}>
            <IonLabel>
              <h3>
                {t.calories} {tx('kcal · P')} {t.protein_g} · C {t.carbs_g} · F {t.fat_g}
                {t.id === current?.id && tx(' (current)')}
              </h3>
              <p>
                {tx('From')} {formatDate(t.effective_from)}
              </p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              aria-label={tx('Delete these targets')}
              onClick={() => remove(t.id, t.effective_from)}
            >
              <IonIcon icon={trashOutline} />
            </IonButton>
          </IonItem>
        ))}
      </IonList>
    </>
  );
}
