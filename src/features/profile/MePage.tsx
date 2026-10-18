import {
  IonButtons,
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonInput,
  IonList,
  IonListHeader,
  IonLabel,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { useState, type FormEvent } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { AppTabBar } from '../../components/AppTabBar';
import { CLIENT_TABS, TRAINER_TABS } from '../../components/tabs';
import { DetailRow } from '../../components/DetailRow';
import { ageFrom, formatDate } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { useLatestWeight, useMyTrainer, useSaveBasics } from './api';
import { DIET_LABELS, SEX_LABELS, goalText, label } from './options';
import { TimeZoneSetting } from './TimeZoneSetting';
import './profile.css';

/** "Me" tab for clients and trainers: name/phone, own fitness details, log out. */
export function MePage() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const isClient = profile.role === 'client';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Me</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="profile-page">
          <IonText color="medium">
            <p style={{ marginTop: 0 }}>{profile.email}</p>
          </IonText>
          {/* key: refresh the form when the saved values change */}
          <BasicsForm key={`${profile.full_name}|${profile.phone}`} profile={profile} />
          <TimeZoneSetting profile={profile} />
          {isClient || profile.onboarded_at ? (
            <ClientDetails profile={profile} />
          ) : (
            <IonButton
              expand="block"
              fill="outline"
              style={{ marginTop: 24 }}
              routerLink="/onboarding"
            >
              Set up My fitness
            </IonButton>
          )}
          <IonButton
            expand="block"
            fill="outline"
            color="medium"
            style={{ marginTop: 32 }}
            onClick={() => void signOut()}
          >
            Log out
          </IonButton>
        </div>
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={isClient ? CLIENT_TABS : TRAINER_TABS} selected="me" />
      </IonFooter>
    </IonPage>
  );
}

function BasicsForm({ profile }: { profile: Profile }) {
  const save = useSaveBasics(profile);
  const [toast] = useIonToast();
  const [name, setName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const dirty = name.trim() !== (profile.full_name ?? '') || phone.trim() !== (profile.phone ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      void toast({
        message: 'Please enter your name',
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
      return;
    }
    try {
      await save.mutateAsync({ full_name: name.trim(), phone: phone.trim() || null });
      void toast({ message: 'Saved', duration: 1500, position: 'top' });
    } catch {
      void toast({
        message: 'Could not save. Try again.',
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
    }
  }

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <IonInput
        fill="outline"
        label="Name"
        labelPlacement="floating"
        autocapitalize="words"
        value={name}
        onIonInput={(e) => setName(String(e.detail.value ?? ''))}
      />
      <IonInput
        fill="outline"
        label="Phone"
        labelPlacement="floating"
        type="tel"
        inputmode="tel"
        value={phone}
        onIonInput={(e) => setPhone(String(e.detail.value ?? ''))}
      />
      {dirty && (
        <IonButton type="submit" expand="block" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </IonButton>
      )}
    </form>
  );
}

function ClientDetails({ profile }: { profile: Profile }) {
  const weight = useLatestWeight(profile.id);
  const isClient = profile.role === 'client';
  const trainer = useMyTrainer(isClient ? profile.id : undefined);
  const age = ageFrom(profile.date_of_birth, profile.timezone);

  return (
    <>
      <IonList inset style={{ margin: '24px 0 0' }}>
        <IonListHeader>
          <IonLabel>My details</IonLabel>
        </IonListHeader>
        {isClient && (
          <DetailRow label="Trainer" value={trainer.data?.full_name ?? trainer.data?.email ?? ''} />
        )}
        <DetailRow
          label="Age"
          value={age !== null ? `${age} (born ${formatDate(profile.date_of_birth)})` : ''}
        />
        <DetailRow label="Sex" value={label(SEX_LABELS, profile.sex)} />
        <DetailRow label="Height" value={profile.height_cm ? `${profile.height_cm} cm` : ''} />
        <DetailRow
          label="Weight"
          value={weight.data?.weight_kg ? `${weight.data.weight_kg} kg` : ''}
        />
        <DetailRow label="Goal" value={goalText(profile.goal, profile.goal_other)} />
        <DetailRow label="Diet" value={label(DIET_LABELS, profile.diet_preference)} />
        <DetailRow label="Injuries" value={profile.injuries ?? ''} />
      </IonList>
      <IonButton expand="block" fill="outline" routerLink="/me/details">
        Edit my details
      </IonButton>
      <IonButton expand="block" fill="outline" routerLink="/me/health">
        Health sync (calories burnt, steps, sleep)
      </IonButton>
      <IonButton expand="block" fill="outline" routerLink="/me/notifications">
        Notifications and reminders
      </IonButton>
      {isClient && (
        <IonButton expand="block" fill="outline" routerLink="/me/sessions">
          My sessions
        </IonButton>
      )}
      {profile.consent_at && (
        <IonText color="medium">
          <p style={{ fontSize: '0.85rem' }}>
            You accepted the privacy and health terms on {formatDate(profile.consent_at)}. To have
            your data deleted, ask {isClient ? 'your trainer or ' : ''}the admin.
          </p>
        </IonText>
      )}
    </>
  );
}
