import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTextarea,
} from '@ionic/react';
import {
  barbellOutline,
  bookOutline,
  chatbubbleEllipsesOutline,
  checkmarkCircle,
  flagOutline,
  restaurantOutline,
  sunnyOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import { useState } from 'react';

import { when } from './problemText';
import type { CoachAction, CoachOverview } from './coachAdminApi';
import './admin.css';

type Json = Record<string, unknown>;
type Item = { name: string; portion?: string; calories: number };
type Section = 'todo' | 'reports' | 'history' | 'people';

const KIND: Record<string, { icon: string; label: string }> = {
  check_meal: { icon: checkmarkCircle, label: 'Meal looks right' },
  correct_meal: { icon: restaurantOutline, label: 'Fix meal calories' },
  suggest_meal: { icon: restaurantOutline, label: 'Suggest meal change' },
  day_plan: { icon: barbellOutline, label: "Today's plan" },
  note: { icon: sunnyOutline, label: 'Morning note' },
  answer: { icon: chatbubbleEllipsesOutline, label: 'Answer a question' },
  playbook: { icon: bookOutline, label: 'Update playbook' },
  target: { icon: trendingUpOutline, label: 'New calorie target' },
  assign_plan: { icon: barbellOutline, label: 'New workout plan' },
  flag: { icon: flagOutline, label: 'Needs your attention' },
};

const PLAN_LABEL: Record<string, string> = {
  workout: 'Workout day',
  light: 'Light day',
  rest: 'Rest day',
};
const sum = (items: Item[]) => Math.round(items.reduce((s, i) => s + Number(i.calories ?? 0), 0));

export interface AiCoachViewProps {
  data: CoachOverview;
  busy: boolean;
  /** Calls the coach function; resolves when done (the view shows its own feedback). */
  onAction: (body: Record<string, unknown>, done: string) => Promise<unknown>;
}

/** Admin → AI Coach: what needs your OK, reports, history with undo, people and playbook. */
export function AiCoachView({ data: d, busy, onAction }: AiCoachViewProps) {
  const todo = d.proposed.filter((a) => a.kind !== 'check_meal');
  const checks = d.proposed.filter((a) => a.kind === 'check_meal');
  const [section, setSection] = useState<Section>('todo');
  const names = new Map(d.people.map((p) => [p.id, p.full_name || p.email]));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Someone') : 'Everyone');

  return (
    <div className="admin-coach">
      {d.scope === 'trainer' ? (
        <TrainerSettingBar mode={d.mode} busy={busy} onAction={onAction} />
      ) : (
        <ModeBar mode={d.mode} busy={busy} onAction={onAction} />
      )}
      <IonSegment
        value={section}
        onIonChange={(e) => setSection(e.detail.value as Section)}
        className="coach-sections"
      >
        <IonSegmentButton value="todo">
          <IonLabel>
            To do{' '}
            {todo.length + d.questions.length > 0 && (
              <IonBadge color="danger">{todo.length + d.questions.length}</IonBadge>
            )}
          </IonLabel>
        </IonSegmentButton>
        {d.scope === 'admin' && (
          <IonSegmentButton value="reports">
            <IonLabel>Reports</IonLabel>
          </IonSegmentButton>
        )}
        <IonSegmentButton value="history">
          <IonLabel>History</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="people">
          <IonLabel>People</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      {section === 'todo' && (
        <TodoSection
          d={d}
          todo={todo}
          checks={checks}
          busy={busy}
          onAction={onAction}
          nameOf={nameOf}
        />
      )}
      {section === 'reports' && <ReportsSection d={d} />}
      {section === 'history' && (
        <HistorySection d={d} busy={busy} onAction={onAction} nameOf={nameOf} />
      )}
      {section === 'people' && <PeopleSection d={d} busy={busy} onAction={onAction} />}
    </div>
  );
}

/** Trainer: approve every suggestion yourself, or let small changes apply automatically. */
function TrainerSettingBar({
  mode,
  busy,
  onAction,
}: {
  mode: string;
  busy: boolean;
  onAction: AiCoachViewProps['onAction'];
}) {
  return (
    <div className="coach-mode coach-mode-dry_run">
      <div className="coach-mode-text">
        {mode === 'auto'
          ? 'Small changes (meal fixes, today’s plan, notes, answers) apply at once – you can undo them. New targets still need you.'
          : 'You approve every suggestion before your clients see it.'}
      </div>
      <IonSegment
        value={mode}
        disabled={busy}
        onIonChange={(e) => {
          if (e.detail.value !== mode) {
            void onAction(
              { action: 'set_auto_apply', on: e.detail.value === 'auto' },
              'Setting saved',
            );
          }
        }}
      >
        <IonSegmentButton value="review">
          <IonLabel>I approve all</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="auto">
          <IonLabel>Auto small changes</IonLabel>
        </IonSegmentButton>
      </IonSegment>
    </div>
  );
}

function ModeBar({
  mode,
  busy,
  onAction,
}: {
  mode: string;
  busy: boolean;
  onAction: AiCoachViewProps['onAction'];
}) {
  const text =
    mode === 'dry_run'
      ? 'Dry run – Claude only proposes. Nothing changes for anyone until you approve it.'
      : mode === 'live'
        ? 'Live – small changes apply at once (you can undo them). Targets and plans still need you.'
        : 'Off – no head coach, no notes. People keep their normal plans.';
  return (
    <div className={`coach-mode coach-mode-${mode}`}>
      <div className="coach-mode-text">{text}</div>
      <IonSegment
        value={mode}
        disabled={busy}
        onIonChange={(e) => {
          if (e.detail.value !== mode)
            void onAction({ action: 'set_mode', mode: e.detail.value }, 'Mode changed');
        }}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// To do: proposals grouped by person, then questions
// ---------------------------------------------------------------------------
function TodoSection({
  d,
  todo,
  checks,
  busy,
  onAction,
  nameOf,
}: {
  d: CoachOverview;
  todo: CoachAction[];
  checks: CoachAction[];
  busy: boolean;
  onAction: AiCoachViewProps['onAction'];
  nameOf: (id: string | null) => string;
}) {
  const groups = new Map<string, CoachAction[]>();
  for (const a of todo) {
    const k = a.client_id ?? 'everyone';
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const approveAll = (list: CoachAction[], label: string) =>
    onAction({ action: 'approve_many', action_ids: list.map((a) => a.id) }, label);

  if (!todo.length && !d.questions.length) {
    return (
      <div className="coach-empty">
        <IonIcon icon={checkmarkCircle} color="success" />
        <p>All done – nothing waiting for you.</p>
        {checks.length > 0 && (
          <p className="admin-muted">{checks.length} meals were checked and looked right.</p>
        )}
      </div>
    );
  }

  return (
    <>
      {d.questions.length > 0 && (
        <h3 className="coach-h">Questions people asked ({d.questions.length})</h3>
      )}
      {d.questions.map((q) => (
        <QuestionCard
          key={q.id}
          q={q}
          person={nameOf(q.client_id)}
          busy={busy}
          onAction={onAction}
        />
      ))}

      {[...groups.entries()].map(([who, list]) => {
        // Flags are information, not changes – "Approve all" leaves them for "Got it".
        const changes = list.filter((a) => a.kind !== 'flag');
        return (
          <div key={who} className="coach-group">
            <div className="coach-group-head">
              <h3>{who === 'everyone' ? 'Everyone' : nameOf(who)}</h3>
              {changes.length > 1 && (
                <IonButton
                  size="small"
                  disabled={busy}
                  onClick={() => void approveAll(changes, `Approved ${changes.length} changes`)}
                >
                  Approve all {changes.length}
                </IonButton>
              )}
            </div>
            {list.map((a) => (
              <ProposalCard key={a.id} a={a} d={d} busy={busy} onAction={onAction} />
            ))}
          </div>
        );
      })}
      {checks.length > 0 && (
        <p className="admin-muted coach-checks">
          Also: {checks.length} meals looked right.{' '}
          <IonButton
            size="small"
            fill="clear"
            disabled={busy}
            onClick={() => void approveAll(checks, 'Marked as checked')}
          >
            Mark them checked
          </IonButton>
        </p>
      )}
    </>
  );
}

function ProposalCard({
  a,
  d,
  busy,
  onAction,
}: {
  a: CoachAction;
  d: CoachOverview;
  busy: boolean;
  onAction: AiCoachViewProps['onAction'];
}) {
  const k = KIND[a.kind] ?? { icon: flagOutline, label: a.kind };
  return (
    <IonCard className={`coach-proposal coach-kind-${a.kind}`}>
      <IonCardContent>
        <div className="coach-proposal-title">
          <IonIcon icon={k.icon} />
          <strong>{k.label}</strong>
          <span className="admin-muted">{when(a.created_at)}</span>
        </div>
        <ActionDetail a={a} d={d} />
        {a.kind === 'flag' ? (
          // A flag is information for you, not a change: just mark it as seen.
          <div className="coach-actions-row">
            <IonButton
              size="small"
              fill="outline"
              disabled={busy}
              onClick={() => void onAction({ action: 'reject', action_id: a.id }, 'Noted')}
            >
              Got it
            </IonButton>
          </div>
        ) : (
          <div className="coach-actions-row">
            <IonButton
              size="small"
              disabled={busy}
              onClick={() => void onAction({ action: 'approve', action_id: a.id }, 'Approved ✓')}
            >
              Approve
            </IonButton>
            <IonButton
              size="small"
              fill="outline"
              color="medium"
              disabled={busy}
              onClick={() => void onAction({ action: 'reject', action_id: a.id }, 'Skipped')}
            >
              Skip
            </IonButton>
          </div>
        )}
      </IonCardContent>
    </IonCard>
  );
}

/** What a change does, in plain words – shared by To do and History. */
function ActionDetail({ a, d }: { a: CoachAction; d: CoachOverview }) {
  const after = (a.after ?? {}) as Json;
  const before = (a.before ?? {}) as Json;
  switch (a.kind) {
    case 'correct_meal':
    case 'suggest_meal':
    case 'check_meal': {
      const meal = a.target_id ? d.meals.get(a.target_id) : undefined;
      const photo = meal?.photo_path ? d.photoUrls[meal.photo_path] : undefined;
      const oldItems = ((before.items as Item[] | undefined) ?? meal?.items ?? []) as Item[];
      const newItems = (after.items as Item[] | undefined) ?? [];
      return (
        <div className="coach-meal">
          {photo ? (
            <a href={photo} target="_blank" rel="noreferrer" aria-label="Open the photo">
              <img src={photo} alt="Meal" className="coach-meal-photo" />
            </a>
          ) : null}
          <div className="coach-meal-body">
            {meal && (
              <p className="admin-muted">
                {meal.meal_type} · {when(meal.eaten_at)}
              </p>
            )}
            {a.kind === 'check_meal' ? (
              <p>{oldItems.map((i) => i.name).join(', ')} – looks right ✓</p>
            ) : (
              <>
                <p className="coach-kcal">
                  <span className="coach-old">{sum(oldItems)}</span> →{' '}
                  <strong>{sum(newItems)} kcal</strong>
                </p>
                <ul className="coach-items">
                  {newItems.map((i) => (
                    <li key={i.name}>
                      {i.name} <span className="admin-muted">{i.portion}</span> ·{' '}
                      {Math.round(i.calories)}
                    </li>
                  ))}
                </ul>
                {after.reason ? <p className="coach-why">“{String(after.reason)}”</p> : null}
                {a.kind === 'suggest_meal' && (
                  <p className="admin-muted">
                    The person sees this as a suggestion to accept or keep their own.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      );
    }
    case 'day_plan':
      return (
        <p>
          <IonBadge
            color={
              after.plan === 'rest' ? 'medium' : after.plan === 'light' ? 'warning' : 'success'
            }
          >
            {PLAN_LABEL[String(after.plan)] ?? String(after.plan)}
          </IonBadge>{' '}
          {after.note ? String(after.note) : ''}
          {Number(after.kcal_adjust ?? 0) !== 0 && (
            <span className="admin-muted">
              {' '}
              ({Number(after.kcal_adjust) > 0 ? '+' : ''}
              {String(after.kcal_adjust)} kcal today)
            </span>
          )}
        </p>
      );
    case 'note':
      return <blockquote className="coach-quote">{String(after.text ?? '')}</blockquote>;
    case 'answer': {
      const question = d.queryText.get(String(after.query_id ?? ''));
      return (
        <>
          {question && <p className="admin-muted">They asked: “{question}”</p>}
          <blockquote className="coach-quote">{String(after.text ?? '')}</blockquote>
        </>
      );
    }
    case 'playbook':
      return <PlaybookPreview body={String(after.body ?? '')} />;
    case 'target':
      return (
        <p>
          {before.calories ? (
            <>
              <span className="coach-old">{String(before.calories)} kcal</span> →{' '}
            </>
          ) : null}
          <strong>{String(after.calories)} kcal</strong>, {String(after.protein_g)} g protein
          <br />
          <span className="coach-why">“{String(after.reason ?? '')}”</span>
        </p>
      );
    case 'assign_plan': {
      const plan = d.plans.get(String(after.plan_id));
      return (
        <p>
          <strong>{plan?.name ?? 'Coach plan'}</strong>
          {plan && <span className="admin-muted"> · {plan.days.join(' · ')}</span>}
          <br />
          <span className="coach-why">“{String(after.reason ?? '')}”</span>
        </p>
      );
    }
    case 'flag':
      return <p className="coach-flag">{String(after.text ?? '')}</p>;
    default:
      return null;
  }
}

function PlaybookPreview({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <pre className={`coach-playbook${open ? '' : ' coach-clamp'}`}>{body}</pre>
      {body.length > 180 && (
        <IonButton size="small" fill="clear" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show all'}
        </IonButton>
      )}
    </>
  );
}

function QuestionCard({
  q,
  person,
  busy,
  onAction,
}: {
  q: CoachOverview['questions'][number];
  person: string;
  busy: boolean;
  onAction: AiCoachViewProps['onAction'];
}) {
  const [answer, setAnswer] = useState('');
  return (
    <IonCard className={`coach-proposal${q.red_flag ? ' coach-red-card' : ''}`}>
      <IonCardContent>
        <div className="coach-proposal-title">
          <IonIcon icon={q.red_flag ? flagOutline : chatbubbleEllipsesOutline} />
          <strong>{q.red_flag ? `Red flag – ${person}` : person}</strong>
          <span className="admin-muted">{when(q.created_at)}</span>
        </div>
        <p className="coach-question">“{q.question}”</p>
        <p className="admin-muted">The app answered: {q.answer}</p>
        <IonTextarea
          fill="outline"
          autoGrow
          rows={2}
          placeholder="Your answer – they get it with a notification"
          value={answer}
          onIonInput={(e) => setAnswer(e.detail.value ?? '')}
        />
        <div className="coach-actions-row">
          <IonButton
            size="small"
            disabled={!answer.trim() || busy}
            onClick={() =>
              void onAction({ action: 'answer', query_id: q.id, text: answer }, 'Answer sent')
            }
          >
            Send answer
          </IonButton>
        </div>
      </IonCardContent>
    </IonCard>
  );
}

// ---------------------------------------------------------------------------
function ReportsSection({ d }: { d: CoachOverview }) {
  const [open, setOpen] = useState<string | null>(d.runs[0]?.id ?? null);
  if (!d.runs.length)
    return (
      <p className="coach-empty admin-muted">
        No reports yet. The head coach runs every morning at about 7:40.
      </p>
    );
  return (
    <>
      {d.runs.map((r) => (
        <IonCard key={r.id} className="coach-proposal">
          <IonCardContent>
            <button
              type="button"
              className="coach-run-head"
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              <strong>{when(r.started_at)}</strong>
              <span className="admin-muted">
                {r.mode === 'dry_run' ? 'dry run' : 'live'} · {r.people} people · {r.photos} photos
                · {r.actions} changes
              </span>
              {!r.finished_at && <IonBadge color="warning">running</IonBadge>}
              {r.error && <IonBadge color="danger">error</IonBadge>}
            </button>
            {open === r.id && (
              <pre className="admin-coach-report">{r.report || r.error || 'No report.'}</pre>
            )}
          </IonCardContent>
        </IonCard>
      ))}
    </>
  );
}

function HistorySection({
  d,
  busy,
  onAction,
  nameOf,
}: {
  d: CoachOverview;
  busy: boolean;
  onAction: AiCoachViewProps['onAction'];
  nameOf: (id: string | null) => string;
}) {
  if (!d.recent.length) return <p className="coach-empty admin-muted">No changes yet.</p>;
  return (
    <>
      {d.recent.map((a) => {
        const k = KIND[a.kind] ?? { icon: flagOutline, label: a.kind };
        return (
          <IonCard key={a.id} className="coach-proposal">
            <IonCardContent>
              <div className="coach-proposal-title">
                <IonIcon icon={k.icon} />
                <strong>
                  {k.label} · {nameOf(a.client_id)}
                </strong>
                <IonBadge
                  color={
                    a.status === 'applied'
                      ? 'success'
                      : a.status === 'refused'
                        ? 'danger'
                        : 'medium'
                  }
                >
                  {a.status === 'refused'
                    ? 'blocked'
                    : a.status === 'rejected'
                      ? 'skipped'
                      : a.status}
                </IonBadge>
              </div>
              <p className="admin-muted">{when(a.created_at)}</p>
              {a.status === 'refused' ? (
                <p className="coach-flag">Safety rule: {a.refused_reason}</p>
              ) : (
                <ActionDetail a={a} d={d} />
              )}
              {a.status === 'applied' && a.kind !== 'flag' && (
                <IonButton
                  size="small"
                  fill="outline"
                  disabled={busy}
                  onClick={() => void onAction({ action: 'undo', action_id: a.id }, 'Undone')}
                >
                  Undo
                </IonButton>
              )}
            </IonCardContent>
          </IonCard>
        );
      })}
    </>
  );
}

function PeopleSection({
  d,
  busy,
  onAction,
}: {
  d: CoachOverview;
  busy: boolean;
  onAction: AiCoachViewProps['onAction'];
}) {
  const admin = d.scope === 'admin';
  const [page, setPage] = useState<string>(admin ? 'shared' : (d.people[0]?.id ?? ''));
  const [text, setText] = useState<string | null>(null);
  const row = d.playbook.find((b) =>
    page === 'shared' ? b.client_id === null : b.client_id === page,
  );
  const value = text ?? row?.body ?? '';
  return (
    <>
      <IonCard className="coach-proposal">
        <IonCardContent>
          {d.people.length === 0 && (
            <p className="admin-muted">
              {admin
                ? 'Nobody yet. Either choose “FitCoach AI Coach” as a person’s trainer (AI-only), or a trainer turns on the AI assistant on their client’s page.'
                : 'Nobody yet. Open a client and switch on “AI assistant” on their Overview.'}
            </p>
          )}
          {d.people.map((p) => (
            <div key={p.id} className="coach-person">
              <strong>{p.full_name || p.email}</strong>
              {p.coach_consent_at ? (
                <IonBadge color="success">agreed</IonBadge>
              ) : (
                <IonBadge color="warning">not agreed yet</IonBadge>
              )}
              {admin && (
                <IonBadge color={p.assisted_by ? 'tertiary' : 'primary'}>
                  {p.assisted_by ? `assistant to ${p.assisted_by}` : 'AI-only'}
                </IonBadge>
              )}
              <span className="admin-muted">
                {p.language === 'kn' ? 'ಕನ್ನಡ' : 'English'}
                {p.health_conditions.length ? ` · ${p.health_conditions.join(', ')}` : ''}
              </span>
            </div>
          ))}
        </IonCardContent>
      </IonCard>
      <IonCard className="coach-proposal">
        <IonCardContent>
          <h3 className="coach-h coach-h-card">Playbook – what the day coach follows</h3>
          <IonSelect
            fill="outline"
            label="Page"
            labelPlacement="floating"
            value={page}
            onIonChange={(e) => {
              setPage(String(e.detail.value));
              setText(null);
            }}
          >
            {admin && <IonSelectOption value="shared">Shared rules (everyone)</IonSelectOption>}
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
            value={value}
            onIonInput={(e) => setText(e.detail.value ?? '')}
            style={{ marginTop: 8 }}
          />
          {row && (
            <p className="admin-muted">
              Last changed by{' '}
              {row.updated_by === 'claude'
                ? 'the head coach'
                : row.updated_by === 'trainer'
                  ? 'the trainer'
                  : 'an admin'}{' '}
              · {when(row.updated_at)}
            </p>
          )}
          <IonButton
            size="small"
            disabled={text === null || busy}
            onClick={() =>
              void onAction(
                {
                  action: 'save_playbook',
                  client_id: page === 'shared' ? null : page,
                  body: value,
                },
                'Playbook saved',
              ).then(() => setText(null))
            }
          >
            Save playbook
          </IonButton>
        </IonCardContent>
      </IonCard>
    </>
  );
}
