import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonActionSheet,
  useIonAlert,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { add, arrowDown, arrowUp, ellipsisVertical } from 'ionicons/icons';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { planApi, useExercises, usePlan, usePlanMutation } from './api';
import { AssignPlanModal } from './AssignPlanModal';
import { ExercisePicker } from './ExercisePicker';
import { prescription, type PlanDayFull, type PlanExerciseFull, type PlanFull } from './model';
import { PlanExerciseEditor, type PlanExerciseFields } from './PlanExerciseEditor';
import './workouts.css';

export function PlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const plan = usePlan(id);
  // Load the exercise list (for "Add exercise") alongside the plan, not after it.
  useExercises();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/trainer/plans" />
          </IonButtons>
          <IonTitle>{plan.data?.name ?? 'Plan'}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="workout-page">
          {plan.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !plan.data ? (
            <IonText color="medium">
              <p className="ion-text-center">This plan no longer exists.</p>
            </IonText>
          ) : (
            <Editor plan={plan.data} />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Editor({ plan }: { plan: PlanFull }) {
  const { profile } = useAuth();
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [sheet] = useIonActionSheet();
  const [pickFor, setPickFor] = useState<PlanDayFull | null>(null);
  const [editing, setEditing] = useState<PlanExerciseFull | null>(null);
  const [assigning, setAssigning] = useState(false);

  const fail = () =>
    void toast({ message: 'Could not save. Try again.', duration: 2500, color: 'danger' });
  const mutate = usePlanMutation(plan.id, (fn: () => Promise<void>) => fn());
  const run = (fn: () => Promise<void>, after?: () => void) =>
    mutate.mutate(fn, { onSuccess: after, onError: fail });

  const days = plan.plan_days;

  function addDay() {
    const next = days.length ? Math.max(...days.map((d) => d.day_index)) + 1 : 0;
    askText('New day', `Day ${days.length + 1}`, (title) =>
      run(() => planApi.addDay(plan.id, next, title)),
    );
  }

  function askText(header: string, value: string, onOk: (v: string) => void) {
    void alert({
      header,
      inputs: [{ name: 'v', value, attributes: { maxlength: 60 } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data: { v?: string }) => {
            const v = (data.v ?? '').trim();
            if (!v) return false;
            onOk(v);
            return true;
          },
        },
      ],
    });
  }

  /** Swap a day (or exercise) with its neighbour by exchanging their order values. */
  function moveDay(i: number, dir: -1 | 1) {
    const a = days[i];
    const b = days[i + dir];
    if (!a || !b) return;
    run(async () => {
      await planApi.updateDay(a.id, { day_index: b.day_index });
      await planApi.updateDay(b.id, { day_index: a.day_index });
    });
  }

  function moveExercise(day: PlanDayFull, i: number, dir: -1 | 1) {
    const list = day.plan_exercises;
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    // Renumber the whole day so equal sort_order values can't get stuck.
    const order = list.map((x) => x.id);
    order.splice(i, 1);
    order.splice(i + dir, 0, a.id);
    run(async () => {
      for (const [idx, peId] of order.entries()) {
        await planApi.updateExercise(peId, { sort_order: idx });
      }
    });
  }

  function dayMenu(day: PlanDayFull, i: number) {
    void sheet({
      header: day.title,
      buttons: [
        {
          text: 'Rename',
          handler: () =>
            askText('Rename day', day.title, (t) =>
              run(() => planApi.updateDay(day.id, { title: t })),
            ),
        },
        ...(i > 0 ? [{ text: 'Move up', handler: () => moveDay(i, -1) }] : []),
        ...(i < days.length - 1 ? [{ text: 'Move down', handler: () => moveDay(i, 1) }] : []),
        {
          text: 'Delete day',
          role: 'destructive',
          handler: () =>
            void alert({
              header: `Delete ${day.title}?`,
              message: 'Its exercises are removed from the plan. Logged workouts are kept.',
              buttons: [
                { text: 'Cancel', role: 'cancel' },
                {
                  text: 'Delete',
                  role: 'destructive',
                  handler: () => run(() => planApi.removeDay(day.id)),
                },
              ],
            }),
        },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
  }

  function planMenu() {
    if (!profile) return;
    void sheet({
      header: plan.name,
      buttons: [
        {
          text: 'Duplicate plan',
          handler: () => {
            let newId = '';
            run(
              async () => {
                newId = await planApi.duplicate(plan, profile.id);
              },
              () => router.push(`/trainer/plans/${newId}`, 'forward', 'replace'),
            );
          },
        },
        {
          text: 'Delete plan',
          role: 'destructive',
          handler: () =>
            void alert({
              header: 'Delete this plan?',
              message:
                'Clients on this plan will no longer see it. Their logged workouts are kept.',
              buttons: [
                { text: 'Cancel', role: 'cancel' },
                {
                  text: 'Delete',
                  role: 'destructive',
                  handler: () =>
                    run(
                      () => planApi.remove(plan.id),
                      () => router.push('/trainer/plans', 'back'),
                    ),
                },
              ],
            }),
        },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
  }

  return (
    <>
      <PlanDetails
        key={`${plan.name}|${plan.description}`}
        plan={plan}
        onSave={(f) => run(() => planApi.update(plan.id, f))}
      />

      <div className="workout-day-actions" style={{ margin: '12px 0' }}>
        <IonButton onClick={() => setAssigning(true)}>Assign to clients</IonButton>
        <IonButton fill="outline" onClick={planMenu}>
          More
        </IonButton>
      </div>

      {days.map((day, i) => (
        <IonCard key={day.id} className="workout-card">
          <IonCardHeader>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <IonCardTitle>{day.title}</IonCardTitle>
              <IonButton
                fill="clear"
                aria-label={`Options for ${day.title}`}
                onClick={() => dayMenu(day, i)}
              >
                <IonIcon icon={ellipsisVertical} />
              </IonButton>
            </div>
          </IonCardHeader>
          <IonCardContent>
            {day.plan_exercises.length === 0 && <p className="workout-muted">No exercises yet.</p>}
            <IonList lines="full">
              {day.plan_exercises.map((pe, j) => (
                <IonItem key={pe.id} button detail={false} onClick={() => setEditing(pe)}>
                  <IonLabel>
                    <h3>{pe.exercises.name}</h3>
                    <p>{prescription(pe)}</p>
                    {pe.notes && <p>{pe.notes}</p>}
                  </IonLabel>
                  <IonButtons slot="end">
                    <IonButton
                      aria-label="Move up"
                      disabled={j === 0 || mutate.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveExercise(day, j, -1);
                      }}
                    >
                      <IonIcon icon={arrowUp} />
                    </IonButton>
                    <IonButton
                      aria-label="Move down"
                      disabled={j === day.plan_exercises.length - 1 || mutate.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveExercise(day, j, 1);
                      }}
                    >
                      <IonIcon icon={arrowDown} />
                    </IonButton>
                  </IonButtons>
                </IonItem>
              ))}
            </IonList>
            <IonButton fill="clear" size="small" onClick={() => setPickFor(day)}>
              <IonIcon slot="start" icon={add} />
              Add exercise
            </IonButton>
          </IonCardContent>
        </IonCard>
      ))}

      <IonButton expand="block" fill="outline" onClick={addDay}>
        <IonIcon slot="start" icon={add} />
        Add day
      </IonButton>

      {profile && (
        <ExercisePicker
          isOpen={pickFor !== null}
          trainerId={plan.trainer_id}
          onClose={() => setPickFor(null)}
          onPick={(ex) => {
            const day = pickFor;
            setPickFor(null);
            if (!day) return;
            const nextOrder = day.plan_exercises.length
              ? Math.max(...day.plan_exercises.map((p) => p.sort_order)) + 1
              : 0;
            run(() =>
              planApi.addExercise({
                plan_day_id: day.id,
                exercise_id: ex.id,
                sort_order: nextOrder,
                sets: 3,
                reps: ex.log_type === 'timed' ? '30 s' : '10',
                rest_seconds: 60,
              }),
            );
          }}
        />
      )}

      <PlanExerciseEditor
        item={editing}
        busy={mutate.isPending}
        onClose={() => setEditing(null)}
        onSave={(fields: PlanExerciseFields) => {
          const pe = editing;
          if (pe)
            run(
              () => planApi.updateExercise(pe.id, fields),
              () => setEditing(null),
            );
        }}
        onRemove={() => {
          const pe = editing;
          if (pe)
            run(
              () => planApi.removeExercise(pe.id),
              () => setEditing(null),
            );
        }}
      />

      <AssignPlanModal planId={plan.id} isOpen={assigning} onClose={() => setAssigning(false)} />
    </>
  );
}

function PlanDetails({
  plan,
  onSave,
}: {
  plan: PlanFull;
  onSave: (fields: { name: string; description: string | null }) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? '');
  const dirty = name.trim() !== plan.name || description.trim() !== (plan.description ?? '');

  return (
    <div className="workout-form">
      <IonInput
        fill="outline"
        label="Plan name"
        labelPlacement="floating"
        maxlength={80}
        value={name}
        onIonInput={(e) => setName(String(e.detail.value ?? ''))}
      />
      <IonTextarea
        fill="outline"
        label="Description (optional)"
        labelPlacement="floating"
        autoGrow
        maxlength={1000}
        value={description}
        onIonInput={(e) => setDescription(String(e.detail.value ?? ''))}
      />
      {dirty && name.trim() && (
        <IonButton
          size="small"
          onClick={() => onSave({ name: name.trim(), description: description.trim() || null })}
        >
          Save name and description
        </IonButton>
      )}
    </div>
  );
}
