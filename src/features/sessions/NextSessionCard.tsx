import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
} from '@ionic/react';
import { videocam } from 'ionicons/icons';

import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { formatWhen, zoneAbbr } from '../../lib/timezones';
import type { Profile } from '../auth/roles';
import { canJoin, sessionEnded, useClientSessions } from './api';
import './sessions.css';

/** Today page (client): the next session, with Join for online ones. */
export function NextSessionCard({ profile }: { profile: Profile }) {
  const sessions = useClientSessions(profile.id);
  const tz = profile.timezone ?? DEFAULT_TIMEZONE;
  const next = (sessions.data ?? []).find((s) => s.status === 'scheduled' && !sessionEnded(s));
  if (!next) return null;

  const live = canJoin(next);
  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardSubtitle>
          {live ? 'Happening now' : 'Next session'} ·{' '}
          {next.type === 'online' ? 'online' : 'in person'}
        </IonCardSubtitle>
        <IonCardTitle>{next.title}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <p>
          {formatWhen(next.starts_at, tz)} {zoneAbbr(next.starts_at, tz)} · {next.duration_min} min
        </p>
        {next.location && <p>📍 {next.location}</p>}
        {next.type === 'online' && next.meet_url && (
          <IonButton
            className="sessions-join"
            expand="block"
            fill={live ? 'solid' : 'outline'}
            href={next.meet_url}
            target="_blank"
            rel="noopener"
          >
            <IonIcon slot="start" icon={videocam} />
            Join
          </IonButton>
        )}
        <IonButton fill="clear" size="small" routerLink="/me/sessions">
          All my sessions
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
}
