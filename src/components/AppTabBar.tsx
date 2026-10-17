import { IonIcon, IonLabel, IonTabBar, IonTabButton, useIonRouter } from '@ionic/react';

import type { TabDef } from './tabs';

/** Bottom tab bar. Used standalone (not inside IonTabs), so each page passes its own tab. */
export function AppTabBar({ tabs, selected }: { tabs: TabDef[]; selected: string }) {
  const router = useIonRouter();
  return (
    <IonTabBar slot="bottom" selectedTab={selected}>
      {tabs.map((t) => (
        <IonTabButton
          key={t.tab}
          tab={t.tab}
          onClick={(e) => {
            e.preventDefault();
            if (t.tab !== selected) router.push(t.path, 'root', 'replace');
          }}
        >
          <IonIcon icon={t.icon} aria-hidden="true" />
          <IonLabel>{t.label}</IonLabel>
        </IonTabButton>
      ))}
    </IonTabBar>
  );
}
