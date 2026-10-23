import { useState } from 'react';

import { impersonatedName, isImpersonating, stopImpersonation } from '../lib/impersonation';

/** Shown on every screen while the admin is logged in as someone else. */
export function ImpersonationBar() {
  const [busy, setBusy] = useState(false);
  if (!isImpersonating()) return null;

  async function back() {
    setBusy(true);
    const ok = await stopImpersonation();
    // Full reload so no screen keeps the other person's data.
    window.location.href = ok ? '/admin' : '/login';
  }

  return (
    <div className="impersonation-bar" role="status">
      <span>
        Logged in as <strong>{impersonatedName()}</strong>
      </span>
      <button type="button" disabled={busy} onClick={() => void back()}>
        {busy ? '…' : 'Back to admin'}
      </button>
    </div>
  );
}
