import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useLayoutEffect } from "react";
import { getDict, loadLanguage, type TranslationKey, type Language } from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  isHebrew: boolean;
  t: (key: TranslationKey) => string;
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
  // Kick off HE chunk load early if HE is the persisted language so the
  // first paint isn't stuck on EN strings.
  if (initial === 'he') {
    void loadLanguage('he');
  }
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  // Bumped whenever a previously-missing dictionary finishes loading so all
  // consumers re-render with the correct strings.
  const [, setRevision] = useState(0);

  useIsoLayoutEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    localStorage.setItem('language', language);

    if (!getDict(language)) {
      let cancelled = false;
      void loadLanguage(language).then(() => {
        if (!cancelled) setRevision((r) => r + 1);
      });
      return () => { cancelled = true; };
    }
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => {
      const next: Language = prev === 'en' ? 'he' : 'en';
      // Pre-warm the chunk so toggling feels instant.
      if (!getDict(next)) void loadLanguage(next).then(() => setRevision((r) => r + 1));
      return next;
    });
  };

  const t = useCallback((key: TranslationKey): string => {
    const dict = getDict(language) ?? getDict('en');
    return (dict && dict[key]) || key;
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
