// The Shortcut must be named exactly "FitCoach Sync" (see docs/iphone-shortcut.md).
const SHORTCUT_NAME = encodeURIComponent('FitCoach Sync');

/** Runs the Shortcut now (it reads the saved connection code itself). */
export const SHORTCUT_RUN_URL = `shortcuts://run-shortcut?name=${SHORTCUT_NAME}`;

/** Runs the Shortcut with a new connection code, which it saves for later runs. */
export const shortcutConnectUrl = (code: string) =>
  `shortcuts://run-shortcut?name=${SHORTCUT_NAME}&input=text&text=${encodeURIComponent(code)}`;
