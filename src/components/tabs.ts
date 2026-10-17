import { people, person, today } from 'ionicons/icons';

export interface TabDef {
  tab: string;
  path: string;
  label: string;
  icon: string;
}

export const CLIENT_TABS: TabDef[] = [
  { tab: 'today', path: '/today', label: 'Today', icon: today },
  { tab: 'me', path: '/me', label: 'Me', icon: person },
];

export const TRAINER_TABS: TabDef[] = [
  { tab: 'clients', path: '/trainer', label: 'Clients', icon: people },
  { tab: 'me', path: '/trainer/me', label: 'Me', icon: person },
];
