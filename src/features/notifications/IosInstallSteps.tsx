import { useT } from '../../i18n/i18n';
/** "Add to Home Screen" steps for iPhone (used on Notifications and the Today install card). */
export function IosInstallSteps() {
  const t = useT();
  return (
    <>
      <p>
        {t(
          'On iPhone, notifications work only when FitCoach is added to your Home Screen (iOS 16.4 or newer):',
        )}
      </p>
      <ol className="notif-steps">
        <li>
          {t('Tap the')} <strong>{t('Share')}</strong>{' '}
          {t('button (square with an arrow) at the bottom of Safari.')}
        </li>
        <li>
          {t('Scroll down and tap')} <strong>{t('Add to Home Screen')}</strong> →{' '}
          <strong>{t('Add')}</strong>.
        </li>
        <li>
          {t('Open FitCoach from the new Home Screen icon and come back to Me → Notifications.')}
        </li>
      </ol>
    </>
  );
}
