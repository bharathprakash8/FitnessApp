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
import { useT } from '../../i18n/i18n';

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
  const t = useT();
  return (
    <IonCard className="targets-card">
      <IonCardHeader>
        <IonCardSubtitle>{t('Daily targets')}</IonCardSubtitle>
        {target ? (
          <IonCardTitle className="targets-kcal">
            {target.calories.toLocaleString('en-IN')} <span>{t('kcal')}</span>
          </IonCardTitle>
        ) : (
          <IonCardTitle className="targets-empty">{emptyText}</IonCardTitle>
        )}
      </IonCardHeader>
      {target && (
        <IonCardContent>
          <div className="targets-macros">
            <Macro label={t('Protein')} grams={target.protein_g} />
            <Macro label={t('Carbs')} grams={target.carbs_g} />
            <Macro label={t('Fat')} grams={target.fat_g} />
          </div>
          <p className="targets-since">
            {t('Since')} {formatDate(target.effective_from)}
          </p>
        </IonCardContent>
      )}
      {upcoming && (
        <IonCardContent>
          <p className="targets-since">
            {t('From')} {formatDate(upcoming.effective_from)}:{' '}
            {upcoming.calories.toLocaleString('en-IN')} {t('kcal · P')} {upcoming.protein_g} g · C{' '}
            {upcoming.carbs_g} g · F {upcoming.fat_g} g
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
