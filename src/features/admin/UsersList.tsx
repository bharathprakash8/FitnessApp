import {
  IonBadge,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonText,
} from '@ionic/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { formatDate } from '../../lib/dates';
import type { Role } from '../auth/roles';
import { ROLE_COLORS, ROLE_LABELS, displayName, type AdminUser } from './api';
import { Avatar } from '../../components/Avatar';
import { QueryState } from './QueryState';

type RoleFilter = 'all' | Role;
type StatusFilter = 'all' | 'active' | 'inactive';

export function UsersList({ query }: { query: UseQueryResult<AdminUser[]> }) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  return (
    <>
      <IonSearchbar
        value={search}
        onIonInput={(e) => setSearch(String(e.detail.value ?? ''))}
        placeholder="Search name, email or phone"
        debounce={150}
      />
      <div style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
        <IonSelect
          label="Role"
          labelPlacement="stacked"
          fill="outline"
          interface="popover"
          value={role}
          onIonChange={(e) => setRole(e.detail.value as RoleFilter)}
          style={{ flex: 1 }}
        >
          <IonSelectOption value="all">All roles</IonSelectOption>
          <IonSelectOption value="client">Clients</IonSelectOption>
          <IonSelectOption value="trainer">Trainers</IonSelectOption>
          <IonSelectOption value="admin">Admins</IonSelectOption>
        </IonSelect>
        <IonSelect
          label="Status"
          labelPlacement="stacked"
          fill="outline"
          interface="popover"
          value={status}
          onIonChange={(e) => setStatus(e.detail.value as StatusFilter)}
          style={{ flex: 1 }}
        >
          <IonSelectOption value="all">All</IonSelectOption>
          <IonSelectOption value="active">Active</IonSelectOption>
          <IonSelectOption value="inactive">Deactivated</IonSelectOption>
        </IonSelect>
      </div>

      <QueryState query={query}>
        {(users) => <FilteredList users={users} search={search} role={role} status={status} />}
      </QueryState>
    </>
  );
}

function FilteredList({
  users,
  search,
  role,
  status,
}: {
  users: AdminUser[];
  search: string;
  role: RoleFilter;
  status: StatusFilter;
}) {
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const term = search.trim().toLowerCase();
  const shown = users.filter(
    (u) =>
      (role === 'all' || u.role === role) &&
      (status === 'all' || (status === 'active') === u.is_active) &&
      (!term || [u.full_name, u.email, u.phone].some((v) => v?.toLowerCase().includes(term))),
  );

  if (shown.length === 0) {
    return (
      <IonText color="medium">
        <p className="ion-padding ion-text-center">No users match.</p>
      </IonText>
    );
  }

  return (
    <IonList>
      {shown.map((u) => {
        const trainer = u.trainer_id ? byId.get(u.trainer_id) : undefined;
        return (
          <IonItem key={u.id} routerLink={`/admin/users/${u.id}`} detail>
            <Avatar slot="start" id={u.id} name={u.full_name} email={u.email} />
            <IonLabel>
              <h2>
                {displayName(u)}{' '}
                {!u.is_active && (
                  <IonBadge color="medium" style={{ verticalAlign: 'middle' }}>
                    Deactivated
                  </IonBadge>
                )}
              </h2>
              <p>{u.email}</p>
              {u.role === 'client' && <p>Trainer: {trainer ? displayName(trainer) : 'none'}</p>}
              <p>Added {formatDate(u.created_at)}</p>
            </IonLabel>
            <IonNote slot="end">
              <IonBadge color={ROLE_COLORS[u.role]}>{ROLE_LABELS[u.role]}</IonBadge>
            </IonNote>
          </IonItem>
        );
      })}
    </IonList>
  );
}
