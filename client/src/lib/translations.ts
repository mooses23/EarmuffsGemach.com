// Translations registry. EN ships in the initial bundle so the landing page
// renders instantly in the default language; HE is dynamically imported the
// first time the user switches to Hebrew. While HE is loading we transparently
// fall back to the EN string for the same key, so no rendered text ever
// disappears.
import enTranslations, { type TranslationKey } from "./translations-en";

export type { TranslationKey };
export type Language = "en" | "he";

const dicts: Partial<Record<Language, Readonly<Record<TranslationKey, string>>>> = {
  en: enTranslations as Readonly<Record<TranslationKey, string>>,
};

const inflight: Partial<Record<Language, Promise<Readonly<Record<TranslationKey, string>>>>> = {};

export function getDict(lang: Language): Readonly<Record<TranslationKey, string>> | undefined {
  return dicts[lang];
}

export function loadLanguage(lang: Language): Promise<Readonly<Record<TranslationKey, string>>> {
  const cached = dicts[lang];
  if (cached) return Promise.resolve(cached);
  const pending = inflight[lang];
  if (pending) return pending;
  let p: Promise<Readonly<Record<TranslationKey, string>>>;
  if (lang === "he") {
    p = import("./translations-he").then((m) => {
      const d = m.default as Readonly<Record<TranslationKey, string>>;
      dicts.he = d;
      return d;
    });
  } else {
    p = Promise.resolve(enTranslations as Readonly<Record<TranslationKey, string>>);
  }
  inflight[lang] = p;
  return p;
}

// Back-compat: a few call sites historically imported `translations[lang][key]`
// directly. The Proxy preserves that synchronous shape while still allowing
// the HE chunk to load lazily — until HE is ready we return the EN value.
export const translations = new Proxy({} as Record<Language, Readonly<Record<TranslationKey, string>>>, {
  get(_t, prop: string) {
    const lang = prop as Language;
    const d = dicts[lang];
    if (d) return d;
    if (lang === "he") {
      void loadLanguage("he");
    }
    return enTranslations as Readonly<Record<TranslationKey, string>>;
  },
});
