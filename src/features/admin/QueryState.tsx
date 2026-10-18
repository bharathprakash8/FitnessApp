import { IonButton, IonText } from '@ionic/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ListSkeleton } from '../../components/ListSkeleton';

/** Spinner / error with retry / children, for a TanStack query. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return <ListSkeleton rows={5} avatar />;
  }
  if (query.isError) {
    return (
      <div className="ion-padding ion-text-center">
        <IonText color="danger">
          <p>Couldn't load the data. Check your connection.</p>
        </IonText>
        <IonButton onClick={() => void query.refetch()}>Try again</IonButton>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}
