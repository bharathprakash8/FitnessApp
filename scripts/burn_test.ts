// Checks for the "Calories burnt" sum (src/features/activity/model.ts).
// Run: npx deno test --node-modules-dir=none --no-check scripts/burn_test.ts
//
// The rule being protected (fixed 12 Nov 2026): the phone's resting energy already covers the
// whole day, so BMR is never added on top of it for the hours the watch was off.
import { bmr, resolveBurn } from '../src/features/activity/model.ts';

type Input = Parameters<typeof resolveBurn>[0];

const profile = {
  sex: 'male',
  height_cm: 175,
  timezone: 'Asia/Kolkata',
} as unknown as Input['profile'];
const WEIGHT = 80;
const AGE = 40;
const BMR = bmr(profile, WEIGHT, AGE)!; // 1,699 kcal a day

function eq(actual: unknown, expected: unknown, what: string) {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

const day = (over: Record<string, unknown>) =>
  ({
    client_id: 'c',
    activity_date: '2026-11-10',
    active_calories: 700,
    resting_calories: 1900,
    steps: 8000,
    sleep_minutes: 400,
    source: 'apple_shortcut',
    worn_hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    updated_at: '2026-11-11T01:30:00Z',
    ...over,
  }) as unknown as Input['row'];

const burn = (row: Input['row'], fraction = 1, over: Partial<Input> = {}) =>
  resolveBurn({ row, dayLogs: [], profile, weightKg: WEIGHT, age: AGE, fraction, ...over });

Deno.test('BMR of the test person', () => eq(BMR, 1699, 'bmr'));

Deno.test('watch worn 13 hours: the phone resting number is used as it is', () => {
  const b = burn(day({ resting_calories: 1868 }));
  eq(b.resting, 1868, 'resting');
  eq(b.restingEstimated, false, 'estimated');
  eq(b.total, 700 + 1868, 'total');
});

Deno.test('watch worn only 7 hours: still no top-up for the other 17', () => {
  const b = burn(day({ resting_calories: 1933, worn_hours: [9, 10, 11, 12, 13, 14, 15] }));
  eq(b.resting, 1933, 'resting');
  eq(b.total, 700 + 1933, 'total');
});

Deno.test('the result is the same however many hours the watch was worn', () => {
  const all = Array.from({ length: 24 }, (_, h) => h);
  for (const hours of [[], [8], all.slice(6, 12), all.slice(5, 21), all]) {
    eq(burn(day({ resting_calories: 2049, worn_hours: hours })).resting, 2049, `${hours.length} h`);
  }
});

Deno.test('iPhone without a watch (no resting data): BMR for the day, marked estimated', () => {
  const b = burn(day({ active_calories: 120, resting_calories: 0, worn_hours: [] }));
  eq(b.resting, BMR, 'resting');
  eq(b.restingEstimated, true, 'estimated');
});

Deno.test('partly covered day: BMR replaces the phone number, never adds to it', () => {
  const b = burn(day({ resting_calories: 1210, worn_hours: [] }));
  eq(b.resting, BMR, 'resting');
  eq(b.restingEstimated, true, 'estimated');
});

Deno.test('old sync without worn hours: phone number kept', () => {
  const b = burn(day({ resting_calories: 2000, worn_hours: null }));
  eq(b.resting, 2000, 'resting');
  eq(b.restingEstimated, false, 'estimated');
});

Deno.test('today at midday: a recent sync is kept, a morning-only sync is replaced', () => {
  const soFar = Math.round(BMR * 0.5); // 850
  eq(burn(day({ resting_calories: 800 }), 0.5).resting, 800, 'recent sync');
  const stale = burn(day({ resting_calories: 300 }), 0.5);
  eq(stale.resting, soFar, 'stale sync');
  eq(stale.restingEstimated, true, 'stale estimated');
});

Deno.test('typed-in active calories: BMR so far', () => {
  const b = burn(day({ source: 'manual', resting_calories: null, worn_hours: null }), 0.75);
  eq(b.resting, Math.round(BMR * 0.75), 'resting');
  eq(b.restingEstimated, true, 'estimated');
});

Deno.test('no data at all: BMR so far and nothing active', () => {
  const b = burn(null, 0.25);
  eq(b.active, 0, 'active');
  eq(b.resting, Math.round(BMR * 0.25), 'resting');
});

Deno.test('details missing (no BMR): the phone number is trusted', () => {
  const b = burn(day({ resting_calories: 1500 }), 1, { weightKg: null });
  eq(b.resting, 1500, 'resting');
  eq(b.restingEstimated, false, 'estimated');
});

Deno.test('resting is never more than the larger of the phone number and BMR so far', () => {
  for (const resting of [0, 300, 900, 1210, 1500, 1868, 2167, 2600]) {
    for (const fraction of [0.1, 0.5, 0.92, 1]) {
      for (const worn of [null, [], [8, 9, 10], Array.from({ length: 24 }, (_, h) => h)]) {
        const b = burn(day({ resting_calories: resting, worn_hours: worn }), fraction);
        const ceiling = Math.max(resting, Math.round(BMR * fraction));
        if (b.resting > ceiling) {
          throw new Error(`resting ${b.resting} > ${ceiling} (phone ${resting}, day ${fraction})`);
        }
        eq(b.total, b.active + b.resting, 'total');
      }
    }
  }
});

Deno.test('a workout logged while the watch was off is still added to active', () => {
  const log = {
    performed_on: '2026-11-10',
    performed_at: '2026-11-10T15:30:00Z', // 9 pm IST, watch off
    duration_min: null,
    machine_kcal: 150,
    exercises: { name: 'Dumbbell row', log_type: 'weights', muscle_group: 'Back' },
  } as unknown as Input['dayLogs'][number];
  const b = burn(day({ resting_calories: 1900 }), 1, { dayLogs: [log] });
  eq(b.workoutAdded, 150, 'workout added');
  eq(b.total, 700 + 150 + 1900, 'total');
});
