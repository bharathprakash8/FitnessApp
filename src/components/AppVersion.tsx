import { App } from '@capacitor/app';
import { IonButton, IonSpinner } from '@ionic/react';
import { useEffect, useState } from 'react';

import { checkForUpdatesNow } from '../features/update/update';
import { useT } from '../i18n/i18n';
import { isAndroidApp } from '../lib/platform';

/** "FitCoach Android 0.1.0.13" (or "FitCoach web app") + a manual update check. */
export function AppVersion() {
  const t = useT();
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'latest'>('idle');
  useEffect(() => {
    if (!isAndroidApp) return;
    void App.getInfo()
      .then((info) => setVersion(info.version))
      .catch(() => undefined);
  }, []);
  return (
    <div className="update-check">
      <p className="app-version">
        {isAndroidApp ? `FitCoach Android ${version ?? ''}` : 'FitCoach web app'}
      </p>
      {state === 'latest' ? (
        <p className="app-version">{t('You have the latest version')}</p>
      ) : (
        <IonButton
          fill="clear"
          size="small"
          disabled={state === 'checking'}
          onClick={() => {
            setState('checking');
            void checkForUpdatesNow().then((r) => setState(r === 'latest' ? 'latest' : 'idle'));
          }}
        >
          {state === 'checking' ? <IonSpinner name="crescent" /> : t('Check for updates')}
        </IonButton>
      )}
    </div>
  );
}
