import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  BookOpen,
  Plus,
  Save,
  Trash2,
  Sparkles,
  RotateCcw,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  Search,
  Brain,
  X,
} from "lucide-react";
import type { PlaybookFact, FaqEntry, KnowledgeDoc, ReplyExample } from "@shared/schema";
import { SCENARIOS_RESETTABLE_TITLES } from "@shared/scenarios-content";

// ─── Query keys ───────────────────────────────────────────────────────────────

const FACT_KEY = ["/api/admin/playbook-facts"] as const;
const FAQ_KEY = ["/api/admin/faq-entries"] as const;
const DOCS_KEY = ["/api/admin/knowledge-docs"] as const;
const REPLIES_KEY = ["/api/admin/reply-examples"] as const;

// ─── Unified entry model ──────────────────────────────────────────────────────

type EntryKind = "fact" | "faq" | "guide";
type FilterPill = "all" | "facts" | "guides" | "inactive";

interface UnifiedEntry {
  kind: EntryKind;
  id: number;
  displayLabel: "Fact" | "Guide";
  previewText: string;
  titleText: string;
  isActive: boolean;
  raw: PlaybookFact | FaqEntry | KnowledgeDoc;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("_");
  return slug || `fact_${Date.now()}`;
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function buildEntries(facts: PlaybookFact[], faqs: FaqEntry[], docs: KnowledgeDoc[]): UnifiedEntry[] {
  const out: UnifiedEntry[] = [];
  for (const f of facts) {
    out.push({
      kind: "fact",
      id: f.id,
      displayLabel: "Fact",
      previewText: f.factValue || "",
      titleText: f.factValue || "",
      isActive: true,
      raw: f,
    });
  }
  for (const faq of faqs) {
    out.push({
      kind: "faq",
      id: faq.id,
      displayLabel: "Fact",
      previewText: faq.question ? `${faq.question} — ${faq.answer}` : faq.answer,
      titleText: faq.question || faq.answer,
      isActive: faq.isActive !== false,
      raw: faq,
    });
  }
  for (const doc of docs) {
    out.push({
      kind: "guide",
      id: doc.id,
      displayLabel: "Guide",
      previewText: doc.title,
      titleText: doc.title,
      isActive: doc.isActive !== false,
      raw: doc,
    });
  }
  return out;
}

// ─── Inline edit forms ────────────────────────────────────────────────────────

function LangToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400">Language</span>
      {(["en", "he"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            value === lang
              ? "bg-blue-600 text-white"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
          }`}
        >
          {lang === "en" ? "English" : "Hebrew"}
        </button>
      ))}
    </div>
  );
}

function FactEditForm({
  entry,
  edits,
  setEdits,
}: {
  entry: UnifiedEntry;
  edits: Record<string, any>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const key = `fact-${entry.id}`;
  const raw = entry.raw as PlaybookFact;
  const current = { ...raw, ...(edits[key] || {}) };
  return (
    <div className="space-y-2">
      <Label className="text-xs text-slate-400">What should the AI know?</Label>
      <Textarea
        rows={3}
        value={current.factValue}
        onChange={(ev) =>
          setEdits((p) => ({ ...p, [key]: { ...p[key], factValue: ev.target.value } }))
        }
        className="text-sm"
        data-testid={`edit-fact-value-${entry.id}`}
      />
    </div>
  );
}

function FaqEditForm({
  entry,
  edits,
  setEdits,
}: {
  entry: UnifiedEntry;
  edits: Record<string, any>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const key = `faq-${entry.id}`;
  const raw = entry.raw as FaqEntry;
  const current = { ...raw, ...(edits[key] || {}) };
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">What is the borrower asking?</Label>
        <Input
          value={current.question}
          onChange={(ev) =>
            setEdits((p) => ({ ...p, [key]: { ...p[key], question: ev.target.value } }))
          }
          className="text-sm"
          data-testid={`edit-faq-question-${entry.id}`}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">What should the AI answer?</Label>
        <Textarea
          rows={3}
          value={current.answer}
          onChange={(ev) =>
            setEdits((p) => ({ ...p, [key]: { ...p[key], answer: ev.target.value } }))
          }
          className="text-sm"
          data-testid={`edit-faq-answer-${entry.id}`}
        />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <LangToggle
          value={current.language || "en"}
          onChange={(v) => setEdits((p) => ({ ...p, [key]: { ...p[key], language: v } }))}
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">Active</span>
          <Switch
            checked={!!current.isActive}
            onCheckedChange={(v) =>
              setEdits((p) => ({ ...p, [key]: { ...p[key], isActive: v } }))
            }
          />
        </div>
      </div>
    </div>
  );
}

function GuideEditForm({
  entry,
  edits,
  setEdits,
}: {
  entry: UnifiedEntry;
  edits: Record<string, any>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const key = `guide-${entry.id}`;
  const raw = entry.raw as KnowledgeDoc;
  const current = { ...raw, ...(edits[key] || {}) };
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Guide title</Label>
        <Input
          value={current.title}
          onChange={(ev) =>
            setEdits((p) => ({ ...p, [key]: { ...p[key], title: ev.target.value } }))
          }
          className="text-sm"
          data-testid={`edit-guide-title-${entry.id}`}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Content — policies, rules, scenarios</Label>
        <Textarea
          rows={6}
          value={current.body}
          onChange={(ev) =>
            setEdits((p) => ({ ...p, [key]: { ...p[key], body: ev.target.value } }))
          }
          className="text-sm"
          data-testid={`edit-guide-body-${entry.id}`}
        />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <LangToggle
          value={current.language || "en"}
          onChange={(v) => setEdits((p) => ({ ...p, [key]: { ...p[key], language: v } }))}
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">Active</span>
          <Switch
            checked={!!current.isActive}
            onCheckedChange={(v) =>
              setEdits((p) => ({ ...p, [key]: { ...p[key], isActive: v } }))
            }
          />
        </div>
      </div>
    </div>
  );
}

// ─── Reply examples synopsis ──────────────────────────────────────────────────

function ReplyExamplesSection() {
  const { toast } = useToast();
  const { data: replies = [] } = useQuery<ReplyExample[]>({ queryKey: REPLIES_KEY });
  const [panelOpen, setPanelOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);

  const clearAllMut = useMutation({
    mutationFn: async () => {
      await Promise.all(replies.map((r) => apiRequest("DELETE", `/api/admin/reply-examples/${r.id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REPLIES_KEY });
      setExamplesOpen(false);
      toast({ title: "Cleared", description: "All reply examples removed." });
    },
    onError: () => toast({ title: "Failed to clear", variant: "destructive" }),
  });

  const synopsis =
    replies.length === 0
      ? "No replies captured yet. Once you reply to messages from the inbox, the AI will learn from your writing style."
      : replies.length === 1
      ? "From 1 saved reply, the AI is beginning to learn your typical tone and phrasing."
      : `From ${replies.length} saved replies, the AI has learned your typical tone, common phrases, and how you handle deposit and return questions.`;

  return (
    <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-700/50 text-left hover:bg-slate-800/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <Brain className="h-4 w-4 text-purple-400 shrink-0" />
            <span className="font-medium text-sm text-slate-200">
              What the AI has learned from your replies
            </span>
            {replies.length > 0 && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {replies.length}
              </Badge>
            )}
          </div>
          {panelOpen ? (
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 px-4 pb-4 pt-3 rounded-lg border border-slate-700/30 bg-slate-800/20 space-y-4">
          <p className="text-sm text-slate-300 italic">{synopsis}</p>

          {replies.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors"
                onClick={() => setExamplesOpen((v) => !v)}
              >
                {examplesOpen ? "Hide captured examples" : "View captured examples"}
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto text-xs h-7 border-red-800/50 text-red-400 hover:bg-red-900/20"
                  >
                    Clear all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all reply examples?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {replies.length} captured reply example
                      {replies.length !== 1 ? "s" : ""} from the AI's training data. Future drafts
                      will no longer be influenced by past replies until new ones are captured.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => clearAllMut.mutate()}
                      disabled={clearAllMut.isPending}
                    >
                      Clear all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {examplesOpen && replies.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {replies.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border border-slate-700/40 bg-slate-800/30 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center gap-2 text-slate-400 flex-wrap">
                    {r.senderName && (
                      <span className="font-medium text-slate-300">{r.senderName}</span>
                    )}
                    {r.classification && (
                      <Badge variant="outline" className="text-xs">
                        {r.classification}
                      </Badge>
                    )}
                    <span className="ml-auto">{r.wasEdited ? "Edited by admin" : "Sent as drafted"}</span>
                  </div>
                  {r.incomingSubject && (
                    <div className="text-slate-400">Subject: {r.incomingSubject}</div>
                  )}
                  <div className="text-slate-300">
                    {truncate(r.sentReply.replace(/\s+/g, " ").trim(), 200)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Notebook content ─────────────────────────────────────────────────────────

export function GlossaryContent() {
  const { toast } = useToast();

  const { data: facts = [], isLoading: loadingFacts } = useQuery<PlaybookFact[]>({ queryKey: FACT_KEY });
  const { data: faqs = [], isLoading: loadingFaqs } = useQuery<FaqEntry[]>({ queryKey: FAQ_KEY });
  const { data: docs = [], isLoading: loadingDocs } = useQuery<KnowledgeDoc[]>({ queryKey: DOCS_KEY });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterPill>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetType, setSheetType] = useState<"fact" | "guide">("fact");
  const [sheetText, setSheetText] = useState("");
  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetBody, setSheetBody] = useState("");
  const [sheetLang, setSheetLang] = useState("en");

  const isLoading = loadingFacts || loadingFaqs || loadingDocs;

  const allEntries = useMemo(() => buildEntries(facts, faqs, docs), [facts, faqs, docs]);

  const filtered = useMemo(() => {
    let entries = allEntries;
    if (filter === "facts") entries = entries.filter((e) => e.displayLabel === "Fact" && e.isActive);
    else if (filter === "guides") entries = entries.filter((e) => e.displayLabel === "Guide" && e.isActive);
    else if (filter === "inactive") entries = entries.filter((e) => !e.isActive);
    else entries = entries.filter((e) => e.isActive);

    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.previewText.toLowerCase().includes(q) ||
          e.titleText.toLowerCase().includes(q),
      );
    }
    return entries;
  }, [allEntries, filter, search]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const saveFact = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      (await apiRequest("PATCH", `/api/admin/playbook-facts/${id}`, data)).json(),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: FACT_KEY });
      setEdits((p) => { const n = { ...p }; delete n[`fact-${id}`]; return n; });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const saveFaq = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      (await apiRequest("PATCH", `/api/admin/faq-entries/${id}`, data)).json(),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: FAQ_KEY });
      setEdits((p) => { const n = { ...p }; delete n[`faq-${id}`]; return n; });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const saveGuide = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      (await apiRequest("PATCH", `/api/admin/knowledge-docs/${id}`, data)).json(),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      setEdits((p) => { const n = { ...p }; delete n[`guide-${id}`]; return n; });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteFact = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/playbook-facts/${id}`),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: FACT_KEY });
      setExpanded((p) => { const n = { ...p }; delete n[`fact-${id}`]; return n; });
      toast({ title: "Deleted" });
    },
  });

  const deleteFaq = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/faq-entries/${id}`),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: FAQ_KEY });
      setExpanded((p) => { const n = { ...p }; delete n[`faq-${id}`]; return n; });
      toast({ title: "Deleted" });
    },
  });

  const deleteGuide = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/knowledge-docs/${id}`),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      setExpanded((p) => { const n = { ...p }; delete n[`guide-${id}`]; return n; });
      toast({ title: "Deleted" });
    },
  });

  const resetGuide = useMutation({
    mutationFn: async (id: number): Promise<KnowledgeDoc> =>
      (await apiRequest("POST", `/api/admin/knowledge-docs/${id}/reset-to-default`, {})).json(),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      setEdits((p) => { const n = { ...p }; delete n[`guide-${id}`]; return n; });
      toast({ title: "Restored to default" });
    },
    onError: () => toast({ title: "Reset failed", variant: "destructive" }),
  });

  const seedMut = useMutation({
    mutationFn: async (): Promise<any> =>
      (await apiRequest("POST", "/api/admin/knowledge-docs/seed", {})).json(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      const parts: string[] = [];
      if ((r?.created ?? 0) > 0) parts.push(`${r.created} created`);
      if ((r?.updated ?? 0) > 0) parts.push(`${r.updated} updated`);
      if ((r?.skipped ?? 0) > 0) parts.push(`${r.skipped} already current`);
      toast({ title: "Sync complete", description: parts.join(", ") || "No changes." });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const backfillMut = useMutation({
    mutationFn: async (): Promise<any> =>
      (await apiRequest("POST", "/api/admin/embeddings/backfill", {})).json(),
    onSuccess: (r) =>
      toast({ title: "Re-indexed", description: `${r?.created ?? 0} new sources indexed.` }),
    onError: () => toast({ title: "Re-index failed", variant: "destructive" }),
  });

  const createFact = useMutation({
    mutationFn: async ({ text }: { text: string }) =>
      (
        await apiRequest("POST", "/api/admin/playbook-facts", {
          factKey: slugify(text),
          factValue: text,
          category: "general",
        })
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FACT_KEY });
      setSheetOpen(false);
      setSheetText("");
      toast({ title: "Fact added" });
    },
    onError: () => toast({ title: "Failed to add", variant: "destructive" }),
  });

  const createGuide = useMutation({
    mutationFn: async ({
      title,
      body,
      language,
    }: {
      title: string;
      body: string;
      language: string;
    }) =>
      (
        await apiRequest("POST", "/api/admin/knowledge-docs", {
          title,
          body,
          category: "general",
          language,
          isActive: true,
        })
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      setSheetOpen(false);
      setSheetTitle("");
      setSheetBody("");
      setSheetLang("en");
      toast({ title: "Guide added" });
    },
    onError: () => toast({ title: "Failed to add", variant: "destructive" }),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function handleSave(entry: UnifiedEntry) {
    const key = `${entry.kind}-${entry.id}`;
    const delta = edits[key] || {};
    if (entry.kind === "fact") saveFact.mutate({ id: entry.id, data: delta });
    else if (entry.kind === "faq") saveFaq.mutate({ id: entry.id, data: delta });
    else saveGuide.mutate({ id: entry.id, data: delta });
  }

  function handleDelete(entry: UnifiedEntry) {
    if (!confirm(`Delete this ${entry.displayLabel.toLowerCase()}?`)) return;
    if (entry.kind === "fact") deleteFact.mutate(entry.id);
    else if (entry.kind === "faq") deleteFaq.mutate(entry.id);
    else deleteGuide.mutate(entry.id);
  }

  function discardEdits(rowKey: string) {
    setEdits((p) => { const n = { ...p }; delete n[rowKey]; return n; });
  }

  function openSheet(type: "fact" | "guide") {
    setSheetType(type);
    setSheetText("");
    setSheetTitle("");
    setSheetBody("");
    setSheetLang("en");
    setSheetOpen(true);
  }

  const pills: { label: string; value: FilterPill }[] = [
    { label: "All", value: "all" },
    { label: "Facts", value: "facts" },
    { label: "Guides", value: "guides" },
    { label: "Inactive", value: "inactive" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toolbar: search + filter + actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              className="pl-9 pr-8"
              placeholder="Search facts and guides…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="search-knowledge"
            />
            {search && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                onClick={() => setSearch("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => openSheet("fact")} data-testid="button-add-new">
            <Plus className="h-4 w-4 mr-1" />
            Add something new
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => seedMut.mutate()}
                disabled={seedMut.isPending}
                data-testid="menu-sync-rules"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {seedMut.isPending ? "Syncing…" : "Sync /rules"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => backfillMut.mutate()}
                disabled={backfillMut.isPending}
                data-testid="menu-reindex"
              >
                {backfillMut.isPending ? "Indexing…" : "Re-index all"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex gap-2 flex-wrap">
          {pills.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setFilter(p.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === p.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              }`}
              data-testid={`filter-${p.value}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified knowledge list */}
      <div className="space-y-1">
        {isLoading ? (
          <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {search
                ? `No results for "${search}"`
                : filter === "inactive"
                ? "No inactive entries."
                : "No entries yet. Add a fact or guide to get started."}
            </p>
          </div>
        ) : (
          filtered.map((entry) => {
            const rowKey = `${entry.kind}-${entry.id}`;
            const isOpen = !!expanded[rowKey];
            const isDirty = Object.keys(edits[rowKey] || {}).length > 0;

            return (
              <div
                key={rowKey}
                className={`rounded-lg border transition-all ${
                  isOpen
                    ? "border-slate-600/80 bg-slate-800/50"
                    : "border-transparent hover:border-slate-700/50 hover:bg-slate-800/20"
                }`}
                data-testid={`row-${entry.kind}-${entry.id}`}
              >
                {/* Collapsed header / toggle */}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() =>
                    setExpanded((p) => ({ ...p, [rowKey]: !p[rowKey] }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && isOpen) {
                      setExpanded((p) => ({ ...p, [rowKey]: false }));
                      discardEdits(rowKey);
                    }
                  }}
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <span
                    className={`flex-1 text-sm min-w-0 truncate ${
                      isOpen ? "text-slate-200 font-medium" : "text-slate-300"
                    }`}
                  >
                    {truncate(entry.previewText, 110)}
                  </span>
                  {isDirty && (
                    <span
                      className="h-2 w-2 rounded-full bg-amber-400 shrink-0"
                      title="Unsaved changes"
                      aria-label="Unsaved changes"
                    />
                  )}
                  {!entry.isActive && (
                    <Badge
                      variant="outline"
                      className="text-xs text-slate-500 border-slate-600 shrink-0"
                    >
                      Inactive
                    </Badge>
                  )}
                  <span className="text-xs text-slate-500 shrink-0 ml-1">
                    {entry.displayLabel}
                  </span>
                </button>

                {/* Expanded edit form */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-slate-700/40 pt-3">
                    {entry.kind === "fact" && (
                      <FactEditForm entry={entry} edits={edits} setEdits={setEdits} />
                    )}
                    {entry.kind === "faq" && (
                      <FaqEditForm entry={entry} edits={edits} setEdits={setEdits} />
                    )}
                    {entry.kind === "guide" && (
                      <GuideEditForm entry={entry} edits={edits} setEdits={setEdits} />
                    )}

                    {/* Row actions */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleSave(entry)}
                        disabled={!isDirty}
                        data-testid={`button-save-${entry.kind}-${entry.id}`}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      {isDirty && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-slate-200"
                          onClick={() => discardEdits(rowKey)}
                        >
                          Discard
                        </Button>
                      )}

                      {/* Restore-default button for resettable scenario docs */}
                      {entry.kind === "guide" &&
                        (SCENARIOS_RESETTABLE_TITLES as readonly string[]).includes(
                          (entry.raw as KnowledgeDoc).title,
                        ) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resetGuide.isPending}
                                data-testid={`button-reset-guide-${entry.id}`}
                              >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restore default
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Restore original wording?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will replace the current content of{" "}
                                  <strong>{(entry.raw as KnowledgeDoc).title}</strong> with the
                                  original default text. Your edits will be lost.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => resetGuide.mutate(entry.id)}>
                                  Restore default
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        onClick={() => handleDelete(entry)}
                        data-testid={`button-delete-${entry.kind}-${entry.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reply examples synopsis */}
      <ReplyExamplesSection />

      {/* Add-new sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add something new</SheetTitle>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            {/* Type picker */}
            <div className="flex gap-3">
              {(
                [
                  ["fact", "Short fact", "One plain sentence the AI should know"],
                  ["guide", "Detailed guide", "A titled document with policies or rules"],
                ] as const
              ).map(([type, label, desc]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSheetType(type)}
                  className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                    sheetType === type
                      ? "border-blue-500 bg-blue-950/30"
                      : "border-slate-700 hover:border-slate-500"
                  }`}
                  data-testid={`sheet-type-${type}`}
                >
                  <div className="text-sm font-medium text-slate-200">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>

            {sheetType === "fact" ? (
              <div className="space-y-1">
                <Label className="text-sm">What should the AI know?</Label>
                <Textarea
                  rows={4}
                  placeholder="The default deposit is $20, refunded when the earmuffs are returned in good condition."
                  value={sheetText}
                  onChange={(e) => setSheetText(e.target.value)}
                  data-testid="sheet-fact-text"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm">Title</Label>
                  <Input
                    placeholder="Common borrowing scenarios"
                    value={sheetTitle}
                    onChange={(e) => setSheetTitle(e.target.value)}
                    data-testid="sheet-guide-title"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Content</Label>
                  <Textarea
                    rows={6}
                    placeholder="Describe the policy, rule, or scenario in plain language…"
                    value={sheetBody}
                    onChange={(e) => setSheetBody(e.target.value)}
                    data-testid="sheet-guide-body"
                  />
                </div>
                <LangToggle value={sheetLang} onChange={setSheetLang} />
              </div>
            )}

            <Button
              className="w-full"
              disabled={
                sheetType === "fact"
                  ? !sheetText.trim() || createFact.isPending
                  : !sheetTitle.trim() || !sheetBody.trim() || createGuide.isPending
              }
              onClick={() => {
                if (sheetType === "fact") createFact.mutate({ text: sheetText });
                else createGuide.mutate({ title: sheetTitle, body: sheetBody, language: sheetLang });
              }}
              data-testid="sheet-button-add"
            >
              <Plus className="h-4 w-4 mr-1" />
              {sheetType === "fact" ? "Add fact" : "Add guide"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function AdminGlossaryPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-blue-400 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-white">AI Knowledge Base</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Everything here teaches the AI assistant how to respond to borrowers.
          </p>
        </div>
      </div>
      <GlossaryContent />
    </div>
  );
}
