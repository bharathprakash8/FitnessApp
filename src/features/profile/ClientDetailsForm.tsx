import {
  IonButton,
  IonChip,
  IonInput,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
} from '@ionic/react';
import { useState, type FormEvent } from 'react';

import { todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import type { ClientDetails } from './api';
import {
  CONDITION_LABELS,
  DIET_LABELS,
  GOAL_LABELS,
  SEX_LABELS,
  type Condition,
  type Diet,
  type Goal,
  type Sex,
} from './options';
import './profile.css';
import { tr, useT } from '../../i18n/i18n';

interface Props {
  profile: Profile;
  weightKg: number | null;
  submitLabel: string;
  busy: boolean;
  onSubmit: (details: ClientDetails) => void;
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

/** Date of birth, sex, height, weight, goal, diet, injuries, foods to avoid – for onboarding and "Edit my details". */
export function ClientDetailsForm({ profile, weightKg, submitLabel, busy, onSubmit }: Props) {
  const t = useT();
  const [dob, setDob] = useState(profile.date_of_birth ?? '');
  const [sex, setSex] = useState(profile.sex ?? '');
  const [height, setHeight] = useState(profile.height_cm?.toString() ?? '');
  const [weight, setWeight] = useState(weightKg?.toString() ?? '');
  const [goal, setGoal] = useState(profile.goal ?? '');
  const [goalOther, setGoalOther] = useState(profile.goal_other ?? '');
  const [diet, setDiet] = useState(profile.diet_preference ?? '');
  const [injuries, setInjuries] = useState(profile.injuries ?? '');
  const [avoid, setAvoid] = useState(profile.foods_to_avoid ?? '');
  const [conditions, setConditions] = useState<string[]>(profile.health_conditions ?? []);
  const [doctorOk, setDoctorOk] = useState<string>(
    profile.doctor_ok === null ? '' : profile.doctor_ok ? 'yes' : 'no',
  );
  const [error, setError] = useState<string | null>(null);

  const today = todayIn(profile.timezone);

  function submit(e: FormEvent) {
    e.preventDefault();
    const h = num(height);
    const w = num(weight);
    const problem =
      (!dob && 'Please enter your date of birth.') ||
      ((dob < '1920-01-01' || dob > today) && 'Please check your date of birth.') ||
      (!sex && 'Please choose an option for sex.') ||
      (!(h >= 100 && h <= 230) && 'Please enter your height in cm (100–230).') ||
      (!(w >= 30 && w <= 250) && 'Please enter your weight in kg (30–250).') ||
      (!goal && 'Please choose your goal.') ||
      (goal === 'other' && !goalOther.trim() && 'Please describe your goal.') ||
      (!diet && 'Please choose your diet preference.') ||
      null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSubmit({
      date_of_birth: dob,
      sex,
      height_cm: Math.round(h * 10) / 10,
      weight_kg: Math.round(w * 10) / 10,
      goal,
      goal_other: goal === 'other' ? goalOther.trim() : null,
      diet_preference: diet,
      injuries: injuries.trim() || null,
      foods_to_avoid: avoid.trim().slice(0, 300) || null,
      health_conditions: conditions,
      doctor_ok: conditions.length && doctorOk ? doctorOk === 'yes' : null,
    });
  }

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <IonInput
        fill="outline"
        label={t('Date of birth')}
        labelPlacement="stacked"
        type="date"
        max={today}
        min="1920-01-01"
        value={dob}
        onIonInput={(e) => setDob(String(e.detail.value ?? ''))}
      />

      <div>
        <IonText color="medium">
          <p className="profile-label">{t('Sex')}</p>
        </IonText>
        <IonSegment value={sex} onIonChange={(e) => setSex(String(e.detail.value))}>
          {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
            <IonSegmentButton key={s} value={s}>
              <IonLabel>{tr(SEX_LABELS[s])}</IonLabel>
            </IonSegmentButton>
          ))}
        </IonSegment>
      </div>

      <div className="profile-row">
        <IonInput
          fill="outline"
          label={t('Height (cm)')}
          labelPlacement="floating"
          type="number"
          inputmode="decimal"
          value={height}
          onIonInput={(e) => setHeight(String(e.detail.value ?? ''))}
        />
        <IonInput
          fill="outline"
          label={t('Weight (kg)')}
          labelPlacement="floating"
          type="number"
          inputmode="decimal"
          value={weight}
          onIonInput={(e) => setWeight(String(e.detail.value ?? ''))}
        />
      </div>

      <IonSelect
        fill="outline"
        label={t('Your goal')}
        labelPlacement="floating"
        interface="action-sheet"
        interfaceOptions={{ header: t('Your goal') }}
        value={goal || undefined}
        onIonChange={(e) => setGoal(String(e.detail.value))}
      >
        {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
          <IonSelectOption key={g} value={g}>
            {tr(GOAL_LABELS[g])}
          </IonSelectOption>
        ))}
      </IonSelect>
      {goal === 'other' && (
        <IonInput
          fill="outline"
          label={t('Describe your goal')}
          labelPlacement="floating"
          maxlength={200}
          value={goalOther}
          onIonInput={(e) => setGoalOther(String(e.detail.value ?? ''))}
        />
      )}

      <IonSelect
        fill="outline"
        label={t('Diet preference')}
        labelPlacement="floating"
        interface="action-sheet"
        interfaceOptions={{ header: t('Diet preference') }}
        value={diet || undefined}
        onIonChange={(e) => setDiet(String(e.detail.value))}
      >
        {(Object.keys(DIET_LABELS) as Diet[]).map((d) => (
          <IonSelectOption key={d} value={d}>
            {tr(DIET_LABELS[d])}
          </IonSelectOption>
        ))}
      </IonSelect>

      <IonTextarea
        fill="outline"
        label={t('Injuries or pain we should know about (optional)')}
        labelPlacement="floating"
        autoGrow
        maxlength={1000}
        value={injuries}
        onIonInput={(e) => setInjuries(String(e.detail.value ?? ''))}
      />

      <div>
        <IonText color="medium">
          <p className="profile-label">{t('Health conditions (optional)')}</p>
        </IonText>
        <div className="profile-chips">
          {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => {
            const on = conditions.includes(c);
            return (
              <IonChip
                key={c}
                color={on ? 'primary' : 'medium'}
                outline={!on}
                onClick={() =>
                  setConditions(on ? conditions.filter((x) => x !== c) : [...conditions, c])
                }
              >
                {on ? '✓ ' : ''}
                {tr(CONDITION_LABELS[c])}
              </IonChip>
            );
          })}
        </div>
        {conditions.length > 0 && (
          <>
            <IonText color="medium">
              <p className="profile-label">{t('Has your doctor said exercise is OK for you?')}</p>
            </IonText>
            <IonSegment value={doctorOk} onIonChange={(e) => setDoctorOk(String(e.detail.value))}>
              <IonSegmentButton value="yes">
                <IonLabel>{t('Yes')}</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="no">
                <IonLabel>{t('Not yet')}</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </>
        )}
      </div>

      <IonTextarea
        fill="outline"
        label={t('Foods to avoid – allergies or dislikes (optional)')}
        labelPlacement="floating"
        autoGrow
        maxlength={300}
        value={avoid}
        onIonInput={(e) => setAvoid(String(e.detail.value ?? ''))}
      />

      {error && (
        <IonText color="danger" role="alert">
          <p className="profile-note">{error}</p>
        </IonText>
      )}
      <IonButton type="submit" expand="block" size="large" disabled={busy}>
        {busy ? t('Saving…') : submitLabel}
      </IonButton>
    </form>
  );
}
