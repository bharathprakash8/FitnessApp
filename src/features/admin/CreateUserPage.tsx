import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { useState, type FormEvent } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import type { Role } from '../auth/roles';
import { loginInstructions, useAdminAction, useAdminUsers, type AdminUser } from './api';
import { RoleSegment } from './RoleSegment';
import { TrainerSelect } from './TrainerSelect';
import './admin.css';

const EMPTY = { full_name: '', email: '', phone: '', role: 'client' as Role, trainer_id: '' };

export function CreateUserPage() {
  const users = useAdminUsers();
  const action = useAdminAction();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminUser | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) return setError('Please enter a name.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Please enter a valid email.');
    if (form.role === 'client' && !form.trainer_id) return setError('Please pick a trainer.');
    try {
      const user = (await action.mutateAsync({
        action: 'create',
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        trainer_id: form.role === 'client' ? form.trainer_id : undefined,
      })) as AdminUser;
      setCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the user.');
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin" />
          </IonButtons>
          <IonTitle>{created ? 'User added' : 'Add user'}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="admin-form">
          {created ? (
            <ShareInstructions
              user={created}
              onAnother={() => {
                setCreated(null);
                setForm({ ...EMPTY, role: form.role, trainer_id: form.trainer_id });
              }}
            />
          ) : (
            <form onSubmit={submit} noValidate>
              <RoleSegment value={form.role} onChange={(r) => set('role', r)} />
              <IonInput
                fill="outline"
                label="Full name"
                labelPlacement="floating"
                autocapitalize="words"
                value={form.full_name}
                onIonInput={(e) => set('full_name', String(e.detail.value ?? ''))}
              />
              <IonInput
                fill="outline"
                label="Email"
                labelPlacement="floating"
                type="email"
                inputmode="email"
                value={form.email}
                onIonInput={(e) => set('email', String(e.detail.value ?? ''))}
              />
              <IonInput
                fill="outline"
                label="Phone (optional)"
                labelPlacement="floating"
                type="tel"
                inputmode="tel"
                value={form.phone}
                onIonInput={(e) => set('phone', String(e.detail.value ?? ''))}
              />
              {form.role === 'client' && (
                <TrainerSelect
                  users={users.data ?? []}
                  value={form.trainer_id}
                  onChange={(id) => set('trainer_id', id)}
                />
              )}
              {form.role === 'admin' && (
                <IonText color="warning">
                  <p className="admin-note">Admins can see and change everything.</p>
                </IonText>
              )}
              {error && (
                <IonText color="danger" role="alert">
                  <p className="admin-note">{error}</p>
                </IonText>
              )}
              <IonButton type="submit" expand="block" size="large" disabled={action.isPending}>
                {action.isPending ? 'Adding…' : 'Add user'}
              </IonButton>
            </form>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function ShareInstructions({ user, onAnother }: { user: AdminUser; onAnother: () => void }) {
  const [toast] = useIonToast();
  const text = loginInstructions(user);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      void toast({
        message: 'Copied – paste it into WhatsApp or email',
        duration: 2000,
        position: 'top',
      });
    } catch {
      void toast({
        message: 'Could not copy. Select the text and copy it.',
        duration: 3000,
        position: 'top',
      });
    }
  }

  return (
    <>
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>Share login instructions</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <pre className="admin-share">{text}</pre>
        </IonCardContent>
      </IonCard>
      <IonButton expand="block" onClick={() => void copy()}>
        Copy text
      </IonButton>
      <IonButton expand="block" fill="outline" onClick={onAnother}>
        Add another user
      </IonButton>
      <IonButton expand="block" fill="clear" routerLink="/admin" routerDirection="back">
        Back to users
      </IonButton>
    </>
  );
}
