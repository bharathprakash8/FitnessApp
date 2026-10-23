import { IonButton } from '@ionic/react';

import { SHORTCUT_RUN_URL } from './shortcut';
import { useT } from '../../i18n/i18n';

/**
 * How to switch Health access on by hand. Apple shows its permission sheet only once; if it
 * was skipped or refused, iPhone never asks again and the Shortcut stops with "no access".
 */
export function HealthAccessHelp({ open }: { open?: boolean }) {
  const t = useT();
  return (
    <details className="health-help" open={open}>
      <summary>{t('Error “no access” to Health data (e.g. Resting Energy)?')}</summary>
      <p>
        {t('iPhone asks for Health access only once. If that was skipped, switch it on yourself:')}
      </p>
      <ol>
        <li>
          {t('Open the')} <strong>{t('Health')}</strong> {t('app → tap your')}{' '}
          <strong>{t('profile picture')}</strong> {t('(top right) →')} <strong>{t('Apps')}</strong>{' '}
          → <strong>{t('Shortcuts')}</strong>.
        </li>
        <li>
          {t('Tap')} <strong>{t('Turn On All')}</strong>{' '}
          {t('(Active Energy, Resting Energy, Steps, Heart Rate).')}
        </li>
        <li>{t('Come back here and tap Sync now.')}</li>
      </ol>
      <p className="health-help-small">
        {t(
          'Shortcuts not in that list? Open the Shortcuts app, tap the FitCoach Sync tile once and choose',
        )}{' '}
        <strong>{t('Turn On All → Allow')}</strong>
        {t('. Also allowed: Settings → Privacy & Security → Health → Shortcuts.')}
      </p>
      <div className="health-help-buttons">
        <IonButton size="small" fill="outline" href="x-apple-health://">
          {t('Open Health app')}
        </IonButton>
        <IonButton size="small" href={SHORTCUT_RUN_URL}>
          {t('Sync now')}
        </IonButton>
      </div>
    </details>
  );
}
