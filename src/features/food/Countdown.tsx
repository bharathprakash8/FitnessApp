import { IonSpinner } from '@ionic/react';
import { useEffect, useState } from 'react';

import { useT } from '../../i18n/i18n';

/** "Estimating… 23 s" with a shrinking bar; after the time is up: "Almost done…". */
export function Countdown({ seconds, label }: { seconds: number; label: string }) {
  const t = useT();
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setLeft(Math.max(0, seconds - Math.floor((Date.now() - started) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds]);

  return (
    <div className="food-countdown" role="status">
      <div className="food-countdown-number">{left > 0 ? left : <IonSpinner name="dots" />}</div>
      <p>{left > 0 ? label : t('Almost done…')}</p>
      <div className="food-countdown-bar">
        <div style={{ width: `${(left / seconds) * 100}%` }} />
      </div>
    </div>
  );
}
