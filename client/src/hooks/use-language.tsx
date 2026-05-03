import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useLayoutEffect } from "react";
import {
  ensureRest,
  isCoreLoaded,
  loadCore,
  loadRest,
  lookup,
  type TranslationKey,
  type Language,
} from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  isHebrew: boolean;
  // Accepts any string for back-compat with pages that reference keys not
  // present in the dictionary; missing keys fall through to the key itself.
  t: (key: TranslationKey | (string & {})) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function getInitialLanguage(): Language {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('language');
    if (saved === 'en' || saved === 'he') {
      return saved;
    }
  }
  return 'en';
}

if (typeof document !== 'undefined') {
  const initial = getInitialLanguage();
  document.documentElement.lang = initial;
  document.documentElement.dir = initial === 'he' ? 'rtl' : 'ltr';
  // Pre-warm the HE core chunk if HE is the persisted language so the very
  // first paint shows Hebrew strings instead of an EN flash.
  if (initial === 'he') {
    void loadCore('he');
  }
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type IdleScheduler = (cb: () => void, opts?: { timeout?: number }) => number;
interface MaybeIdleWindow {
  requestIdleCallback?: IdleScheduler;
}

function schedule(cb: () => void) {
  if (typeof window === 'undefined') return;
  const ric = (window as unknown as MaybeIdleWindow).requestIdleCallback;
  if (ric) ric(cb, { timeout: 2000 });
  else setTimeout(cb, 1500);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  // Bumped whenever a previously-missing dictionary finishes loading so all
  // consumers re-render with the correct strings.
  const [, setRevision] = useState(0);

  useIsoLayoutEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    localStorage.setItem('language', language);

    let cancelled = false;
    const tasks: Promise<unknown>[] = [];
    if (!isCoreLoaded(language)) tasks.push(loadCore(language));
    if (tasks.length) {
      void Promise.all(tasks).then(() => {
        if (!cancelled) setRevision((r) => r + 1);
      });
    }
    return () => { cancelled = true; };
  }, [language]);

  // After mount, when the browser is idle, preload the rest dictionary for
  // the active language so navigating to non-Home routes feels instant.
  useEffect(() => {
    schedule(() => {
      void ensureRest(language).then(() => setRevision((r) => r + 1));
    });
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => {
      const next: Language = prev === 'en' ? 'he' : 'en';
      // Pre-warm both core and rest for the new language so the toggle and
      // any subsequent navigation are immediate.
      if (!isCoreLoaded(next)) void loadCore(next).then(() => setRevision((r) => r + 1));
      void loadRest(next).then(() => setRevision((r) => r + 1));
      return next;
    });
  };

  const t = useCallback((key: TranslationKey | (string & {})): string => {
    return lookup(language, key as TranslationKey) ?? (key as string);
  }, [language]);

  const isHebrew = language === 'he';

  return (
    <LanguageContext.Provider value={{
      language,
      toggleLanguage,
      isHebrew,
      t
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
