import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Plus, BookOpen, Save, Sparkles, MessageSquareText } from "lucide-react";
import type { PlaybookFact, FaqEntry, KnowledgeDoc, ReplyExample } from "@shared/schema";

const FACT_KEY = ["/api/admin/playbook-facts"] as const;
const FAQ_KEY = ["/api/admin/faq-entries"] as const;
const DOCS_KEY = ["/api/admin/knowledge-docs"] as const;
const REPLIES_KEY = ["/api/admin/reply-examples"] as const;

function FactsTab() {
  const { toast } = useToast();
  const { data: facts = [], isLoading } = useQuery<PlaybookFact[]>({ queryKey: FACT_KEY });
  const [draft, setDraft] = useState({ factKey: "", factValue: "", category: "general" });
  const [edits, setEdits] = useState<Record<number, Partial<PlaybookFact>>>({});

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/playbook-facts", draft);
      return await res.json();
    },
    onSuccess: () => {
      setDraft({ factKey: "", factValue: "", category: "general" });
      queryClient.invalidateQueries({ queryKey: FACT_KEY });
      toast({ title: "Fact added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<PlaybookFact> }) => {
      const res = await apiRequest("PATCH", `/api/admin/playbook-facts/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FACT_KEY });
      toast({ title: "Saved" });
    },
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/playbook-facts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FACT_KEY });
      toast({ title: "Deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a new fact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] items-end">
          <div className="space-y-1">
            <Label className="text-xs">Key</Label>
            <Input
              placeholder="default_deposit_amount"
              value={draft.factKey}
              onChange={(e) => setDraft((d) => ({ ...d, factKey: e.target.value }))}
              data-testid="input-fact-key"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Input
              placeholder="general"
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              data-testid="input-fact-category"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Value (what the AI should know)</Label>
            <Textarea
              rows={2}
              placeholder="$20 refundable deposit per pair…"
              value={draft.factValue}
              onChange={(e) => setDraft((d) => ({ ...d, factValue: e.target.value }))}
              data-testid="textarea-fact-value"
            />
          </div>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!draft.factKey.trim() || !draft.factValue.trim() || createMut.isPending}
            data-testid="button-add-fact"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : facts.length === 0 ? (
        <div className="text-sm text-muted-foreground">No facts yet. Add one above.</div>
      ) : (
        <div className="space-y-2">
          {facts.map((f) => {
            const e = edits[f.id] || {};
            const merged = { ...f, ...e };
            return (
              <Card key={f.id} data-testid={`card-fact-${f.id}`}>
                <CardContent className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] items-start py-3">
                  <Input
                    value={merged.factKey}
                    onChange={(ev) => setEdits((p) => ({ ...p, [f.id]: { ...e, factKey: ev.target.value } }))}
                  />
                  <Input
                    value={merged.category}
                    onChange={(ev) => setEdits((p) => ({ ...p, [f.id]: { ...e, category: ev.target.value } }))}
                  />
                  <Textarea
                    rows={2}
                    value={merged.factValue}
                    onChange={(ev) => setEdits((p) => ({ ...p, [f.id]: { ...e, factValue: ev.target.value } }))}
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateMut.mutate({ id: f.id, data: e })}
                      disabled={Object.keys(e).length === 0}
                      data-testid={`button-save-fact-${f.id}`}
                    >
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Delete "${f.factKey}"?`)) deleteMut.mutate(f.id);
                      }}
                      data-testid={`button-delete-fact-${f.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FaqTab() {
  const { toast } = useToast();
  const { data: faqs = [], isLoading } = useQuery<FaqEntry[]>({ queryKey: FAQ_KEY });
  const [draft, setDraft] = useState({ question: "", answer: "", language: "en", category: "general", isActive: true });
  const [edits, setEdits] = useState<Record<number, Partial<FaqEntry>>>({});

  const createMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/faq-entries", draft)).json(),
    onSuccess: () => {
      setDraft({ question: "", answer: "", language: "en", category: "general", isActive: true });
      queryClient.invalidateQueries({ queryKey: FAQ_KEY });
      toast({ title: "FAQ added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<FaqEntry> }) =>
      (await apiRequest("PATCH", `/api/admin/faq-entries/${id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAQ_KEY });
      toast({ title: "Saved" });
    },
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/faq-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAQ_KEY });
      toast({ title: "Deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a new FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_140px] items-end">
            <div className="space-y-1">
              <Label className="text-xs">Question</Label>
              <Input
                placeholder="When do I get my deposit back?"
                value={draft.question}
                onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
                data-testid="input-faq-question"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Language</Label>
              <Select value={draft.language} onValueChange={(v) => setDraft((d) => ({ ...d, language: v }))}>
                <SelectTrigger data-testid="select-faq-language"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="he">Hebrew</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                data-testid="input-faq-category"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Answer</Label>
            <Textarea
              rows={3}
              value={draft.answer}
              onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
              data-testid="textarea-faq-answer"
            />
          </div>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!draft.question.trim() || !draft.answer.trim() || createMut.isPending}
            data-testid="button-add-faq"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add FAQ
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : faqs.length === 0 ? (
        <div className="text-sm text-muted-foreground">No FAQs yet.</div>
      ) : (
        <div className="space-y-2">
          {faqs.map((f) => {
            const e = edits[f.id] || {};
            const merged = { ...f, ...e };
            return (
              <Card key={f.id} data-testid={`card-faq-${f.id}`}>
                <CardContent className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{merged.language === "he" ? "Hebrew" : "English"}</Badge>
                    <Badge variant="secondary">{merged.category}</Badge>
                    <div className="flex items-center gap-2 ml-auto">
                      <Label className="text-xs">Active</Label>
                      <Switch
                        checked={!!merged.isActive}
                        onCheckedChange={(v) => setEdits((p) => ({ ...p, [f.id]: { ...e, isActive: v } }))}
                      />
                    </div>
                  </div>
                  <Input
                    value={merged.question}
                    onChange={(ev) => setEdits((p) => ({ ...p, [f.id]: { ...e, question: ev.target.value } }))}
                  />
                  <Textarea
                    rows={3}
                    value={merged.answer}
                    onChange={(ev) => setEdits((p) => ({ ...p, [f.id]: { ...e, answer: ev.target.value } }))}
                  />
                  <div className="grid gap-2 md:grid-cols-[140px_140px_1fr_auto_auto] items-center">
                    <Select
                      value={merged.language}
                      onValueChange={(v) => setEdits((p) => ({ ...p, [f.id]: { ...e, language: v } }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="he">Hebrew</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={merged.category}
                      onChange={(ev) => setEdits((p) => ({ ...p, [f.id]: { ...e, category: ev.target.value } }))}
                    />
                    <div />
                    <Button
                      size="sm"
                      onClick={() => updateMut.mutate({ id: f.id, data: e })}
                      disabled={Object.keys(e).length === 0}
                      data-testid={`button-save-faq-${f.id}`}
                    >
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Delete this FAQ?")) deleteMut.mutate(f.id);
                      }}
                      data-testid={`button-delete-faq-${f.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocsTab() {
  const { toast } = useToast();
  const { data: docs = [], isLoading } = useQuery<KnowledgeDoc[]>({ queryKey: DOCS_KEY });
  const [draft, setDraft] = useState({ title: "", body: "", category: "general", language: "en", isActive: true });
  const [edits, setEdits] = useState<Record<number, Partial<KnowledgeDoc>>>({});

  const createMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/knowledge-docs", draft)).json(),
    onSuccess: () => {
      setDraft({ title: "", body: "", category: "general", language: "en", isActive: true });
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      toast({ title: "Document added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<KnowledgeDoc> }) =>
      (await apiRequest("PATCH", `/api/admin/knowledge-docs/${id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      toast({ title: "Saved" });
    },
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/knowledge-docs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      toast({ title: "Deleted" });
    },
  });
  const backfillMut = useMutation({
    mutationFn: async (): Promise<{ scanned: number; created: number }> =>
      (await apiRequest("POST", "/api/admin/embeddings/backfill", {})).json(),
    onSuccess: (r) =>
      toast({
        title: "Backfill complete",
        description: `Scanned ${r?.scanned ?? 0} items, indexed ${r?.created ?? 0} new`,
      }),
    onError: (e: unknown) =>
      toast({
        title: "Backfill failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });
  const seedMut = useMutation({
    mutationFn: async (): Promise<{ created: number; updated: number; skipped: number; indexScanned: number; indexCreated: number }> =>
      (await apiRequest("POST", "/api/admin/knowledge-docs/seed", {})).json(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      const parts: string[] = [];
      if ((r?.created ?? 0) > 0) parts.push(`${r.created} created`);
      if ((r?.updated ?? 0) > 0) parts.push(`${r.updated} updated from /rules`);
      if ((r?.skipped ?? 0) > 0) parts.push(`${r.skipped} already current`);
      toast({
        title: "Sync complete",
        description: `${parts.join(", ")}; indexed ${r?.indexCreated ?? 0} new sources.`,
      });
    },
    onError: (e: unknown) =>
      toast({
        title: "Sync failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-base">Add a knowledge document</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => seedMut.mutate()}
              disabled={seedMut.isPending}
              data-testid="button-seed-default-docs"
              title="Syncs Borrowing Rules (EN + HE) with the canonical /rules page source — overwrites those two docs if they have drifted. Common Scenarios docs are left untouched so admins can edit them freely here. Missing seed docs (any) are created on demand."
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {seedMut.isPending ? "Syncing…" : "Sync /rules docs"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => backfillMut.mutate()} disabled={backfillMut.isPending} data-testid="button-backfill-embeddings">
              {backfillMut.isPending ? "Indexing…" : "Re-index all"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_140px] items-end">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                placeholder="Common borrowing scenarios"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                data-testid="input-doc-title"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Language</Label>
              <Select value={draft.language} onValueChange={(v) => setDraft((d) => ({ ...d, language: v }))}>
                <SelectTrigger data-testid="select-doc-language"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="he">Hebrew</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                data-testid="input-doc-category"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Body (long-form rules, policies, scenarios)</Label>
            <Textarea
              rows={6}
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              data-testid="textarea-doc-body"
            />
          </div>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!draft.title.trim() || !draft.body.trim() || createMut.isPending}
            data-testid="button-add-doc"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add document
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="text-sm text-muted-foreground">No knowledge documents yet.</div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const e = edits[d.id] || {};
            const merged = { ...d, ...e };
            return (
              <Card key={d.id} data-testid={`card-doc-${d.id}`}>
                <CardContent className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{merged.language === "he" ? "Hebrew" : "English"}</Badge>
                    <Badge variant="secondary">{merged.category}</Badge>
                    <div className="flex items-center gap-2 ml-auto">
                      <Label className="text-xs">Active</Label>
                      <Switch
                        checked={!!merged.isActive}
                        onCheckedChange={(v) => setEdits((p) => ({ ...p, [d.id]: { ...e, isActive: v } }))}
                      />
                    </div>
                  </div>
                  <Input
                    value={merged.title}
                    onChange={(ev) => setEdits((p) => ({ ...p, [d.id]: { ...e, title: ev.target.value } }))}
                  />
                  <Textarea
                    rows={5}
                    value={merged.body}
                    onChange={(ev) => setEdits((p) => ({ ...p, [d.id]: { ...e, body: ev.target.value } }))}
                  />
                  <div className="grid gap-2 md:grid-cols-[140px_140px_1fr_auto_auto] items-center">
                    <Select
                      value={merged.language}
                      onValueChange={(v) => setEdits((p) => ({ ...p, [d.id]: { ...e, language: v } }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="he">Hebrew</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={merged.category}
                      onChange={(ev) => setEdits((p) => ({ ...p, [d.id]: { ...e, category: ev.target.value } }))}
                    />
                    <div />
                    <Button
                      size="sm"
                      onClick={() => updateMut.mutate({ id: d.id, data: e })}
                      disabled={Object.keys(e).length === 0}
                      data-testid={`button-save-doc-${d.id}`}
                    >
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Delete this document?")) deleteMut.mutate(d.id);
                      }}
                      data-testid={`button-delete-doc-${d.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function RepliesTab() {
  const { toast } = useToast();
  const { data: replies = [], isLoading } = useQuery<ReplyExample[]>({ queryKey: REPLIES_KEY });
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/reply-examples/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REPLIES_KEY });
      toast({
        title: "Removed",
        description: "The AI will no longer learn from this reply.",
      });
    },
    onError: (e: unknown) =>
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Every reply you send from the inbox is saved here as a training example for the AI.
          Delete any reply that should not be reused so it stops biasing future drafts. Removing
          an example also pulls it out of the AI's semantic search index.
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : replies.length === 0 ? (
        <div className="text-sm text-muted-foreground">No reply examples captured yet.</div>
      ) : (
        <div className="space-y-2">
          {replies.map((r) => {
            const isOpen = !!expanded[r.id];
            const senderLabel = r.senderName
              ? `${r.senderName}${r.senderEmail ? ` <${r.senderEmail}>` : ""}`
              : (r.senderEmail || "(unknown sender)");
            return (
              <Card key={r.id} data-testid={`card-reply-${r.id}`}>
                <CardContent className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {r.sourceType === "email" ? "Email" : "Form"}
                    </Badge>
                    {r.classification ? (
                      <Badge variant="secondary" data-testid={`badge-reply-classification-${r.id}`}>
                        {r.classification}
                      </Badge>
                    ) : null}
                    {r.wasEdited ? (
                      <Badge data-testid={`badge-reply-edited-${r.id}`}>Edited by admin</Badge>
                    ) : (
                      <Badge variant="outline" data-testid={`badge-reply-asdrafted-${r.id}`}>
                        Sent as drafted
                      </Badge>
                    )}
                    <Badge variant="outline">{r.language === "he" ? "Hebrew" : "English"}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium" data-testid={`text-reply-sender-${r.id}`}>
                      {senderLabel}
                    </div>
                    <div className="text-muted-foreground">
                      <span className="font-medium">Subject:</span> {r.incomingSubject || "(no subject)"}
                    </div>
                  </div>
                  {isOpen ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Incoming message</Label>
                        <div
                          className="rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-wrap"
                          data-testid={`text-reply-incoming-${r.id}`}
                        >
                          {r.incomingBody}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Reply that was sent</Label>
                        <div
                          className="rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-wrap"
                          data-testid={`text-reply-sent-${r.id}`}
                        >
                          {r.sentReply}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground" data-testid={`text-reply-preview-${r.id}`}>
                      {truncate(r.sentReply.replace(/\s+/g, " ").trim(), 200)}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      data-testid={`button-toggle-reply-${r.id}`}
                    >
                      {isOpen ? "Hide details" : "Show details"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (
                          confirm(
                            "Remove this reply example? The AI will stop learning from it.",
                          )
                        ) {
                          deleteMut.mutate(r.id);
                        }
                      }}
                      disabled={deleteMut.isPending}
                      data-testid={`button-delete-reply-${r.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GlossaryContent() {
  return (
    <Tabs defaultValue="facts">
      <TabsList>
        <TabsTrigger value="facts" data-testid="tab-facts">Facts</TabsTrigger>
        <TabsTrigger value="faqs" data-testid="tab-faqs">FAQs</TabsTrigger>
        <TabsTrigger value="docs" data-testid="tab-docs">Documents</TabsTrigger>
        <TabsTrigger value="replies" data-testid="tab-replies">
          <MessageSquareText className="h-4 w-4 mr-1" />
          Replies
        </TabsTrigger>
      </TabsList>
      <TabsContent value="facts" className="mt-4">
        <FactsTab />
      </TabsContent>
      <TabsContent value="faqs" className="mt-4">
        <FaqTab />
      </TabsContent>
      <TabsContent value="docs" className="mt-4">
        <DocsTab />
      </TabsContent>
      <TabsContent value="replies" className="mt-4">
        <RepliesTab />
      </TabsContent>
    </Tabs>
  );
}

export default function AdminGlossaryPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">AI Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            Edit the facts and FAQ answers the AI uses when drafting replies in the inbox.
          </p>
        </div>
      </div>
      <GlossaryContent />
    </div>
  );
}
