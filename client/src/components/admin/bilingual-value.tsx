import { useEffect, useState, useRef } from "react";
import { Languages, Pencil, Check, X, Loader2, Star, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

type SupportedLang = "en" | "he";

interface BilingualValueProps {
  value: string | null | undefined;
  valueLang?: SupportedLang;
  fallbackLang?: SupportedLang;
  targetLang?: SupportedLang;
  allowEdit?: boolean;
  recordType?: "location" | "region" | "cityCategory";
  recordId?: number;
  fieldKey?: "name" | "description";
  className?: string;
}

function isHebrew(text: string) {
  return /[\u0590-\u05FF]/.test(text);
}

export function BilingualValue({
  value,
  valueLang,
  fallbackLang,
  targetLang = "he",
  allowEdit = false,
  recordType,
  recordId,
  fieldKey,
  className,
}: BilingualValueProps) {
  const text = (value ?? "").trim();
  const source: SupportedLang = valueLang ?? (text && isHebrew(text) ? "he" : "en");
  const needsTranslation = !!text && source !== targetLang;

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
    const cacheKey = `${source}::${targetLang}::${text}::${retryTick}`;
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
          items: [{ text, from: source, to: targetLang }],
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
  }, [text, source, targetLang, needsTranslation, retryTick]);

  if (!text) return null;

  if (!needsTranslation) {
    return <span className={className}>{text}</span>;
  }

  const display = translated ?? (fallbackLang === source ? text : null);

  const startEdit = () => {
    setDraft(translated ?? "");
    setIsEditing(true);
  };
  const cancelEdit = () => {
    setIsEditing(false);
    setDraft("");
  };
  const saveEdit = async () => {
    const next = draft.trim();
    if (!next) return cancelEdit();
    setSaving(true);
    try {
      await apiRequest("POST", "/api/translate/correction", {
        text,
        from: source,
        to: targetLang,
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

  if (isEditing) {
    return (
      <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 text-sm w-48"
          dir={targetLang === "he" ? "rtl" : "ltr"}
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

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`} dir={targetLang === "he" ? "rtl" : "ltr"}>
      {loading ? (
        <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" /> {text}
        </span>
      ) : display ? (
        <>
          <span>{display}</span>
          {isAdminCorrected ? (
            <Star className="h-3 w-3 text-amber-400" aria-label="admin-corrected" />
          ) : (
            <Languages className="h-3 w-3 text-slate-400" aria-label="auto-translated" />
          )}
          {allowEdit && (
            <Button size="icon" variant="ghost" className="h-5 w-5 opacity-60 hover:opacity-100" onClick={startEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </>
      ) : (
        <span className="inline-flex items-center gap-1">
          <span className="text-slate-400 text-xs italic" title={error || "translation_unavailable"}>
            {text}
          </span>
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
      )}
    </span>
  );
}
