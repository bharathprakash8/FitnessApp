import { IonIcon, IonLabel, IonTabBar, IonTabButton, useIonRouter } from '@ionic/react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../features/auth/useAuth';
import { CLIENT_TABS, TRAINER_TABS, type TabDef } from './tabs';

/** Bottom tab bar. Used standalone (not inside IonTabs), so each page passes its own tab. */
export function AppTabBar({ tabs, selected }: { tabs: TabDef[]; selected: string }) {
  const router = useIonRouter();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  // Trainers use the client's Today, Food and Workouts pages as "My fitness".
  const asTrainer = profile?.role === 'trainer' && tabs === CLIENT_TABS;
  const shown = asTrainer ? TRAINER_TABS : tabs;
  const current = asTrainer ? (selected === 'me' ? 'me' : 'fitness') : selected;
  return (
    <IonTabBar slot="bottom" selectedTab={current}>
      {shown.map((t) => (
        <IonTabButton
          key={t.tab}
          tab={t.tab}
          onClick={(e) => {
            e.preventDefault();
            if (pathname !== t.path) router.push(t.path, 'root', 'replace');
          }}
        >
          <IonIcon icon={t.icon} aria-hidden="true" />
          <IonLabel>{t.label}</IonLabel>
        </IonTabButton>
      ))}
    </IonTabBar>
  );
}
