import { IonButton } from '@ionic/react';

import { SHORTCUT_RUN_URL } from './shortcut';

/**
 * How to switch Health access on by hand. Apple shows its permission sheet only once; if it
 * was skipped or refused, iPhone never asks again and the Shortcut stops with "no access".
 */
export function HealthAccessHelp({ open }: { open?: boolean }) {
  return (
    <details className="health-help" open={open}>
      <summary>Error “no access” to Health data (e.g. Resting Energy)?</summary>
      <p>iPhone asks for Health access only once. If that was skipped, switch it on yourself:</p>
      <ol>
        <li>
          Open the <strong>Health</strong> app → tap your <strong>profile picture</strong> (top
          right) → <strong>Apps</strong> → <strong>Shortcuts</strong>.
        </li>
        <li>
          Tap <strong>Turn On All</strong> (Active Energy, Resting Energy, Steps, Heart Rate).
        </li>
        <li>Come back here and tap Sync now.</li>
      </ol>
      <p className="health-help-small">
        Shortcuts not in that list? Open the Shortcuts app, tap the FitCoach Sync tile once and
        choose <strong>Turn On All → Allow</strong>. Also allowed: Settings → Privacy &amp; Security
        → Health → Shortcuts.
      </p>
      <div className="health-help-buttons">
        <IonButton size="small" fill="outline" href="x-apple-health://">
          Open Health app
        </IonButton>
        <IonButton size="small" href={SHORTCUT_RUN_URL}>
          Sync now
        </IonButton>
      </div>
    </details>
  );
}
