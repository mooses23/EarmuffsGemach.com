// Translations registry — split four ways for landing-page perf.
//
//   translations-en-core.ts  (eager)  — strings used by Home, Header, Layout,
//                                       MobileMenu, location search, and the
//                                       founder's tribute. ~70 keys.
//   translations-en-rest.ts  (lazy)   — every other EN string. ~1.1k keys.
//   translations-he-core.ts  (lazy)   — HE counterpart of EN core.
//   translations-he-rest.ts  (lazy)   — HE counterpart of EN rest.
//
// The Home page only needs *-core to render. Non-Home pages call
// `ensureRest(language)` on import so their lazy chunk waits for the rest
// dictionary before the route mounts; that keeps `t()` from ever returning
// a raw key inside a rendered page.
import enCore, { type CoreTranslationKey } from "./translations-en-core";
import type { RestTranslationKey } from "./translations-en-rest";

export type TranslationKey = CoreTranslationKey | RestTranslationKey;
export type Language = "en" | "he";

type Dict = Readonly<Record<string, string>>;

interface LangBuckets {
  core?: Dict;
  rest?: Dict;
}

const dicts: Record<Language, LangBuckets> = {
  en: { core: enCore as Dict },
  he: {},
};

const inflight: { [K in Language]?: { core?: Promise<Dict>; rest?: Promise<Dict> } } = { en: {}, he: {} };

function ensureInflight(lang: Language) {
  return (inflight[lang] ??= {});
}

export function loadCore(lang: Language): Promise<Dict> {
  const cached = dicts[lang].core;
  if (cached) return Promise.resolve(cached);
  const slot = ensureInflight(lang);
  if (slot.core) return slot.core;
  slot.core = (async () => {
    const mod = lang === "he"
      ? await import("./translations-he-core")
      : await import("./translations-en-core");
    const d = (mod.default as unknown) as Dict;
    dicts[lang].core = d;
    return d;
  })();
  return slot.core;
}

export function loadRest(lang: Language): Promise<Dict> {
  const cached = dicts[lang].rest;
  if (cached) return Promise.resolve(cached);
  const slot = ensureInflight(lang);
  if (slot.rest) return slot.rest;
  slot.rest = (async () => {
    const mod = lang === "he"
      ? await import("./translations-he-rest")
      : await import("./translations-en-rest");
    const d = (mod.default as unknown) as Dict;
    dicts[lang].rest = d;
    return d;
  })();
  return slot.rest;
}

export function ensureRest(lang: Language): Promise<unknown> {
  // Used as a side-effect import by every lazy non-Home page so the route's
  // chunk doesn't resolve until the full dictionary is in memory.
  return Promise.all([loadCore(lang), loadRest(lang)]);
}

export function lookup(lang: Language, key: TranslationKey): string | undefined {
  const buckets = dicts[lang];
  return (
    buckets.core?.[key as string] ??
    buckets.rest?.[key as string] ??
    dicts.en.core?.[key as string] ??
    dicts.en.rest?.[key as string]
  );
}

export function isRestLoaded(lang: Language): boolean {
  return !!dicts[lang].rest;
}

export function isCoreLoaded(lang: Language): boolean {
  return !!dicts[lang].core;
}

// Back-compat: a few historical call sites do `translations[lang][key]`.
// The Proxy preserves that synchronous shape; until the requested chunk is
// loaded, falls back to whatever EN bucket has the key.
export const translations = new Proxy({} as Record<Language, Dict>, {
  get(_t, prop: string) {
    const lang = prop as Language;
    const buckets = dicts[lang];
    if (buckets.core || buckets.rest) {
      // Merge views; lazy at access time.
      return new Proxy({} as Dict, {
        get(_x, key: string) {
          return lookup(lang, key as TranslationKey) ?? key;
        },
      });
    }
    if (lang === "he") void loadCore("he");
    return new Proxy({} as Dict, {
      get(_x, key: string) {
        return (dicts.en.core?.[key] as string | undefined) ?? key;
      },
    });
  },
});
