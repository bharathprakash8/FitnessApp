import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { imageOutline } from 'ionicons/icons';
import { useRef, useState } from 'react';

import { appInfo, recentProblems } from '../../lib/errorLog';
import { compressImage } from '../../lib/image';
import { lastHealthSync } from '../activity/healthConnect';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useT } from '../../i18n/i18n';

/** Me → Report a problem: a short message (and optional screenshot) straight to the admin. */
export function ReportProblemPage() {
  const t = useT();
  const { profile } = useAuth();
  const router = useIonRouter();
  const [toast] = useIonToast();
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function send() {
    if (!profile || message.trim().length < 3) {
      setError('Please describe the problem in a few words.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let screenshot_path: string | undefined;
      if (shot) {
        const small = await compressImage(shot, 1280, 300_000);
        const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('problem-shots')
          .upload(path, small, { contentType: 'image/jpeg' });
        if (upErr) throw new Error('Could not upload the screenshot. Try without it.');
        screenshot_path = path;
      }
      const sync = lastHealthSync();
      const { error: fnErr } = await supabase.functions.invoke('support', {
        body: {
          action: 'report',
          message: message.trim(),
          screenshot_path,
          screen: document.referrer ? new URL(document.referrer).pathname : undefined,
          details: {
            recent_problems: recentProblems(),
            online: navigator.onLine,
            last_android_sync: sync?.toISOString() ?? null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          ...appInfo(),
        },
      });
      if (fnErr) {
        const payload =
          fnErr instanceof FunctionsHttpError ? await fnErr.context.json().catch(() => null) : null;
        throw new Error(payload?.error?.message ?? 'Could not send. Check your internet.');
      }
      void toast({
        message: t('Thanks – sent to the admin'),
        duration: 2000,
        position: 'top',
      });
      router.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>{t('Report a problem')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p>
            {t(
              'Tell us what went wrong. Your app version, phone type and the last errors on this phone are added automatically.',
            )}
          </p>
          <IonTextarea
            fill="outline"
            label={t('What happened?')}
            labelPlacement="stacked"
            placeholder={t("e.g. Sync now says 'Sync failed' on the Health sync page")}
            autoGrow
            rows={4}
            maxlength={2000}
            value={message}
            onIonInput={(e) => setMessage(String(e.detail.value ?? ''))}
          />
          <input
            ref={picker}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => setShot(e.target.files?.[0] ?? null)}
          />
          <IonButton
            fill="outline"
            expand="block"
            onClick={() => picker.current?.click()}
            style={{ marginTop: 12 }}
          >
            <IonIcon slot="start" icon={imageOutline} />
            {shot ? t('Screenshot added – change') : t('Add a screenshot (optional)')}
          </IonButton>
          {error && (
            <IonText color="danger">
              <p>{error}</p>
            </IonText>
          )}
          <IonButton expand="block" size="large" disabled={busy} onClick={() => void send()}>
            {busy ? t('Sending…') : t('Send to admin')}
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}
