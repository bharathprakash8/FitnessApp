import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';

import { when } from './problemText';
import { useCoachAdmin, useCoachOverview, type CoachAction } from './coachAdminApi';
import './admin.css';

const KIND_LABELS: Record<string, string> = {
  check_meal: 'Meal checked',
  correct_meal: 'Meal corrected',
  suggest_meal: 'Meal suggestion',
  day_plan: "Today's plan",
  note: 'Note',
  answer: 'Answer',
  playbook: 'Playbook',
  target: 'New target',
  assign_plan: 'New plan',
  flag: 'Flag',
};

type Json = Record<string, unknown>;

/** One line describing what a coach change does. */
function describe(a: CoachAction, plans: Map<string, string>) {
  const after = (a.after ?? {}) as Json;
  const before = (a.before ?? {}) as Json;
  switch (a.kind) {
    case 'correct_meal':
    case 'suggest_meal': {
      const items = (after.items as { calories: number }[] | undefined) ?? [];
      const total = Math.round(items.reduce((s, i) => s + Number(i.calories ?? 0), 0));
      return `${String(before.total_calories ?? '?')} → ${total} kcal. ${String(after.reason ?? '')}`;
    }
    case 'check_meal':
      return 'Looked right ✓';
    case 'day_plan':
      return `${String(after.date)}: ${String(after.plan)}${after.note ? ` – ${String(after.note)}` : ''}${
        after.kcal_adjust
          ? ` (${Number(after.kcal_adjust) > 0 ? '+' : ''}${String(after.kcal_adjust)} kcal)`
          : ''
      }`;
    case 'note':
    case 'answer':
    case 'flag':
      return String(after.text ?? '');
    case 'playbook':
      return String(after.body ?? '').slice(0, 300);
    case 'target':
      return `${String(after.calories)} kcal, ${String(after.protein_g)} g protein. ${String(after.reason ?? '')}`;
    case 'assign_plan':
      return `${plans.get(String(after.plan_id)) ?? 'Coach plan'}. ${String(after.reason ?? '')}`;
    default:
      return '';
  }
}

