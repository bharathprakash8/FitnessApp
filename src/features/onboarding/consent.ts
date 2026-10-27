/**
 * Consent text shown during onboarding. If the wording changes, bump CONSENT_VERSION:
 * profiles.consent_version records which version each client accepted.
 */
export const CONSENT_VERSION = '2026-10-27';

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
    points: [
      'Your trainer and the admin. Nobody else.',
      'Food photos are analysed by Google’s Gemini AI to estimate calories, and may be used by Google to improve its services. Please photograph only your food.',
      'If you are on the AI coach, your logs, meal photos and health conditions are also reviewed by Claude AI (Anthropic) and Groq AI to coach you. You will be asked to agree to this separately.',
      'Meal photos are deleted automatically after 7 days.',
      'You can ask for all your data to be deleted at any time.',
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
