import { IonItem, IonLabel, IonList, IonSkeletonText } from '@ionic/react';

/** Grey placeholder rows while a list loads – feels faster than a spinner. */
export function ListSkeleton({ rows = 4, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <IonList aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <IonItem key={i} lines="full">
          {avatar && (
            <IonSkeletonText
              slot="start"
              animated
              style={{ width: 40, height: 40, borderRadius: '50%' }}
            />
          )}
          <IonLabel>
            <h3>
              <IonSkeletonText animated style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            </h3>
            <p>
              <IonSkeletonText animated style={{ width: `${35 + ((i * 23) % 40)}%` }} />
            </p>
          </IonLabel>
        </IonItem>
      ))}
    </IonList>
  );
}
