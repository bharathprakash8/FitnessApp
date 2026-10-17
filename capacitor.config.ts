import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fitcoach.app',
  appName: 'FitCoach',
  webDir: 'dist',
  android: {
    // Release builds are signed in CI (see .github/workflows/android.yml).
    allowMixedContent: false,
  },
};

export default config;
