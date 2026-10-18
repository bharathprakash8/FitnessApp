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

const litres = (ml: number) =>
  `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 2).replace(/0$/, '')} L`;

/** Today: water drunk vs goal, one glass (250 ml) at a time. Works offline. */
export function WaterCard({ profile }: { profile: Profile }) {
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
        void toast({ message: 'Could not save', duration: 2000, color: 'danger', position: 'top' }),
    });
  }

  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardSubtitle>
          <IonIcon icon={waterIcon} color="primary" style={{ verticalAlign: 'middle' }} /> Water
          today
          {water.offline ? ' · saved offline' : ''}
        </IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        <div className="water-glasses">
          <IonButton
            fill="outline"
            aria-label="Remove a glass"
            disabled={ml <= 0 || water.isPending}
            onClick={() => change(-GLASS_ML)}
          >
            <IonIcon slot="icon-only" icon={remove} />
          </IonButton>
          <div className="ion-text-center">
            <div className="water-amount">{litres(ml)}</div>
            <div className="progress-note">
              of {litres(goal)} · {Math.round(ml / GLASS_ML)} glasses
            </div>
          </div>
          <IonButton
            aria-label="Add a glass"
            disabled={water.isPending}
            onClick={() => change(GLASS_ML)}
          >
            <IonIcon slot="start" icon={add} />
            Glass
          </IonButton>
        </div>
        <IonProgressBar value={Math.min(1, ml / goal)} style={{ marginTop: 12 }} />
      </IonCardContent>
    </IonCard>
  );
}
