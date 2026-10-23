import { IonButton, IonIcon, IonSpinner, useIonAlert, useIonToast } from '@ionic/react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { cloudOfflineOutline, refreshOutline } from 'ionicons/icons';
import { useState } from 'react';
import { tr, useT } from '../i18n/i18n';

import { useAuth } from '../features/auth/useAuth';
import { useOnline } from '../lib/network';
import { flushQueue, removeQueued, useQueuedItems } from '../lib/offlineQueue';
import './RefreshButton.css';

/**
 * Small refresh button for every screen's header: sends anything saved offline, then
 * reloads the data on screen.
 */
export function RefreshButton() {
  const t = useT();
  const qc = useQueryClient();
  const online = useOnline();
  const fetching = useIsFetching() > 0;
  const [busy, setBusy] = useState(false);
  const [toast] = useIonToast();

  async function refresh() {
    if (!online) {
      void toast({
        message: t("You're offline – showing the last saved data."),
        duration: 2500,
        position: 'top',
      });
      return;
    }
    setBusy(true);
    try {
      await flushQueue();
      await qc.refetchQueries({ type: 'active' });
    } finally {
      setBusy(false);
    }
  }

  const spinning = busy || (fetching && online);
  return (
    <IonButton
      aria-label={online ? tr('Refresh') : tr('Offline')}
      className="refresh-button"
      onClick={() => void refresh()}
      disabled={spinning}
    >
      {spinning ? (
        <IonSpinner name="crescent" className="refresh-spinner" />
      ) : (
        <IonIcon slot="icon-only" icon={online ? refreshOutline : cloudOfflineOutline} />
      )}
    </IonButton>
  );
}

/**
 * Slim strip under the header: offline notice, items waiting to sync, or items the server
 * refused (with a way to discard them). Shows nothing when all is well.
 */
export function SyncStatusBar() {
  const { profile } = useAuth();
  const online = useOnline();
  const queued = useQueuedItems().filter((i) => i.userId === profile?.id);
  const [alert] = useIonAlert();
  const failed = queued.filter((i) => i.error);
  const waiting = queued.length - failed.length;

  if (failed.length > 0) {
    return (
      <button
        type="button"
        className="sync-bar sync-bar-error"
        onClick={() =>
          void alert({
            header: tr("Couldn't save"),
            message: tr(
              '{n} item(s) saved offline were not accepted by the server (for example a workout that was deleted meanwhile). Please enter them again.',
              { n: failed.length },
            ),
            buttons: [
              { text: tr('Keep for now'), role: 'cancel' },
              {
                text: tr('Discard'),
                role: 'destructive',
                handler: () => void Promise.all(failed.map((i) => removeQueued(i.id))),
              },
            ],
          })
        }
      >
        {tr("{n} saved item(s) couldn't sync – tap for details", { n: failed.length })}
      </button>
    );
  }
  if (!online) {
    return (
      <div className="sync-bar">
        {tr("You're offline – showing saved data.")}
        {waiting > 0 ? ' ' + tr('{n} new entries will sync later.', { n: waiting }) : ''}
      </div>
    );
  }
  if (waiting > 0) {
    return <div className="sync-bar">{tr('Syncing {n} saved entries…', { n: waiting })}</div>;
  }
  return null;
}
