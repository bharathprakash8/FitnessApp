// One-time setup codes (owner, 8 Nov 2026): 8 characters the admin sends on WhatsApp, e.g.
// "KX7P-M3QD". Letters and digits that are hard to mix up (no 0/O, 1/I/L). Only the SHA-256
// of the normalised code is stored.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SETUP_CODE_DAYS = 7;

export function newSetupCode(): string {
  const out: string[] = [];
  const bytes = new Uint8Array(32);
  while (out.length < 8) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // 248 = 8 × 31: drop the top values so every character is equally likely.
      if (b < 248 && out.length < 8) out.push(ALPHABET[b % 31]);
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4).join('')}`;
}

/** Upper case, without spaces or dashes. */
export function normaliseSetupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function hashSetupCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normaliseSetupCode(code)),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
