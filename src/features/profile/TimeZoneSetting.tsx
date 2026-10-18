import { IonButton, IonItem, IonList, IonSelect, IonSelectOption, useIonToast } from '@ionic/react';

import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { deviceTimeZone, timeZoneLabel, zoneOptions } from '../../lib/timezones';
import type { Profile } from '../auth/roles';
import { useSaveTimeZone } from './api';

/** Me page: the user's time zone, with a one-tap "use my phone's" when they differ. */
export function TimeZoneSetting({ profile }: { profile: Profile }) {
  const save = useSaveTimeZone(profile);
  const [toast] = useIonToast();
  const current = profile.timezone || DEFAULT_TIMEZONE;
  const phone = deviceTimeZone();

  const change = (tz: string) =>
    tz !== current &&
    save.mutate(tz, {
      onSuccess: () =>
        void toast({ message: `Time zone: ${timeZoneLabel(tz)}`, duration: 1500, position: 'top' }),
      onError: () =>
        void toast({ message: 'Could not save', duration: 2500, color: 'danger', position: 'top' }),
    });

  return (
    <IonList inset style={{ margin: '24px 0 0' }}>
      <IonItem>
        <IonSelect
          label="Time zone"
          interface="action-sheet"
          interfaceOptions={{ header: 'Your time zone' }}
          value={current}
          disabled={save.isPending}
          onIonChange={(e) => change(String(e.detail.value))}
        >
          {zoneOptions(current).map((z) => (
            <IonSelectOption key={z.tz} value={z.tz}>
              {z.label}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
      {phone !== current && (
        <IonItem lines="none">
          <IonButton size="small" fill="clear" onClick={() => change(phone)}>
            Use my phone's time zone ({timeZoneLabel(phone)})
          </IonButton>
        </IonItem>
      )}
    </IonList>
  );
}
