import { App } from '@capacitor/app';
import { useEffect, useState } from 'react';

import { isAndroidApp } from '../lib/platform';

/** "FitCoach Android 0.1.0.13" (or "FitCoach web app") – to check which version a phone runs. */
export function AppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!isAndroidApp) return;
    void App.getInfo()
      .then((info) => setVersion(info.version))
      .catch(() => undefined);
  }, []);
  return (
    <p className="app-version">
      {isAndroidApp ? `FitCoach Android ${version ?? ''}` : 'FitCoach web app'}
    </p>
  );
}
