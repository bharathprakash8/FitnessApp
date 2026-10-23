import { IonButton } from '@ionic/react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/i18n';

/** Short beep and vibration when rest is over (both optional – fail quietly). */
function alertDone() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* not supported */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio blocked */
  }
}

/** Countdown shown after logging a set. `startedAt` changes restart it. */
export function RestTimer({
  seconds,
  startedAt,
  onClose,
}: {
  seconds: number;
  startedAt: number;
  onClose: () => void;
}) {
  const tx = useT();
  const [now, setNow] = useState(() => Date.now());
  const beeped = useRef(false);
  const left = Math.max(0, Math.ceil((startedAt + seconds * 1000 - now) / 1000));

  useEffect(() => {
    beeped.current = false;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (left === 0 && !beeped.current) {
      beeped.current = true;
      alertDone();
    }
  }, [left]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className={`rest-timer${left === 0 ? ' done' : ''}`} role="timer" aria-live="polite">
      <span>{left === 0 ? tx('Rest over – next set!') : `Rest ${mm}:${ss}`}</span>
      <IonButton size="small" fill="clear" onClick={onClose}>
        {left === 0 ? tx('Close') : tx('Skip')}
      </IonButton>
    </div>
  );
}
