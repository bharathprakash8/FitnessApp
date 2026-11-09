// Where to go when onboarding finishes ("Take a photo of my next meal" → Log food). The route
// guard sends a finished person away from /onboarding; it reads this to pick the page. Kept for
// 30 seconds only, so an old value never redirects later.
const KEY = 'fc-after-onboarding';

export function setAfterOnboarding(path: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Private mode: the guard falls back to the home screen.
  }
}

export function afterOnboardingPath(): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as {
      path?: unknown;
      at?: unknown;
    } | null;
    if (
      v &&
      typeof v.path === 'string' &&
      v.path.startsWith('/') &&
      typeof v.at === 'number' &&
      Date.now() - v.at < 30_000
    ) {
      return v.path;
    }
  } catch {
    // ignore
  }
  return null;
}
