import {
  IonButton,
  IonChip,
  IonIcon,
  IonInput,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { add, closeOutline } from 'ionicons/icons';
import { useState } from 'react';

import {
  MEAL_LABELS,
  MEAL_TYPES,
  emptyItem,
  scaleItem,
  totalsOf,
  type MealItem,
  type MealType,
} from './model';
import './food.css';

const FACTORS = [0.5, 1, 1.5, 2];

interface Row {
  item: MealItem;
  factor: number;
}

export interface MealEditorValues {
  items: MealItem[];
  mealType: MealType;
  date: string;
  time: string;
  edited: boolean;
}

/**
 * Review and edit a meal before saving: items with portion stepper and free edit,
 * meal type, date and time. AI numbers are always labelled "Estimated".
 */
export function MealEditor({
  initialItems,
  initialMealType,
  initialDate,
  initialTime,
  maxDate,
  estimated,
  followUp,
  busy,
  saveLabel,
  onSave,
}: {
  initialItems: MealItem[];
  initialMealType: MealType;
  initialDate: string;
  initialTime: string;
  maxDate: string;
  estimated: boolean;
  followUp?: {
    question: string;
    options: string[];
    onAnswer: (a: string) => void;
    busy: boolean;
  } | null;
  busy: boolean;
  saveLabel: string;
  onSave: (v: MealEditorValues) => void;
}) {
  const [rows, setRows] = useState<Row[]>(
    (initialItems.length ? initialItems : [emptyItem()]).map((item) => ({ item, factor: 1 })),
  );
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [edited, setEdited] = useState(false);
  const [freeAnswer, setFreeAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const items = rows.map((r) => r.item);
  const totals = totalsOf(items);

  function update(i: number, patch: Partial<MealItem>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, item: { ...r.item, ...patch } } : r)));
    setEdited(true);
  }

  function setFactor(i: number, factor: number) {
    setRows((rs) =>
      rs.map((r, j) => (j === i ? { item: scaleItem(r.item, factor / r.factor), factor } : r)),
    );
    setEdited(true);
  }

  function save() {
    const clean = items
      .map((it) => ({ ...it, name: it.name.trim(), portion: it.portion.trim() }))
      .filter((it) => it.name || it.calories);
    if (clean.length === 0) return setError('Add at least one food item.');
    if (clean.some((it) => !it.name)) return setError('Every item needs a name.');
    if (!date || date > maxDate) return setError('Please pick a date that is not in the future.');
    setError(null);
    onSave({ items: clean, mealType, date, time: time || '12:00', edited });
  }

  const num = (v: unknown) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return (
    <div>
      {followUp && (
        <div className="food-followup">
          <p>{followUp.question}</p>
          {followUp.busy ? (
            <IonSpinner name="dots" />
          ) : (
            <>
              <div className="food-steps">
                {followUp.options.map((o) => (
                  <IonChip key={o} color="primary" onClick={() => followUp.onAnswer(o)}>
                    <IonLabel>{o}</IonLabel>
                  </IonChip>
                ))}
              </div>
              <div className="food-item-head">
                <IonInput
                  fill="outline"
                  placeholder="Or type your answer"
                  value={freeAnswer}
                  onIonInput={(e) => setFreeAnswer(String(e.detail.value ?? ''))}
                />
                <IonButton
                  disabled={!freeAnswer.trim()}
                  onClick={() => followUp.onAnswer(freeAnswer.trim())}
                >
                  Send
                </IonButton>
              </div>
            </>
          )}
        </div>
      )}

      {estimated && (
        <p>
          <span className="food-estimated">Estimated</span>{' '}
          <span className="food-muted">AI guesses – please check and adjust.</span>
        </p>
      )}

      {rows.map((r, i) => (
        <div key={i} className="food-item">
          <div className="food-item-head">
            <IonInput
              fill="outline"
              label="Food"
              labelPlacement="stacked"
              maxlength={80}
              value={r.item.name}
              onIonInput={(e) => update(i, { name: String(e.detail.value ?? '') })}
            />
            <IonButton
              fill="clear"
              color="medium"
              aria-label="Remove item"
              onClick={() => {
                setRows((rs) => rs.filter((_, j) => j !== i));
                setEdited(true);
              }}
            >
              <IonIcon icon={closeOutline} />
            </IonButton>
          </div>
          <IonInput
            fill="outline"
            label="Portion"
            labelPlacement="stacked"
            maxlength={80}
            placeholder="e.g. 2 pieces, 1 bowl"
            value={r.item.portion}
            onIonInput={(e) => update(i, { portion: String(e.detail.value ?? '') })}
            style={{ marginTop: 8 }}
          />
          <div className="food-steps">
            {FACTORS.map((f) => (
              <IonChip
                key={f}
                outline={r.factor !== f}
                color={r.factor === f ? 'primary' : 'medium'}
                onClick={() => setFactor(i, f)}
              >
                <IonLabel>×{f}</IonLabel>
              </IonChip>
            ))}
          </div>
          <div className="food-grid">
            {(
              [
                ['calories', 'kcal'],
                ['protein_g', 'P (g)'],
                ['carbs_g', 'C (g)'],
                ['fat_g', 'F (g)'],
              ] as const
            ).map(([field, label]) => (
              <IonInput
                key={field}
                fill="outline"
                label={label}
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                value={String(r.item[field])}
                onIonInput={(e) => update(i, { [field]: num(e.detail.value) })}
              />
            ))}
          </div>
        </div>
      ))}

      <IonButton
        fill="clear"
        size="small"
        onClick={() => {
          setRows((rs) => [...rs, { item: emptyItem(), factor: 1 }]);
          setEdited(true);
        }}
      >
        <IonIcon slot="start" icon={add} />
        Add item
      </IonButton>

      <div className="food-totals">
        <span>Total {estimated ? '(estimated)' : ''}</span>
        <span>
          {totals.calories} kcal · P {Math.round(totals.protein_g)} · C {Math.round(totals.carbs_g)}{' '}
          · F {Math.round(totals.fat_g)}
        </span>
      </div>

      <div
        className="food-grid"
        style={{ gridTemplateColumns: '1.2fr 1fr 0.8fr', marginBottom: 12 }}
      >
        <IonSelect
          fill="outline"
          label="Meal"
          labelPlacement="stacked"
          interface="popover"
          value={mealType}
          onIonChange={(e) => setMealType(e.detail.value as MealType)}
        >
          {MEAL_TYPES.map((t) => (
            <IonSelectOption key={t} value={t}>
              {MEAL_LABELS[t]}
            </IonSelectOption>
          ))}
        </IonSelect>
        <IonInput
          fill="outline"
          label="Date"
          labelPlacement="stacked"
          type="date"
          max={maxDate}
          value={date}
          onIonInput={(e) => setDate(String(e.detail.value ?? ''))}
        />
        <IonInput
          fill="outline"
          label="Time"
          labelPlacement="stacked"
          type="time"
          value={time}
          onIonInput={(e) => setTime(String(e.detail.value ?? ''))}
        />
      </div>

      {error && (
        <IonText color="danger" role="alert">
          <p>{error}</p>
        </IonText>
      )}
      <IonButton expand="block" size="large" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : saveLabel}
      </IonButton>
    </div>
  );
}
