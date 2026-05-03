import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeHtml } from "./utils";

// "Suggested draft" card — shown after the AI generates a reply. Replaces the
// prior behavior where AI output overwrote `replyText` directly. The admin
// can keep typing without losing their work-in-progress and choose to Use the
// suggestion (replaces or appends) or Discard it.
export function SuggestedDraftCard({
  draft,
  hasUserText,
  onUse,
  onAppend,
  onDiscard,
}: {
  draft: string;
  hasUserText: boolean;
  onUse: () => void;
  onAppend: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="rounded-md border border-blue-300 bg-blue-50/70 dark:bg-blue-950/30 p-3 space-y-2"
      data-testid="card-suggested-draft"
      role="region"
      aria-label="Suggested AI draft"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
          <Sparkles className="h-4 w-4" />
          Suggested draft
        </div>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Discard suggested draft"
          className="text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
          data-testid="button-discard-suggested-draft"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className="rounded bg-background border p-2 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed"
        data-testid="text-suggested-draft"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft) }}
      />
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {hasUserText && (
          <Button
            size="sm"
            variant="outline"
            onClick={onAppend}
            data-testid="button-append-suggested-draft"
          >
            Append to my draft
          </Button>
        )}
        <Button
          size="sm"
          onClick={onUse}
          data-testid="button-use-suggested-draft"
        >
          {hasUserText ? "Replace with this" : "Use this draft"}
        </Button>
      </div>
    </div>
  );
}
