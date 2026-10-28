// Tiny translation helper (no library): the English text is the key, Kannada comes from
// kn.ts, and anything not translated yet simply stays in English.
//   const t = useT();  t('Today')  t('{n} days synced', { n: 3 })
import { useSyncExternalStore } from 'react';

import { kn } from './kn';

export type Language = 'en' | 'kn';
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', kn: 'ಕನ್ನಡ' };

const KEY = 'fitcoach.language';
let current: Language = readSaved();
const listeners = new Set<() => void>();

function readSaved(): Language {
  try {
    return localStorage.getItem(KEY) === 'kn' ? 'kn' : 'en';
  } catch {
    return 'en';
  }
}

/** Locale for dates and numbers in the current language. */
export function dateLocale(): string {
  return current === 'kn' ? 'kn-IN' : 'en-IN';
}

/** Switch the app's language now (the account setting is saved separately). */
export function setLanguage(lang: Language) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked */
  }
  document.documentElement.lang = lang === 'kn' ? 'kn' : 'en-IN';
  listeners.forEach((l) => l());
}

function fill(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translate outside React (toasts, errors). */
export function tr(en: string | null | undefined, vars?: Record<string, string | number>): string {
  if (!en) return '';
  return fill(current === 'kn' ? (kn[en] ?? en) : en, vars);
}

/** Translate in a component; re-renders when the language changes. */
export function useT() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  return tr;
}
