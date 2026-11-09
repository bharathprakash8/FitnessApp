import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonText,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';

import { callAdminUsers, setupMessage, whatsAppUrl, type AdminUser, type SetupLink } from './api';

/**
 * Admin: make a one-time setup code and send it on WhatsApp (owner, 8 Nov 2026). The person
 * logs in once with it, without an email code. A new code replaces the old one.
 */
export function WhatsAppSetup({ user }: { user: AdminUser }) {
  const [toast] = useIonToast();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);

  if (user.role === 'admin' || !user.is_active) return null;

  const notify = (message: string, color?: string) =>
    void toast({ message, duration: color ? 3500 : 2000, color, position: 'top' });

  async function make() {
    setBusy(true);
    try {
      const link = (await callAdminUsers({ action: 'setup_link', user_id: user.id })) as SetupLink;
      setText(setupMessage(user, link.code));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not make a setup code', 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied – paste it into WhatsApp');
    } catch {
      notify('Could not copy. Select the text and copy it.', 'danger');
    }
  }

  async function share() {
    if (!text) return;
    try {
      await navigator.share({ text });
    } catch {
      // Closed the share sheet – nothing to do.
    }
  }

  return (
    <IonCard className="admin-setup-card">
      <IonCardHeader>
        <IonCardTitle>WhatsApp setup link</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {!text ? (
          <>
            <p>
              Easiest for family: they type a code once and are logged in – no email code. Works
              once, for 7 days. Making a new one stops the old one.
            </p>
            <IonButton expand="block" disabled={busy} onClick={() => void make()}>
              {busy ? 'Making…' : 'Make a setup code'}
            </IonButton>
          </>
        ) : (
          <>
            <pre className="admin-share">{text}</pre>
            <IonButton expand="block" href={whatsAppUrl(user.phone, text)} target="_blank">
              {user.phone ? `Send on WhatsApp to ${user.phone}` : 'Open WhatsApp'}
            </IonButton>
            <IonButton expand="block" fill="outline" onClick={() => void copy()}>
              Copy message
            </IonButton>
            {typeof navigator.share === 'function' && (
              <IonButton expand="block" fill="clear" onClick={() => void share()}>
                Share another way
              </IonButton>
            )}
            <IonText color="medium">
              <p className="admin-note">
                Only send this to the person themself – the code logs in as them.
              </p>
            </IonText>
          </>
        )}
      </IonCardContent>
    </IonCard>
  );
}
