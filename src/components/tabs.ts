import { barbell, clipboard, fitness, people, person, restaurant, today } from 'ionicons/icons';

export interface TabDef {
  tab: string;
  path: string;
  label: string;
  icon: string;
}

export const CLIENT_TABS: TabDef[] = [
  { tab: 'today', path: '/today', label: 'Today', icon: today },
  { tab: 'food', path: '/food', label: 'Food', icon: restaurant },
  { tab: 'workouts', path: '/workouts', label: 'Workouts', icon: barbell },
  { tab: 'me', path: '/me', label: 'Me', icon: person },
];

export const TRAINER_TABS: TabDef[] = [
  { tab: 'clients', path: '/trainer', label: 'Clients', icon: people },
  { tab: 'plans', path: '/trainer/plans', label: 'Plans', icon: clipboard },
  { tab: 'fitness', path: '/today', label: 'My fitness', icon: fitness },
  { tab: 'me', path: '/trainer/me', label: 'Me', icon: person },
];
