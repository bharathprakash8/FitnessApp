/**
 * Consent text shown during onboarding and, when it changes, once to everyone already using
 * the app (ConsentUpdate). If the wording changes, bump CONSENT_VERSION:
 * profiles.consent_version records which version each person accepted.
 * Keep this true to what the app does, and public/privacy.html saying the same.
 */
export const CONSENT_VERSION = '2026-11-05';

/** True for someone already using the app who hasn't accepted the current wording. */
export function needsConsentUpdate(profile: {
  role: string;
  onboarded_at: string | null;
  consent_version: string | null;
}): boolean {
  return (
    (profile.role === 'client' || profile.role === 'trainer') &&
    Boolean(profile.onboarded_at) &&
    profile.consent_version !== CONSENT_VERSION
  );
}

export function consentSections(role: string): { title: string; points: string[] }[] {
  return CONSENT_SECTIONS.map((s) =>
    role === 'trainer' && s.title === 'Who can see it'
      ? { ...s, points: ['You and the admin. Your clients can’t see it.', ...s.points.slice(1)] }
      : s,
  );
}

const CONSENT_SECTIONS: { title: string; points: string[] }[] = [
  {
    title: 'What we collect',
    points: [
      'Your profile: date of birth, sex, height, weight, goal, diet preference and any injuries you tell us about.',
      'Food photos and food logs, workout logs, and activity (calories burnt, steps, sleep) from your phone.',
      'Body measurements and progress photos, if you add them.',
    ],
  },
  {
    title: 'Who can see it',
    points: ['Your trainer and the admin. No other people.'],
  },
  {
    title: 'AI services we use',
    points: [
      'Food photos and food descriptions are sent to Google’s Gemini AI to estimate calories, and may be used by Google to improve its services. Please photograph only your food.',
      'To write your insights, weekly summaries and meal ideas, your first name, goal, diet preference, foods to avoid and your food, workout, weight and activity numbers are sent to Groq AI, with Google’s Gemini AI as a backup.',
      'If you are on the AI coach, your logs, meal photos and health conditions are also reviewed by Google’s Gemini AI to coach you, and may be used by Google to improve its services. Your agreement to this is asked in the AI coach terms.',
      'These AI services may run outside India.',
    ],
  },
  {
    title: 'Where it is kept',
    points: [
      'Your data is stored on a private server in South Korea.',
      'Meal photos are deleted from the app automatically after 7 days. Encrypted backups, which only the admin can open, keep copies for up to 35 days.',
      'You can ask for all your data to be deleted at any time. Encrypted backups of it are removed within 90 days.',
    ],
  },
  {
    title: 'Health',
    points: [
      'Please check with a doctor before starting a new exercise or diet programme, especially if you have a medical condition or injury.',
      'Calories and nutrition numbers in the app are estimates, not medical advice.',
    ],
  },
];