/** Admin → AI Coach: set up, mode, the head coach's reports, approvals, undo, questions, playbook. */
export function AiCoachTab() {
  const overview = useCoachOverview();
  const admin = useCoachAdmin();
  const [toast] = useIonToast();
  const [alert] = useIonAlert();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bookFor, setBookFor] = useState<string>('shared');
  const [bookText, setBookText] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const run = (body: Record<string, unknown>, done: string) =>
    admin
      .mutateAsync(body)
      .then(() => toast({ message: done, duration: 1800, position: 'top' }))
      .catch((e: Error) =>
        toast({ message: e.message, duration: 3500, color: 'danger', position: 'top' }),
      );

  if (overview.isPending) {
    return (
      <div className="ion-padding ion-text-center">
        <IonSpinner name="crescent" />
      </div>
    );
  }
  const d = overview.data;
  if (!d?.coach) {
    return (
      <div className="ion-padding admin-coach">
        <IonCard>
          <IonCardHeader>
            <IonCardTitle>Set up the AI coach</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>
              Creates the “FitCoach AI Coach” trainer account (nobody can log in as it), four safe
              starter plans and the shared coaching playbook. Then map people to it like any
              trainer.
            </p>
            <IonButton
              expand="block"
              disabled={admin.isPending}
              onClick={() => void run({ action: 'setup' }, 'AI coach set up')}
            >
              Set up AI coach
            </IonButton>
          </IonCardContent>
        </IonCard>
      </div>
    );
  }

  const names = new Map(d.people.map((p) => [p.id, p.full_name || p.email]));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Someone') : 'Everyone');
  const bookRow = d.playbook.find((b) =>
    bookFor === 'shared' ? b.client_id === null : b.client_id === bookFor,
  );
  const bookValue = bookText ?? bookRow?.body ?? '';

  return (
    <div className="ion-padding admin-coach">
      <IonCard>
        <IonCardHeader>
          <IonCardSubtitle>Mode</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          <IonSegment
            value={d.mode}
            onIonChange={(e) =>
              void run({ action: 'set_mode', mode: e.detail.value }, 'Mode saved')
            }
          >
            <IonSegmentButton value="off">
              <IonLabel>Off</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="dry_run">
              <IonLabel>Dry run</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="live">
              <IonLabel>Live</IonLabel>
            </IonSegmentButton>
          </IonSegment>
          <p className="admin-muted">
            {d.mode === 'dry_run'
              ? 'Dry run: the head coach only proposes – nothing changes until you approve it below. The day coach (notes, Ask coach) works normally.'
              : d.mode === 'live'
                ? 'Live: small changes (meal fixes, today’s plan, notes, answers) apply at once and can be undone. New targets and plans still wait for your OK.'
                : 'Off: no notes, no head coach. People keep their normal plans.'}
          </p>
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardSubtitle>People on the AI coach ({d.people.length})</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          {d.people.length === 0 && (
            <p className="admin-muted">
              Nobody yet. Open a person in Users and choose “FitCoach AI Coach” as their trainer.
            </p>
          )}
          {d.people.map((p) => (
            <p key={p.id}>
              <strong>{p.full_name || p.email}</strong>{' '}
              {p.coach_consent_at ? (
                <IonBadge color="success">agreed</IonBadge>
              ) : (
                <IonBadge color="warning">waiting for their OK</IonBadge>
              )}
              {p.health_conditions.length > 0 && (
                <span className="admin-muted"> · {p.health_conditions.join(', ')}</span>
              )}
            </p>
          ))}
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardSubtitle>Waiting for your OK ({d.proposed.length})</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          {d.proposed.length === 0 && <p className="admin-muted">Nothing waiting.</p>}
          {d.proposed.map((a) => (
            <div key={a.id} className="admin-coach-row">
              <p>
                <strong>{KIND_LABELS[a.kind] ?? a.kind}</strong> · {nameOf(a.client_id)} ·{' '}
                {when(a.created_at)}
              </p>
              <p>{describe(a, d.plans)}</p>
              <div className="admin-coach-buttons">
                <IonButton
                  size="small"
                  disabled={admin.isPending}
                  onClick={() => void run({ action: 'approve', action_id: a.id }, 'Approved')}
                >
                  Approve
                </IonButton>
                <IonButton
                  size="small"
                  fill="outline"
                  disabled={admin.isPending}
                  onClick={() => void run({ action: 'reject', action_id: a.id }, 'Rejected')}
                >
                  Reject
                </IonButton>
              </div>
            </div>
          ))}
          {d.proposed.length > 1 && (
            <IonButton
              size="small"
              fill="clear"
              onClick={() =>
                void alert({
                  header: `Reject all ${d.proposed.length}?`,
                  buttons: [
                    { text: 'Cancel', role: 'cancel' },
                    {
                      text: 'Reject all',
                      role: 'destructive',
                      handler: () => {
                        void Promise.all(
                          d.proposed.map((a) =>
                            admin.mutateAsync({ action: 'reject', action_id: a.id }),
                          ),
                        );
                      },
                    },
                  ],
                })
              }
            >
              Reject all
            </IonButton>
          )}
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardSubtitle>Questions for the head coach ({d.questions.length})</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          {d.questions.length === 0 && <p className="admin-muted">No open questions.</p>}
          {d.questions.map((q) => (
            <div key={q.id} className="admin-coach-row">
              <p>
                {q.red_flag && <IonBadge color="danger">RED FLAG</IonBadge>}{' '}
                <strong>{nameOf(q.client_id)}</strong> · {when(q.created_at)}
              </p>
              <p>“{q.question}”</p>
              <p className="admin-muted">AI answered: {q.answer}</p>
              <IonTextarea
                fill="outline"
                autoGrow
                placeholder="Your answer (sent to them with a notification)"
                value={answers[q.id] ?? ''}
                onIonInput={(e) => setAnswers({ ...answers, [q.id]: e.detail.value ?? '' })}
              />
              <IonButton
                size="small"
                disabled={!answers[q.id]?.trim() || admin.isPending}
                onClick={() =>
                  void run({ action: 'answer', query_id: q.id, text: answers[q.id] }, 'Answer sent')
                }
              >
                Send answer
              </IonButton>
            </div>
          ))}
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardSubtitle>Head coach reports</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          {d.runs.length === 0 && (
            <p className="admin-muted">No runs yet. The head coach runs every morning at 7:30.</p>
          )}
          {d.runs.map((r) => (
            <div key={r.id} className="admin-coach-row">
              <p
                onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
                style={{ cursor: 'pointer' }}
              >
                <strong>{when(r.started_at)}</strong> · {r.mode === 'dry_run' ? 'dry run' : 'live'}{' '}
                · {r.people} people · {r.photos} photos · {r.actions} changes{' '}
                {r.finished_at ? '' : '· still running'}
                {r.error && <IonBadge color="danger"> error</IonBadge>}
              </p>
              {openRun === r.id && (
                <pre className="admin-coach-report">{r.report || r.error || 'No report.'}</pre>
              )}
            </div>
          ))}
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardSubtitle>Recent changes</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          {d.recent.length === 0 && <p className="admin-muted">No changes yet.</p>}
          {d.recent.map((a) => (
            <div key={a.id} className="admin-coach-row">
              <p>
                <strong>{KIND_LABELS[a.kind] ?? a.kind}</strong> · {nameOf(a.client_id)} ·{' '}
                {when(a.created_at)}{' '}
                <IonBadge
                  color={
                    a.status === 'applied'
                      ? 'success'
                      : a.status === 'refused'
                        ? 'danger'
                        : 'medium'
                  }
                >
                  {a.status === 'refused' ? 'blocked by safety rules' : a.status}
                </IonBadge>
              </p>
              <p>{a.status === 'refused' ? a.refused_reason : describe(a, d.plans)}</p>
              {a.status === 'applied' && !['flag'].includes(a.kind) && (
                <IonButton
                  size="small"
                  fill="outline"
                  disabled={admin.isPending}
                  onClick={() => void run({ action: 'undo', action_id: a.id }, 'Undone')}
                >
                  Undo
                </IonButton>
              )}
            </div>
          ))}
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardSubtitle>Playbook (what the day coach follows)</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          <IonSelect
            fill="outline"
            label="Page"
            labelPlacement="floating"
            value={bookFor}
            onIonChange={(e) => {
              setBookFor(String(e.detail.value));
              setBookText(null);
            }}
          >
            <IonSelectOption value="shared">Shared rules (everyone)</IonSelectOption>
            {d.people.map((p) => (
              <IonSelectOption key={p.id} value={p.id}>
                {p.full_name || p.email}
              </IonSelectOption>
            ))}
          </IonSelect>
          <IonTextarea
            fill="outline"
            autoGrow
            rows={6}
            maxlength={20000}
            value={bookValue}
            onIonInput={(e) => setBookText(e.detail.value ?? '')}
            style={{ marginTop: 8 }}
          />
          {bookRow && (
            <p className="admin-muted">
              Last changed by {bookRow.updated_by === 'claude' ? 'the head coach' : 'an admin'} ·{' '}
              {when(bookRow.updated_at)}
            </p>
          )}
          <IonButton
            size="small"
            disabled={bookText === null || admin.isPending}
            onClick={() =>
              void run(
                {
                  action: 'save_playbook',
                  client_id: bookFor === 'shared' ? null : bookFor,
                  body: bookValue,
                },
                'Playbook saved',
              ).then(() => setBookText(null))
            }
          >
            Save playbook
          </IonButton>
        </IonCardContent>
      </IonCard>
    </div>
  );
}
