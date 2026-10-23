import { IonText } from '@ionic/react';

import { useAuth } from '../auth/useAuth';
import { useLastSync } from './api';
import { SOURCE_LABELS } from './model';
import { useT } from '../../i18n/i18n';

const STALE_HOURS = 36;

/** "Today, 10:02 pm", "Yesterday, 7:00 am" or "18 Oct, 10:02 pm" in the viewer's time zone. */
function when(iso: string, timeZone: string) {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
  const at = new Date(iso);
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
  const now = new Date();
  if (day(at) === day(now)) return `Today, ${time}`;
  if (day(at) === day(new Date(now.getTime() - 86400000))) return `Yesterday, ${time}`;
  const date = new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric', month: 'short' });
  return `${date.format(at)}, ${time}`;
}

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600000;

/**
 * When the person's phone last sent activity (Apple Health / Health Connect). Shown to the
 * client and their trainer; turns orange when it's more than a day and a half old.
 */
export function LastSync({ clientId, className }: { clientId: string; className?: string }) {
  const t = useT();
  const { profile } = useAuth();
  const last = useLastSync(clientId);
  if (last.isPending || last.isError) return null;
  const tz = profile?.timezone ?? 'Asia/Kolkata';
  if (!last.data) {
    return (
      <p className={className}>
        <IonText color="medium">{t('Phone sync: never synced')}</IonText>
      </p>
    );
  }
  const stale = hoursSince(last.data.at) > STALE_HOURS;
  return (
    <p className={className}>
      <IonText color={stale ? 'warning' : 'medium'}>
        {t('Last synced:')} {when(last.data.at, tz)} ·{' '}
        {SOURCE_LABELS[last.data.source] ?? last.data.source}
        {stale ? t(' – not synced for over a day') : ''}
      </IonText>
    </p>
  );
}
