import { useEffect, useState, useRef } from "react";
import { Languages, Pencil, Check, X, Loader2, Star, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

type SupportedLang = "en" | "he";

export interface BilingualValueProps {
  /** Canonical English value if known. */
  en?: string | null;
  /** Canonical Hebrew value if known. */
  he?: string | null;
  /**
   * Legacy single-value mode: caller hands one string and tells us its
   * language. Used for application free-text fields (city, country,
   * community) where no canonical _He column exists.
   */
  value?: string | null;
  valueLang?: SupportedLang;

  /** Optional record metadata so admin corrections write back to a canonical column. */
  recordType?: "location" | "region" | "cityCategory";
  recordId?: number;
  fieldKey?: "name" | "description";

  /** Whether to render both sides (default true when both canonical values exist). */
  showBoth?: boolean;
  /** When only one side exists, which side should we auto-translate to? */
  targetLang?: SupportedLang;
  /** Whether admin can inline-edit the auto-translated side. */
  allowEdit?: boolean;

  /**
   * "review" applies the stronger "auto · review" nudge (used for person
   * names and street addresses, which machine-translation handles poorly).
   * Defaults to "default".
   */
  variant?: "default" | "review";

  className?: string;
}

function isHebrew(text: string) {
  return /[\u0590-\u05FF]/.test(text);
}

interface SideProps {
  lang: SupportedLang;
  text: string;
  isAdminCorrected?: boolean;
  className?: string;
}
function CanonicalSide({ lang, text, className }: SideProps) {
  return (
    <span dir={lang === "he" ? "rtl" : "ltr"} className={className}>
      {text}
    </span>
  );
}

/**
 * Renders the canonical EN/HE pair for a record field. When one side is
 * missing, auto-translates it via /api/translate (cache-first) and lets
 * admins inline-correct the result — corrections are persisted to the
 * canonical column when recordType/recordId/fieldKey are provided.
 */
export function BilingualValue(props: BilingualValueProps) {
  const {
    en,
    he,
    value,
    valueLang,
    recordType,
    recordId,
    fieldKey,
    showBoth = true,
    targetLang,
    allowEdit = false,
    variant = "default",
    className,
  } = props;

  // Normalise the inputs into canonical EN/HE strings + figure out which
  // side (if any) needs translation.
  let canonicalEn = (en ?? "").trim() || null;
  let canonicalHe = (he ?? "").trim() || null;
  if (!canonicalEn && !canonicalHe && value) {
    const trimmed = value.trim();
    if (trimmed) {
      const lang: SupportedLang = valueLang ?? (isHebrew(trimmed) ? "he" : "en");
      if (lang === "en") canonicalEn = trimmed;
      else canonicalHe = trimmed;
    }
  }

  // Which side is missing? targetLang prop wins; otherwise we translate
  // toward whichever side is empty.
  const missingSide: SupportedLang | null =
    canonicalEn && !canonicalHe ? "he"
    : canonicalHe && !canonicalEn ? "en"
    : null;
  const translateTo: SupportedLang | null = missingSide ?? null;
  const sourceText = translateTo === "he" ? canonicalEn : translateTo === "en" ? canonicalHe : null;
  const sourceLang: SupportedLang | null = translateTo === "he" ? "en" : translateTo === "en" ? "he" : null;
  const needsTranslation = !!translateTo && !!sourceText && !!sourceLang;
  const effectiveTarget: SupportedLang | undefined = translateTo ?? targetLang;

  const [translated, setTranslated] = useState<string | null>(null);
  const [isAdminCorrected, setIsAdminCorrected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!needsTranslation) {
      setTranslated(null);
      setIsAdminCorrected(false);
      setError(null);
      return;
    }
    const cacheKey = `${sourceLang}::${translateTo}::${sourceText}::${retryTick}`;
    if (fetchedFor.current === cacheKey) return;
    fetchedFor.current = cacheKey;
    setTranslated(null);
    setIsAdminCorrected(false);
    setLoading(true);
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/translate", {
          items: [{ text: sourceText!, from: sourceLang!, to: translateTo! }],
        });
        const data = await res.json();
        if (cancelled) return;
        const r = data.results?.[0];
        if (r?.translated) {
          setTranslated(r.translated);
          setIsAdminCorrected(!!r.isAdminCorrected);
        } else {
          setError(r?.error || "translation_unavailable");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "translation_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceText, sourceLang, translateTo, needsTranslation, retryTick]);

  // Nothing to show at all.
  if (!canonicalEn && !canonicalHe) return null;

  const startEdit = () => { setDraft(translated ?? ""); setIsEditing(true); };
  const cancelEdit = () => { setIsEditing(false); setDraft(""); };
  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || !sourceText || !sourceLang || !translateTo) return cancelEdit();
    setSaving(true);
    try {
      await apiRequest("POST", "/api/translate/correction", {
        text: sourceText,
        from: sourceLang,
        to: translateTo,
        translatedText: next,
        recordType,
        recordId,
        fieldKey,
      });
      setTranslated(next);
      setIsAdminCorrected(true);
      setIsEditing(false);
    } catch (e) {
      console.warn("[BilingualValue] save correction failed", e);
    } finally {
      setSaving(false);
    }
  };

  // Compute the "translated side" rendering once.
  const renderTranslatedSide = () => {
    if (!needsTranslation || !effectiveTarget) return null;
    if (isEditing) {
      return (
        <span className="inline-flex items-center gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 text-sm w-48"
            dir={effectiveTarget === "he" ? "rtl" : "ltr"}
            autoFocus
          />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEdit} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-500" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit} disabled={saving}>
            <X className="h-3 w-3" />
          </Button>
        </span>
      );
    }
    if (loading) {
      return (
        <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" /> {sourceText}
        </span>
      );
    }
    if (translated) {
      return (
        <span className="inline-flex items-center gap-1" dir={effectiveTarget === "he" ? "rtl" : "ltr"}>
          <span>{translated}</span>
          {isAdminCorrected ? (
            <span className="inline-flex items-center gap-0.5 px-1 rounded text-[10px] bg-amber-500/15 text-amber-500" title="admin-corrected">
              <Star className="h-2.5 w-2.5" /> saved
            </span>
          ) : variant === "review" ? (
            <span className="inline-flex items-center gap-0.5 px-1 rounded text-[10px] bg-orange-500/15 text-orange-500 font-medium" title="auto-translated — admin should review name/address">
              <Languages className="h-2.5 w-2.5" /> auto · review
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1 rounded text-[10px] bg-slate-500/15 text-slate-400" title="auto-translated">
              <Languages className="h-2.5 w-2.5" /> auto
            </span>
          )}
          {allowEdit && (
            <Button size="icon" variant="ghost" className="h-5 w-5 opacity-60 hover:opacity-100" onClick={startEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </span>
      );
    }
    // Translation unavailable: show original + retry + optional manual edit.
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-slate-400 text-xs italic" title={error || "translation_unavailable"}>{sourceText}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 opacity-60 hover:opacity-100"
          onClick={() => setRetryTick((n) => n + 1)}
          title="Retry translation"
          aria-label="Retry translation"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        {allowEdit && (
          <Button size="icon" variant="ghost" className="h-5 w-5 opacity-60 hover:opacity-100" onClick={startEdit} title="Provide translation">
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </span>
    );
  };

  // Render both canonical sides when both are present (or one canonical +
  // the translated counterpart when the other is missing). If the caller
  // only wants the missing side translated, set showBoth={false}.
  const enSide = canonicalEn ?? (translateTo === "en" ? null : null);
  const heSide = canonicalHe ?? (translateTo === "he" ? null : null);
  const translatedSide = renderTranslatedSide();

  if (!showBoth && translatedSide) {
    return <span className={className}>{translatedSide}</span>;
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className ?? ""}`}>
      {enSide && <CanonicalSide lang="en" text={enSide} />}
      {!enSide && translateTo === "en" && translatedSide}
      {(enSide && (heSide || (translateTo === "he" && translatedSide))) && (
        <span className="text-slate-400 text-xs">·</span>
      )}
      {heSide && <CanonicalSide lang="he" text={heSide} />}
      {!heSide && translateTo === "he" && translatedSide}
    </span>
  );
}
