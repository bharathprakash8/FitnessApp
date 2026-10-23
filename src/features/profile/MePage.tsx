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
import { AppVersion } from '../../components/AppVersion';
import { CLIENT_TABS, TRAINER_TABS } from '../../components/tabs';
import { DetailRow } from '../../components/DetailRow';
import { ageFrom, formatDate } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { useLatestWeight, useMyTrainer, useSaveBasics } from './api';
import { DIET_LABELS, SEX_LABELS, goalText, label } from './options';
import { useT } from '../../i18n/i18n';
import { LanguageSetting } from './LanguageSetting';
import { TimeZoneSetting } from './TimeZoneSetting';
import './profile.css';

/** "Me" tab for clients and trainers: name/phone, own fitness details, log out. */
export function MePage() {
  const { profile, signOut } = useAuth();
  const t = useT();
  if (!profile) return null;
  const isClient = profile.role === 'client';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>{t('Me')}</IonTitle>
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
          <LanguageSetting profile={profile} />
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
              {t('Set up My fitness')}
            </IonButton>
          )}
          <IonButton
            expand="block"
            fill="outline"
            style={{ marginTop: 24 }}
            routerLink="/me/report"
          >
            {t('Report a problem')}
          </IonButton>
          <IonButton
            expand="block"
            fill="outline"
            color="medium"
            style={{ marginTop: 16 }}
            onClick={() => void signOut()}
          >
            {t('Log out')}
          </IonButton>
          <AppVersion />
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
  const t = useT();
  const [toast] = useIonToast();
  const [name, setName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const dirty = name.trim() !== (profile.full_name ?? '') || phone.trim() !== (profile.phone ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      void toast({
        message: t('Please enter your name'),
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
      return;
    }
    try {
      await save.mutateAsync({ full_name: name.trim(), phone: phone.trim() || null });
      void toast({ message: t('Saved'), duration: 1500, position: 'top' });
    } catch {
      void toast({
        message: t('Could not save. Try again.'),
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
        label={t('Name')}
        labelPlacement="floating"
        autocapitalize="words"
        value={name}
        onIonInput={(e) => setName(String(e.detail.value ?? ''))}
      />
      <IonInput
        fill="outline"
        label={t('Phone')}
        labelPlacement="floating"
        type="tel"
        inputmode="tel"
        value={phone}
        onIonInput={(e) => setPhone(String(e.detail.value ?? ''))}
      />
      {dirty && (
        <IonButton type="submit" expand="block" disabled={save.isPending}>
          {save.isPending ? t('Saving…') : t('Save')}
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
  const t = useT();

  return (
    <>
      <IonList inset style={{ margin: '24px 0 0' }}>
        <IonListHeader>
          <IonLabel>{t('My details')}</IonLabel>
        </IonListHeader>
        {isClient && (
          <DetailRow
            label={t('Trainer')}
            value={trainer.data?.full_name ?? trainer.data?.email ?? ''}
          />
        )}
        <DetailRow
          label={t('Age')}
          value={
            age !== null
              ? t('{age} (born {date})', { age, date: formatDate(profile.date_of_birth) })
              : ''
          }
        />
        <DetailRow label={t('Sex')} value={t(label(SEX_LABELS, profile.sex))} />
        <DetailRow label={t('Height')} value={profile.height_cm ? `${profile.height_cm} cm` : ''} />
        <DetailRow
          label={t('Weight')}
          value={weight.data?.weight_kg ? `${weight.data.weight_kg} kg` : ''}
        />
        <DetailRow label={t('Goal')} value={t(goalText(profile.goal, profile.goal_other))} />
        <DetailRow label={t('Diet')} value={t(label(DIET_LABELS, profile.diet_preference))} />
        <DetailRow label={t('Injuries')} value={profile.injuries ?? ''} />
        <DetailRow label={t('Foods to avoid')} value={profile.foods_to_avoid ?? ''} />
      </IonList>
      <IonButton expand="block" fill="outline" routerLink="/me/details">
        {t('Edit my details')}
      </IonButton>
      {!isClient && (
        <IonButton expand="block" fill="outline" routerLink="/stats">
          {t('My stats and insights')}
        </IonButton>
      )}
      <IonButton expand="block" fill="outline" routerLink="/me/progress">
        {t('Progress: weight, photos and charts')}
      </IonButton>
      <IonButton expand="block" fill="outline" routerLink="/me/health">
        {t('Health sync (calories burnt, steps, sleep)')}
      </IonButton>
      <IonButton expand="block" fill="outline" routerLink="/me/notifications">
        {t('Notifications and reminders')}
      </IonButton>
      {isClient && (
        <IonButton expand="block" fill="outline" routerLink="/me/sessions">
          {t('My sessions')}
        </IonButton>
      )}
      {isClient && (
        <IonButton expand="block" fill="outline" routerLink="/me/summaries">
          {t('Weekly summaries')}
        </IonButton>
      )}
      {profile.consent_at && (
        <IonText color="medium">
          <p style={{ fontSize: '0.85rem' }}>
            {t('You accepted the privacy and health terms on {date}.', {
              date: formatDate(profile.consent_at),
            })}{' '}
            {isClient
              ? t('To have your data deleted, ask your trainer or the admin.')
              : t('To have your data deleted, ask the admin.')}
          </p>
        </IonText>
      )}
    </>
  );
}
