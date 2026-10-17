import { Capacitor } from '@capacitor/core';

/** Running inside the Android app (Capacitor), not the browser. */
export const isAndroidApp = Capacitor.getPlatform() === 'android';

/** An iPhone/iPad browser or home-screen web app. */
export const isIOSWeb =
  !Capacitor.isNativePlatform() &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
