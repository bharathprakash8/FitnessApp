import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonIcon,
  IonProgressBar,
  useIonToast,
} from '@ionic/react';
import { add, remove, water as waterIcon } from 'ionicons/icons';

import { DEFAULT_TIMEZONE, todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { currentTarget, useTargets } from '../targets/api';
import { DEFAULT_WATER_ML, GLASS_ML, useSetWater, useWater } from './api';
import './progress.css';
import { plural, useT } from '../../i18n/i18n';

/** 0 → "0 L", 250 → "0.25 L", 1500 → "1.5 L", 10000 → "10 L". */
const litres = (ml: number) => `${Number((ml / 1000).toFixed(2))} L`;

/** Today: water drunk vs goal, one glass (250 ml) at a time. Works offline. */
export function WaterCard({ profile }: { profile: Profile }) {
  const t = useT();
  const tz = profile.timezone ?? DEFAULT_TIMEZONE;
  const day = todayIn(tz);
  const water = useWater(profile.id, day);
  const setWater = useSetWater(profile.id, day);
  const targets = useTargets(profile.id);
  const [toast] = useIonToast();
  const goal = currentTarget(targets.data, tz)?.water_ml ?? DEFAULT_WATER_ML;
  const ml = water.data ?? 0;

  function change(delta: number) {
    setWater.mutate(ml + delta, {
      onError: () =>
        void toast({
          message: t('Could not save'),
          duration: 2000,
          color: 'danger',
          position: 'top',
        }),
    });
  }

  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardSubtitle>
          <IonIcon icon={waterIcon} color="primary" style={{ verticalAlign: 'middle' }} />{' '}
          {t('Water today')}
          {water.offline ? t(' · saved offline') : ''}
        </IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        <div className="water-glasses">
          <IonButton
            fill="outline"
            aria-label={t('Remove a glass')}
            disabled={ml <= 0 || water.isPending}
            onClick={() => change(-GLASS_ML)}
          >
            <IonIcon slot="icon-only" icon={remove} />
          </IonButton>
          <div className="ion-text-center">
            <div className="water-amount">{litres(ml)}</div>
            <div className="progress-note">
              {t('of {goal}', { goal: litres(goal) })} ·{' '}
              {plural(Math.round(ml / GLASS_ML), '{n} glass', '{n} glasses')}
            </div>
          </div>
          <IonButton
            aria-label={t('Add a glass')}
            disabled={water.isPending}
            onClick={() => change(GLASS_ML)}
          >
            <IonIcon slot="start" icon={add} />
            {t('Glass')}
          </IonButton>
        </div>
        <IonProgressBar value={Math.min(1, ml / goal)} style={{ marginTop: 12 }} />
      </IonCardContent>
    </IonCard>
  );
}
