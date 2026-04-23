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
import { Trash2, Plus, BookOpen, Save } from "lucide-react";
import type { PlaybookFact, FaqEntry } from "@shared/schema";

const FACT_KEY = ["/api/admin/playbook-facts"] as const;
const FAQ_KEY = ["/api/admin/faq-entries"] as const;

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

export function GlossaryContent() {
  return (
    <Tabs defaultValue="facts">
      <TabsList>
        <TabsTrigger value="facts" data-testid="tab-facts">Facts</TabsTrigger>
        <TabsTrigger value="faqs" data-testid="tab-faqs">FAQs</TabsTrigger>
      </TabsList>
      <TabsContent value="facts" className="mt-4">
        <FactsTab />
      </TabsContent>
      <TabsContent value="faqs" className="mt-4">
        <FaqTab />
      </TabsContent>
    </Tabs>
  );
}

export default function AdminGlossaryPage() {
  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-6">
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
