import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  useIonToast,
} from '@ionic/react';
import { bugOutline } from 'ionicons/icons';
import { useState } from 'react';

import { EmptyState } from '../../components/EmptyState';
import type { AdminUser } from './api';
import { KIND_LABELS, problemReport, when } from './problemText';
import { useProblems, useResolveProblems, useScreenshotUrl, type Problem } from './supportApi';
import './admin.css';

/** Admin → Problems: what went wrong in the app or on the server, newest first. */
export function ProblemsTab({
  users,
  userId: fixedUser,
}: {
  users: AdminUser[];
  /** Only this person's problems (Diagnostics page). */
  userId?: string;
}) {
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [userId, setUserId] = useState<string>(fixedUser ?? '');
  const problems = useProblems({ userId: userId || undefined, open: show === 'open' });
  const resolve = useResolveProblems();
  const [toast] = useIonToast();
  const names = new Map(users.map((u) => [u.id, u.full_name || u.email]));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Unknown user') : 'No user');

  async function copy(p: Problem) {
    try {
      await navigator.clipboard.writeText(problemReport(p, nameOf(p.user_id)));
      void toast({ message: 'Copied – paste it to Claude', duration: 1800, position: 'top' });
    } catch {
      void toast({ message: 'Could not copy', duration: 1800, position: 'top' });
    }
  }

  const list = problems.data ?? [];
  return (
    <div className="admin-problems">
      <IonSegment value={show} onIonChange={(e) => setShow(e.detail.value as 'open' | 'all')}>
        <IonSegmentButton value="open">
          <IonLabel>Open</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="all">
          <IonLabel>All (30 days)</IonLabel>
        </IonSegmentButton>
      </IonSegment>
      {!fixedUser && (
        <IonSelect
          fill="outline"
          label="Person"
          labelPlacement="stacked"
          interface="action-sheet"
          value={userId}
          onIonChange={(e) => setUserId(String(e.detail.value ?? ''))}
          style={{ marginTop: 10 }}
        >
          <IonSelectOption value="">Everyone</IonSelectOption>
          {users.map((u) => (
            <IonSelectOption key={u.id} value={u.id}>
              {u.full_name || u.email}
            </IonSelectOption>
          ))}
        </IonSelect>
      )}
      {list.length > 1 && show === 'open' && (
        <IonButton
          size="small"
          fill="clear"
          onClick={() => resolve.mutate({ ids: list.map((p) => p.id), resolved: true })}
        >
          Mark all {list.length} as resolved
        </IonButton>
      )}

      {problems.isPending ? null : list.length === 0 ? (
        <EmptyState
          icon={bugOutline}
          title={show === 'open' ? 'No open problems' : 'No problems in 30 days'}
        />
      ) : (
        list.map((p) => (
          <ProblemCard
            key={p.id}
            p={p}
            person={nameOf(p.user_id)}
            onCopy={() => void copy(p)}
            onResolve={(r) => resolve.mutate({ ids: [p.id], resolved: r })}
          />
        ))
      )}
    </div>
  );
}

function ProblemCard({
  p,
  person,
  onCopy,
  onResolve,
}: {
  p: Problem;
  person: string;
  onCopy: () => void;
  onResolve: (resolved: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const shot = useScreenshotUrl(open ? p.screenshot_path : null);
  return (
    <IonCard className={`problem-card ${p.resolved ? 'resolved' : ''}`}>
      <IonCardContent>
        <button type="button" className="problem-head" onClick={() => setOpen((o) => !o)}>
          <IonBadge
            color={p.kind === 'report' ? 'warning' : p.kind === 'crash' ? 'danger' : 'medium'}
          >
            {KIND_LABELS[p.kind] ?? p.kind}
          </IonBadge>
          <span className="problem-meta">
            {person} · {when(p.created_at)}
          </span>
          <span className="problem-msg">{p.message}</span>
        </button>
        {open && (
          <div className="problem-body">
            <p>
              <strong>Screen:</strong> {p.screen ?? '–'}
              <br />
              <strong>App:</strong> {p.app_version ?? '–'} · {p.platform ?? '–'}
              {(p.details as { by_admin?: boolean })?.by_admin
                ? ' · while you were logged in as them'
                : ''}
            </p>
            {shot.data && (
              <a href={shot.data} target="_blank" rel="noopener">
                <img src={shot.data} alt="Screenshot from the user" className="problem-shot" />
              </a>
            )}
            <pre className="problem-details">{JSON.stringify(p.details, null, 2)}</pre>
            <p className="problem-device">{p.device}</p>
          </div>
        )}
        <div className="problem-actions">
          <IonButton size="small" onClick={onCopy}>
            Copy for Claude
          </IonButton>
          <IonButton size="small" fill="outline" onClick={() => onResolve(!p.resolved)}>
            {p.resolved ? 'Reopen' : 'Resolved'}
          </IonButton>
        </div>
      </IonCardContent>
    </IonCard>
  );
}
