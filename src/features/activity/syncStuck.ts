// Notices an iPhone Shortcut that was connected but never sent anything.
import { useLastSync } from './api';

const CONNECTED_AT_KEY = 'fitcoach.iphoneConnectedAt';
const GRACE_MS = 3 * 60_000; // a first sync normally arrives within a minute

/** Remember when "Connect" was tapped on this phone, to notice a sync that never arrives. */
export function rememberConnect() {
  try {
    localStorage.setItem(CONNECTED_AT_KEY, new Date().toISOString());
  } catch {
    /* storage blocked */
  }
}

function connectedAt(): number | null {
  try {
    const v = localStorage.getItem(CONNECTED_AT_KEY);
    return v ? Date.parse(v) : null;
  } catch {
    return null;
  }
}

function isStuck(hasCode: boolean, lastSyncAt: string | null | undefined): boolean {
  if (!hasCode || lastSyncAt === undefined) return false;
  const since = connectedAt();
  if (lastSyncAt === null) return since === null || Date.now() - since > GRACE_MS;
  return since !== null && Date.parse(lastSyncAt) < since && Date.now() - since > GRACE_MS;
}

/**
 * iPhone: true when the Shortcut was connected but nothing arrived – almost always because
 * Health access for Shortcuts was refused or the permission sheet was skipped.
 */
export function useIphoneSyncStuck(personId: string | undefined, hasCode: boolean) {
  const last = useLastSync(hasCode ? personId : undefined);
  return isStuck(hasCode, last.isPending ? undefined : (last.data?.at ?? null));
}
