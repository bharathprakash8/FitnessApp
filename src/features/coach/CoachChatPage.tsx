import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { chatbubblesOutline, send } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';

import { EmptyState } from '../../components/EmptyState';
import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { useAskCoach, useCoachQueries } from './api';
import './coach.css';
import { dateLocale, useT } from '../../i18n/i18n';

/** "Ask the coach": the day coach answers at once; health questions go to the head coach. */
export function CoachChatPage() {
  const t = useT();
  const { profile } = useAuth();
  const queries = useCoachQueries(profile?.id);
  const ask = useAskCoach(profile?.id);
  const [text, setText] = useState('');
  const [toast] = useIonToast();
  const content = useRef<HTMLIonContentElement>(null);
  const list = queries.data ?? [];

  useEffect(() => {
    void content.current?.scrollToBottom(200);
  }, [list.length, ask.isPending]);

  const submit = () => {
    const q = text.trim();
    if (!q || ask.isPending) return;
    ask
      .mutateAsync(q)
      .then(() => setText(''))
      .catch((e: Error) =>
        toast({ message: e.message, duration: 3500, color: 'danger', position: 'top' }),
      );
  };

  const time = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale(), {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/today" />
          </IonButtons>
          <IonTitle>{t('Ask coach')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent ref={content} className="ion-padding">
        <div className="coach-chat">
          <p className="coach-disclaimer">
            {t('AI coach – not a doctor. In an emergency call 108.')}
          </p>
          {queries.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : list.length === 0 && !ask.isPending ? (
            <EmptyState
              icon={chatbubblesOutline}
              title={t('Ask anything about your food, workouts or routine')}
              text={t('For example: “What can I eat for dinner to get more protein?”')}
            />
          ) : null}
          {list.map((q) => (
            <div key={q.id}>
              <div className="coach-bubble coach-me">
                {q.question}
                <span className="coach-time">{time(q.created_at)}</span>
              </div>
              {q.answer && (
                <div className={`coach-bubble coach-ai${q.red_flag ? ' coach-red' : ''}`}>
                  {q.answer}
                  {q.status === 'escalated' && (
                    <span className="coach-tag">{t('Sent to your head coach')}</span>
                  )}
                </div>
              )}
              {q.follow_up && (
                <div className="coach-bubble coach-ai coach-head">
                  <span className="coach-from">
                    {q.follow_up_by === 'admin' ? t('Admin') : t('Head coach')}
                  </span>
                  {q.follow_up}
                </div>
              )}
            </div>
          ))}
          {ask.isPending && (
            <>
              <div className="coach-bubble coach-me">{text}</div>
              <div className="coach-bubble coach-ai">
                <IonSpinner name="dots" />
              </div>
            </>
          )}
        </div>
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <div className="coach-input">
            <IonTextarea
              value={text}
              autoGrow
              rows={1}
              maxlength={1000}
              placeholder={t('Type your question…')}
              onIonInput={(e) => setText(e.detail.value ?? '')}
              aria-label={t('Your question')}
            />
            <IonButton
              onClick={submit}
              disabled={!text.trim() || ask.isPending}
              aria-label={t('Send')}
            >
              <IonIcon slot="icon-only" icon={send} />
            </IonButton>
          </div>
        </IonToolbar>
      </IonFooter>
    </IonPage>
  );
}
