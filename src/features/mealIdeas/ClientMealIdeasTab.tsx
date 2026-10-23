import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonSpinner,
  IonText,
  IonTextarea,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ageFrom } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { DIET_LABELS, label, type Goal, type Sex } from '../profile/options';
import { useLatestWeight } from '../profile/api';
import { currentTarget, useTargets } from '../targets/api';
import { estimateTargets } from '../targets/estimate';
import {
  setFoodsToAvoid,
  useDeletePlan,
  useDraftPlan,
  useMealPlans,
  useSharePlan,
  useUpdatePlan,
  type PlanMeal,
} from './api';
import { PlanDays } from './PlanDays';
import './mealIdeas.css';
import { useT } from '../../i18n/i18n';

/**
 * Trainer → client → Meal ideas: AI drafts 7 days of short meal ideas from the client's own
 * food pattern, diet and targets; the trainer checks/edits each meal and shares it.
 */
export function ClientMealIdeasTab({ client }: { client: Profile }) {
  const t = useT();
  const qc = useQueryClient();
  const [toast] = useIonToast();
  const [confirm] = useIonAlert();
  const targets = useTargets(client.id);
  const weight = useLatestWeight(client.id);
  const plans = useMealPlans(client.id);
  const draft = useDraftPlan(client.id);
  const share = useSharePlan(client.id);
  const update = useUpdatePlan(client.id);
  const remove = useDeletePlan(client.id);
  const [note, setNote] = useState('');
  const [avoid, setAvoid] = useState(client.foods_to_avoid ?? '');
  const [savingAvoid, setSavingAvoid] = useState(false);

  const target = currentTarget(targets.data, client.timezone);
  const suggested = estimateTargets({
    weightKg: weight.data?.weight_kg ? Number(weight.data.weight_kg) : null,
    heightCm: client.height_cm ? Number(client.height_cm) : null,
    age: ageFrom(client.date_of_birth, client.timezone),
    sex: (client.sex as Sex) ?? null,
    goal: (client.goal as Goal) ?? null,
    activity: 'moderate',
  });
  const kcal = target?.calories ?? suggested?.calories ?? null;
  const protein = target?.protein_g ?? suggested?.protein_g ?? null;
  const plan = plans.data?.[0];

  const fail = (e: unknown) =>
    void toast({
      message: e instanceof Error ? e.message : 'Something went wrong',
      duration: 3000,
      color: 'danger',
      position: 'top',
    });

  async function saveAvoid() {
    setSavingAvoid(true);
    try {
      await setFoodsToAvoid(client.id, avoid);
      await qc.invalidateQueries({ queryKey: ['profiles'] });
      void toast({ message: t('Saved'), duration: 1200, position: 'top' });
    } catch (e) {
      fail(e);
    } finally {
      setSavingAvoid(false);
    }
  }

  function makeDraft() {
    if (!kcal || !protein) return;
    draft.mutate(
      {
        note: note.trim() || undefined,
        ...(target ? {} : { target_kcal: kcal, target_protein_g: protein }),
      },
      { onSuccess: () => setNote(''), onError: fail },
    );
  }

  function editMeal(di: number, mi: number, meal: PlanMeal) {
    if (!plan) return;
    const days = plan.days.map((d, i) =>
      i === di ? { ...d, meals: d.meals.map((m, j) => (j === mi ? meal : m)) } : d,
    );
    update.mutate({ id: plan.id, days }, { onError: fail });
  }

  return (
    <>
      <IonCard className="trainer-card">
        <IonCardHeader>
          <IonCardSubtitle>{t('7-day food ideas')}</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          {targets.isPending || weight.isPending ? (
            <IonSpinner name="dots" />
          ) : target ? (
            <p>
              {t('Fitted to their target:')}{' '}
              <strong>
                {target.calories} {t('kcal')}
              </strong>
              ,{' '}
              <strong>
                {target.protein_g ?? '–'} {t('g protein')}
              </strong>
              .
            </p>
          ) : suggested ? (
            <IonText color="warning">
              <p>
                {t('No targets set. Suggested (Estimated):')}{' '}
                <strong>
                  {suggested.calories} {t('kcal')}
                </strong>
                ,{' '}
                <strong>
                  {suggested.protein_g} {t('g protein')}
                </strong>{' '}
                {t('– the draft will use these. Set them properly in the Targets tab.')}
              </p>
            </IonText>
          ) : (
            <IonText color="warning">
              <p>{t('Set targets in the Targets tab first (their details are incomplete).')}</p>
            </IonText>
          )}
          <p className="ideas-muted">
            {t('Uses their last 30 days of food, diet (')}
            {label(DIET_LABELS, client.diet_preference) || t('not given')}
            {t(') and foods to avoid. Short ideas only – dish, portion, kcal, protein.')}
          </p>

          <IonTextarea
            fill="outline"
            label={t('Foods to avoid (allergies, dislikes)')}
            labelPlacement="stacked"
            autoGrow
            maxlength={300}
            value={avoid}
            onIonInput={(e) => setAvoid(String(e.detail.value ?? ''))}
          />
          {avoid !== (client.foods_to_avoid ?? '') && (
            <IonButton size="small" fill="outline" disabled={savingAvoid} onClick={saveAvoid}>
              {t('Save foods to avoid')}
            </IonButton>
          )}
          <IonTextarea
            fill="outline"
            label={t('Note for this draft (optional)')}
            labelPlacement="stacked"
            placeholder={t('e.g. more paneer, light dinners, office lunch box')}
            autoGrow
            maxlength={500}
            value={note}
            onIonInput={(e) => setNote(String(e.detail.value ?? ''))}
            style={{ marginTop: 10 }}
          />
          <IonButton
            expand="block"
            disabled={!kcal || !protein || draft.isPending}
            onClick={makeDraft}
            style={{ marginTop: 10 }}
          >
            {draft.isPending ? (
              <>
                <IonSpinner name="dots" /> {t('Drafting… (about 10 seconds)')}
              </>
            ) : plan ? (
              t('Draft a new 7 days')
            ) : (
              t('Draft 7 days')
            )}
          </IonButton>
        </IonCardContent>
      </IonCard>

      {plans.isPending ? null : !plan ? (
        <p className="ideas-muted ion-text-center">{t('No food ideas drafted yet.')}</p>
      ) : (
        <>
          <div className="ideas-actions">
            {plan.status === 'shared' ? (
              <IonButton
                fill="outline"
                disabled={share.isPending}
                onClick={() => share.mutate({ planId: plan.id, share: false }, { onError: fail })}
              >
                {t('Take back')}
              </IonButton>
            ) : (
              <IonButton
                disabled={share.isPending}
                onClick={() =>
                  share.mutate(
                    { planId: plan.id, share: true },
                    {
                      onSuccess: () =>
                        void toast({
                          message: t('Shared with the client'),
                          duration: 1500,
                          position: 'top',
                        }),
                      onError: fail,
                    },
                  )
                }
              >
                {t('Share with client')}
              </IonButton>
            )}
            <IonButton
              fill="outline"
              color="medium"
              onClick={() =>
                void confirm({
                  header: t('Delete these food ideas?'),
                  buttons: [
                    { text: t('Cancel'), role: 'cancel' },
                    {
                      text: t('Delete'),
                      role: 'destructive',
                      handler: () => remove.mutate(plan.id, { onError: fail }),
                    },
                  ],
                })
              }
            >
              {t('Delete')}
            </IonButton>
          </div>
          <p className="ideas-muted">
            <IonBadge color={plan.status === 'shared' ? 'success' : 'medium'}>
              {plan.status === 'shared' ? t('Shared') : t('Draft')}
            </IonBadge>{' '}
            {t('Estimated by AI')}
            {plan.edited ? t(', edited by you') : ''}
            {t('. Tap any meal to change it.')}
          </p>
          {plan.note && (
            <p className="ideas-note">
              {t('Note:')} {plan.note}
            </p>
          )}
          <PlanDays plan={plan} onEditMeal={editMeal} />
        </>
      )}
    </>
  );
}
