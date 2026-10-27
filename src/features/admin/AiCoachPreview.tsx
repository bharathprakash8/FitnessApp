import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import { useState } from 'react';

import type { CoachAction, CoachOverview } from './coachAdminApi';
import { AiCoachView } from './AiCoachView';

// DEVELOPMENT ONLY (/dev/ai-coach, never in the production build): the AI Coach tab with
// realistic sample data, to check the layout without an admin login.
const now = new Date().toISOString();
const P1 = 'p1';
const P2 = 'p2';
const action = (
  id: string,
  client: string | null,
  kind: string,
  after: object,
  before: object | null = null,
): CoachAction =>
  ({
    id,
    run_id: 'r1',
    client_id: client,
    kind,
    target_id: kind.includes('meal') ? 'm1' : null,
    before,
    after,
    reason: null,
    status: 'proposed',
    refused_reason: null,
    decided_at: null,
    created_at: now,
  }) as CoachAction;

function sample(): CoachOverview {
  const proposed = [
    action(
      'a1',
      P1,
      'correct_meal',
      {
        kind: 'correct_meal',
        meal_id: 'm1',
        items: [
          { name: 'Idli', portion: '2 pieces (one under the other)', calories: 140 },
          { name: 'Medu vada', portion: '1 piece', calories: 160 },
          { name: 'Coconut chutney (thin)', portion: 'about 5 tbsp', calories: 130 },
        ],
        reason: 'A second idli is under the first one, and there is about 5 tbsp of chutney.',
      },
      {
        items: [
          { name: 'Idli', calories: 70 },
          { name: 'Medu vada', calories: 150 },
          { name: 'Green chutney', calories: 120 },
        ],
        total_calories: 340,
      },
    ),
    action('a2', P1, 'day_plan', {
      plan: 'light',
      note: '15–20 minute slow walk on flat ground, then 5 minutes of deep breathing.',
      kcal_adjust: 0,
    }),
    action('a3', P1, 'note', {
      text: 'ಶುಭೋದಯ! ಇಂದು ಸಮತಟ್ಟಾದ ಜಾಗದಲ್ಲಿ 15–20 ನಿಮಿಷ ನಿಧಾನವಾಗಿ ನಡೆಯಿರಿ. ಊಟದಲ್ಲಿ ಮೊಸರು ಮತ್ತು ದಾಲ್ ಸೇರಿಸಿ.',
    }),
    action('a4', P1, 'assign_plan', {
      plan_id: 'plan1',
      reason: '62 with knee pain and BP, no plan yet.',
    }),
    action('a5', P2, 'answer', {
      query_id: 'q9',
      text: 'Supplements are for your doctor to decide. For protein, add tofu, soya chunks and dal – you are at 20 g of 100 g today.',
    }),
    action(
      'a6',
      P2,
      'target',
      {
        calories: 1750,
        protein_g: 95,
        reason: 'Two weeks steady at 1,850 with no weight change; small step down.',
      },
      { calories: 1850 },
    ),
    action('a7', P2, 'playbook', {
      body: 'Vegan, 38, goal: maintain.\n- Protein usually far below target: suggest tofu, soya, dal at every meal.\n- South Indian breakfasts; idlis often stacked.\n- 27 Oct: dizziness after gym → keep it light until a doctor checks.',
    }),
    action('a8', P2, 'flag', {
      text: 'Reported dizziness and a tight chest after the gym. Please check in with them.',
    }),
    action('a9', P2, 'check_meal', {}),
  ];
  return {
    coach: { id: 'c', full_name: 'FitCoach AI Coach' },
    mode: 'dry_run',
    scope: 'admin',
    people: [
      {
        id: P1,
        full_name: 'Amma',
        email: 'amma@example.com',
        coach_consent_at: now,
        health_conditions: ['knee', 'bp'],
        language: 'kn',
      },
      {
        id: P2,
        full_name: 'Priya',
        email: 'priya@example.com',
        coach_consent_at: null,
        health_conditions: [],
        language: 'en',
      },
    ],
    runs: [
      {
        id: 'r1',
        mode: 'dry_run',
        source: 'claude',
        started_at: now,
        finished_at: now,
        people: 2,
        photos: 3,
        actions: 9,
        report:
          'Reviewed 2 people, 3 photos, 1 red flag.\n\nAmma: breakfast had 2 idlis → 430 kcal…',
        error: null,
      },
    ],
    proposed,
    recent: [
      {
        ...action(
          'h1',
          P1,
          'correct_meal',
          proposed[0]!.after as object,
          proposed[0]!.before as object,
        ),
        status: 'applied',
      },
      {
        ...action('h2', P1, 'assign_plan', { plan_id: 'x' }),
        status: 'refused',
        refused_reason: 'Plan not safe for this person: Goblet squat, Romanian deadlift',
      },
    ],
    questions: [
      {
        id: 'q1',
        client_id: P2,
        question: 'I feel dizzy and my chest feels tight after the gym',
        answer:
          'Please stop what you are doing, sit down and contact your doctor now, or call 108.',
        model: null,
        red_flag: true,
        status: 'escalated',
        escalate_reason: null,
        follow_up: null,
        follow_up_by: null,
        followed_up_at: null,
        created_at: now,
      },
      {
        id: 'q2',
        client_id: P1,
        question: 'Can I stop my BP tablet now that I walk daily?',
        answer: 'Only your doctor can decide about your BP tablet.',
        model: 'groq',
        red_flag: false,
        status: 'escalated',
        escalate_reason: null,
        follow_up: null,
        follow_up_by: null,
        followed_up_at: null,
        created_at: now,
      },
    ],
    playbook: [
      { client_id: null, body: 'Shared coaching rules…', updated_by: 'admin', updated_at: now },
    ],
    plans: new Map([
      [
        'plan1',
        {
          name: 'Gentle start (55+)',
          days: ['Walk + chair strength', 'Gentle yoga', 'Walk + balance'],
        },
      ],
    ]),
    meals: new Map([
      [
        'm1',
        {
          id: 'm1',
          meal_type: 'breakfast',
          eaten_at: now,
          photo_path: 'x.jpg',
          items: [],
          total_calories: 340,
        },
      ],
    ]),
    queryText: new Map([['q9', 'Should I start creatine?']]),
    photoUrls: { 'x.jpg': '/icon.svg' },
  };
}

export function AiCoachPreviewPage() {
  const [data, setData] = useState(sample);
  const [toast] = useIonToast();
  const onAction = async (body: Record<string, unknown>, done: string) => {
    const ids = [body.action_id, ...((body.action_ids as string[]) ?? []), body.query_id];
    setData((d) => ({
      ...d,
      proposed: d.proposed.filter((a) => !ids.includes(a.id)),
      questions: d.questions.filter((q) => !ids.includes(q.id)),
    }));
    if (done) void toast({ message: done, duration: 1500, position: 'top', color: 'success' });
  };
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>AI Coach (preview)</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <AiCoachView data={data} busy={false} onAction={onAction} />
      </IonContent>
    </IonPage>
  );
}
