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
import { send, sparkles } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { useAskCoach, useCoachQueries, type CoachQuery } from './api';
import './coach.css';
import { dateLocale, useT } from '../../i18n/i18n';

const STARTERS = [
  'How am I doing today?',
  'What should I eat for dinner?',
  'How can I get more protein?',
  'Give me an easy 10-minute workout',
];

/** "Ask the coach": a chat. The day coach answers at once; health questions go to the head coach. */
export function CoachChatPage() {
  const t = useT();
  const { profile } = useAuth();
  const queries = useCoachQueries(profile?.id);
  const ask = useAskCoach(profile?.id);
  const [text, setText] = useState('');
  // The message being answered right now – shown at once, before the coach replies.
  const [pending, setPending] = useState<string | null>(null);
  const [toast] = useIonToast();
  const content = useRef<HTMLIonContentElement>(null);
  const list = queries.data ?? [];

  // Always show the newest message: after the bubbles have rendered, and again once
  // images/fonts have settled.
  useEffect(() => {
    const first = setTimeout(() => void content.current?.scrollToBottom(200), 60);
    const second = setTimeout(() => void content.current?.scrollToBottom(200), 400);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [list.length, pending]);

  const submit = (value = text) => {
    const q = value.trim();
    if (!q || pending) return;
    setText('');
    setPending(q);
    ask
      .mutateAsync(q)
      .catch((e: Error) => {
        // Give the message back so nothing typed is lost.
        setText(q);
        void toast({ message: e.message, duration: 3500, color: 'danger', position: 'top' });
      })
      .finally(() => setPending(null));
  };

  const time = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit' }).format(
      new Date(iso),
    );
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
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
      <IonContent ref={content} className="ion-padding coach-chat-content">
        <div className="coach-chat">
          <p className="coach-disclaimer">
            {t('AI coach – not a doctor. In an emergency call 108.')}
          </p>
          {queries.isPending && (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          )}
          {!queries.isPending && list.length === 0 && !pending && (
            <div className="coach-welcome">
              <IonIcon icon={sparkles} />
              <p>
                {t(
                  'Hi! I know your plan, targets and what you logged today. Ask me anything about food, workouts or your routine.',
                )}
              </p>
            </div>
          )}
          {list.map((q, i) => (
            <Exchange
              key={q.id}
              q={q}
              time={time(q.created_at)}
              day={
                i === 0 || dayOf(list[i - 1]!.created_at) !== dayOf(q.created_at)
                  ? dayOf(q.created_at)
                  : null
              }
            />
          ))}
          {pending && (
            <>
              <div className="coach-bubble coach-me">{pending}</div>
              <div className="coach-bubble coach-ai coach-typing">
                <IonSpinner name="dots" /> {t('Coach is typing…')}
              </div>
            </>
          )}
        </div>
      </IonContent>
      <IonFooter>
        <IonToolbar>
          {!pending && list.length < 3 && (
            <div className="coach-starters">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="coach-starter"
                  onClick={() => submit(t(s))}
                >
                  {t(s)}
                </button>
              ))}
            </div>
          )}
          <div className="coach-input">
            <IonTextarea
              value={text}
              autoGrow
              rows={1}
              maxlength={1000}
              placeholder={t('Type your question…')}
              onIonInput={(e) => setText(e.detail.value ?? '')}
              onKeyDown={(e) => {
                // Enter sends on a computer keyboard; Shift+Enter adds a new line.
                if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                  e.preventDefault();
                  submit();
                }
              }}
              aria-label={t('Your question')}
            />
            <IonButton
              className="coach-send"
              shape="round"
              onClick={() => submit()}
              disabled={!text.trim() || Boolean(pending)}
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

function Exchange({ q, time, day }: { q: CoachQuery; time: string; day: string | null }) {
  const t = useT();
  return (
    <>
      {day && <div className="coach-day">{day}</div>}
      <div className="coach-bubble coach-me">
        {q.question}
        <span className="coach-time">{time}</span>
      </div>
      {q.answer && (
        <div className={`coach-bubble coach-ai${q.red_flag ? ' coach-red' : ''}`}>
          {q.answer}
          {q.status === 'escalated' && !q.follow_up && (
            <span className="coach-tag">⏳ {t('Sent to your head coach')}</span>
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
    </>
  );
}
