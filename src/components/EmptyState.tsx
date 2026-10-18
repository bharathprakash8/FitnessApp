import { IonButton, IonIcon } from '@ionic/react';

/** Friendly "nothing here yet" message with an icon and an optional action. */
export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title: string;
  text?: string;
  action?: { label: string; routerLink?: string; onClick?: () => void };
}) {
  return (
    <div className="app-empty">
      <IonIcon icon={icon} className="app-empty-icon" aria-hidden="true" />
      <p className="app-empty-title">{title}</p>
      {text && <p className="app-empty-text">{text}</p>}
      {action && (
        <IonButton size="small" routerLink={action.routerLink} onClick={action.onClick}>
          {action.label}
        </IonButton>
      )}
    </div>
  );
}
