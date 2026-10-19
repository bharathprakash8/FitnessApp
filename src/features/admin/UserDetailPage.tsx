import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonRouter,
  useIonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { formatDate } from '../../lib/dates';
import type { Role } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import {
  ROLE_COLORS,
  ROLE_LABELS,
  displayName,
  loginInstructions,
  useAdminAction,
  useAdminUsers,
  type AdminUser,
} from './api';
import { QueryState } from './QueryState';
import { RoleSegment } from './RoleSegment';
import { TrainerSelect } from './TrainerSelect';
import { downloadBlob, exportUserData } from './exportUser';
import './admin.css';

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const users = useAdminUsers();
  const user = users.data?.find((u) => u.id === id);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin" />
          </IonButtons>
          <IonTitle>{user ? displayName(user) : 'User'}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <QueryState query={users}>
          {(all) =>
            user ? (
              // key: reset the form when switching users or after a save refreshes the data
              <UserEditor
                key={`${user.id}:${user.role}:${user.trainer_id}`}
                user={user}
                all={all}
              />
            ) : (
              <IonText color="medium">
                <p className="ion-text-center">This user no longer exists.</p>
              </IonText>
            )
          }
        </QueryState>
      </IonContent>
    </IonPage>
  );
}

function UserEditor({ user, all }: { user: AdminUser; all: AdminUser[] }) {
  const { profile: me } = useAuth();
  const action = useAdminAction();
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();

  const [fullName, setFullName] = useState(user.full_name ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [trainerId, setTrainerId] = useState(user.trainer_id ?? '');
  const [error, setError] = useState<string | null>(null);
  // Ionic keeps pages alive; don't show an old error when coming back to this one.
  useIonViewWillEnter(() => setError(null));

  const isMe = me?.id === user.id;
  const clientsOfTrainer = all.filter((u) => u.trainer_id === user.id);
  const roleChanged = role !== user.role;
  const blockedByClients = roleChanged && user.role === 'trainer' && clientsOfTrainer.length > 0;
  const dirty =
    fullName.trim() !== (user.full_name ?? '') ||
    phone.trim() !== (user.phone ?? '') ||
    roleChanged ||
    (role === 'client' && trainerId !== (user.trainer_id ?? ''));

  const notify = (message: string, color?: string) =>
    void toast({ message, duration: color === 'danger' ? 3500 : 2000, color, position: 'top' });

  async function run(body: Parameters<typeof action.mutateAsync>[0], done: string) {
    setError(null);
    try {
      await action.mutateAsync(body);
      notify(done);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      notify(message, 'danger');
      return false;
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return setError('Please enter a name.');
    if (role === 'client' && !trainerId) return setError('Please pick a trainer.');
    if (blockedByClients) return setError("Move this trainer's clients first (Assignments tab).");
    await run(
      {
        action: 'update',
        user_id: user.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
        role: roleChanged ? role : undefined,
        trainer_id: role === 'client' ? trainerId : undefined,
      },
      'Saved',
    );
  }

  const [exporting, setExporting] = useState(false);
  async function exportData() {
    setExporting(true);
    try {
      const blob = await exportUserData(user.id);
      const safe = (user.full_name || user.email).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      downloadBlob(blob, `fitcoach-data-${safe}-${new Date().toISOString().slice(0, 10)}.json`);
    } catch {
      void toast({ message: 'Could not export. Try again.', duration: 2500, color: 'danger' });
    } finally {
      setExporting(false);
    }
  }

  /** Privacy request: typed confirmation, then everything is deleted for good. */
  function confirmPurge() {
    void alert({
      header: 'Delete everything?',
      message: `This permanently deletes ${displayName(user)}, their account and ALL their data and photos. It cannot be undone. Consider exporting their data first. Type DELETE to confirm.`,
      inputs: [{ name: 'confirm', placeholder: 'DELETE' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete everything',
          role: 'destructive',
          handler: (data: { confirm?: string }) => {
            if ((data.confirm ?? '').trim().toUpperCase() !== 'DELETE') return false;
            void run({ action: 'purge', user_id: user.id }, 'User and all data deleted').then(
              (ok) => {
                if (ok) router.push('/admin', 'back');
              },
            );
            return true;
          },
        },
      ],
    });
  }

  function confirm(header: string, message: string, label: string, onYes: () => void) {
    void alert({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: label, role: 'destructive', handler: onYes },
      ],
    });
  }

  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(loginInstructions(user));
      notify('Login instructions copied');
    } catch {
      notify('Could not copy', 'danger');
    }
  }

  return (
    <div className="admin-form">
      <p style={{ marginTop: 0 }}>
        <IonBadge color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</IonBadge>{' '}
        {user.is_active ? (
          <IonBadge color="success">Active</IonBadge>
        ) : (
          <IonBadge color="medium">Deactivated</IonBadge>
        )}
        <br />
        <IonText color="medium">
          {user.email} · added {formatDate(user.created_at)}
        </IonText>
      </p>

      <form onSubmit={save} noValidate>
        <IonInput
          fill="outline"
          label="Full name"
          labelPlacement="floating"
          autocapitalize="words"
          value={fullName}
          onIonInput={(e) => setFullName(String(e.detail.value ?? ''))}
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
        <div>
          <IonText color="medium">
            <p className="admin-note" style={{ marginBottom: 6 }}>
              Role{isMe ? ' (you can’t change your own role)' : ''}
            </p>
          </IonText>
          <RoleSegment value={role} onChange={setRole} disabled={isMe} />
        </div>
        {blockedByClients && (
          <IonText color="warning">
            <p className="admin-note">
              This trainer has {clientsOfTrainer.length} client
              {clientsOfTrainer.length === 1 ? '' : 's'}. Move them to another trainer in the
              Assignments tab before changing the role.
            </p>
          </IonText>
        )}
        {role === 'client' && (
          <TrainerSelect
            users={all}
            value={trainerId}
            onChange={setTrainerId}
            excludeId={user.id}
          />
        )}
        {error && (
          <IonText color="danger" role="alert">
            <p className="admin-note">{error}</p>
          </IonText>
        )}
        <IonButton type="submit" expand="block" disabled={!dirty || action.isPending}>
          {action.isPending ? 'Saving…' : 'Save changes'}
        </IonButton>
      </form>

      {user.role === 'trainer' && (
        <IonList inset>
          <IonListHeader>
            <IonLabel>Clients ({clientsOfTrainer.length})</IonLabel>
          </IonListHeader>
          {clientsOfTrainer.length === 0 && (
            <IonItem lines="none">
              <IonLabel color="medium">No clients yet</IonLabel>
            </IonItem>
          )}
          {clientsOfTrainer.map((c) => (
            <IonItem key={c.id} routerLink={`/admin/users/${c.id}`} detail>
              <IonLabel>{displayName(c)}</IonLabel>
            </IonItem>
          ))}
        </IonList>
      )}

      <div className="admin-actions">
        <IonButton fill="outline" expand="block" onClick={() => void copyInstructions()}>
          Copy login instructions
        </IonButton>
        <IonButton
          fill="outline"
          expand="block"
          disabled={exporting}
          onClick={() => void exportData()}
        >
          {exporting ? 'Preparing…' : 'Export all their data (privacy request)'}
        </IonButton>
        {!isMe &&
          (user.is_active ? (
            <IonButton
              fill="outline"
              color="warning"
              expand="block"
              disabled={action.isPending}
              onClick={() =>
                confirm(
                  'Deactivate user?',
                  `${displayName(user)} won't be able to log in. Their data is kept and you can reactivate them later.`,
                  'Deactivate',
                  () => void run({ action: 'deactivate', user_id: user.id }, 'User deactivated'),
                )
              }
            >
              Deactivate
            </IonButton>
          ) : (
            <IonButton
              fill="outline"
              color="success"
              expand="block"
              disabled={action.isPending}
              onClick={() =>
                void run({ action: 'reactivate', user_id: user.id }, 'User reactivated')
              }
            >
              Reactivate
            </IonButton>
          ))}
        {!isMe && (
          <IonButton
            fill="clear"
            color="danger"
            expand="block"
            disabled={action.isPending}
            onClick={() =>
              confirm(
                'Delete user?',
                `This permanently deletes ${displayName(user)}. Only users with no data can be deleted – otherwise deactivate them.`,
                'Delete',
                () =>
                  void run({ action: 'delete', user_id: user.id }, 'User deleted').then((ok) => {
                    if (ok) router.push('/admin', 'back');
                  }),
              )
            }
          >
            Delete user
          </IonButton>
        )}
        {!isMe && (
          <IonButton
            fill="clear"
            color="danger"
            expand="block"
            disabled={action.isPending}
            onClick={confirmPurge}
          >
            Delete user and ALL their data
          </IonButton>
        )}
      </div>
    </div>
  );
}
