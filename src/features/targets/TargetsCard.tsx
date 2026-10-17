import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
} from '@ionic/react';

import { formatDate } from '../../lib/dates';
import type { Target } from './api';
import './targets.css';

/** Daily calorie and macro targets. */
export function TargetsCard({
  target,
  upcoming,
  emptyText,
}: {
  target: Target | null;
  upcoming?: Target | null;
  emptyText: string;
}) {
  return (
    <IonCard className="targets-card">
      <IonCardHeader>
        <IonCardSubtitle>Daily targets</IonCardSubtitle>
        {target ? (
          <IonCardTitle className="targets-kcal">
            {target.calories.toLocaleString('en-IN')} <span>kcal</span>
          </IonCardTitle>
        ) : (
          <IonCardTitle className="targets-empty">{emptyText}</IonCardTitle>
        )}
      </IonCardHeader>
      {target && (
        <IonCardContent>
          <div className="targets-macros">
            <Macro label="Protein" grams={target.protein_g} />
            <Macro label="Carbs" grams={target.carbs_g} />
            <Macro label="Fat" grams={target.fat_g} />
          </div>
          <p className="targets-since">Since {formatDate(target.effective_from)}</p>
        </IonCardContent>
      )}
      {upcoming && (
        <IonCardContent>
          <p className="targets-since">
            From {formatDate(upcoming.effective_from)}: {upcoming.calories.toLocaleString('en-IN')}{' '}
            kcal · P {upcoming.protein_g} g · C {upcoming.carbs_g} g · F {upcoming.fat_g} g
          </p>
        </IonCardContent>
      )}
    </IonCard>
  );
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="targets-macro">
      <strong>{grams} g</strong>
      <span>{label}</span>
    </div>
  );
}
