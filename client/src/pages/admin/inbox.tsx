import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Inbox as InboxIcon,
  ArrowLeft,
  Send,
  Sparkles,
  Languages,
  RefreshCw,
  Search,
  Mail,
  MessageSquare,
  Clock,
  User,
  Trash2,
  AlertCircle,
  ChevronDown,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import DOMPurify from "dompurify";
import type { Contact } from "@shared/schema";

type SourceFilter = "all" | "email" | "form";
type ReadFilter = "all" | "unread" | "read";

interface GmailEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  isRead: boolean;
  labels: string[];
}

interface EmailsResponse {
  emails: GmailEmail[];
  nextPageToken?: string;
}

interface UnifiedItem {
  key: string;
  source: "email" | "form";
  id: string | number;
  threadId?: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  snippet: string;
  date: string;
  isRead: boolean;
}

function parseEmailAddress(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (from.includes("@")) return { name: from.split("@")[0], email: from.trim() };
  return { name: from || "Unknown", email: "" };
}

function formatDate(dateStr: string | Date): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(undefined, sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(dateStr);
  }
}

function safeDate(input: string | Date | null | undefined): string {
  if (!input) return new Date().toISOString();
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function sanitizeHtml(body: string): string {
  const html = body.includes("<") ? body : body.replace(/\n/g, "<br/>");
  return DOMPurify.sanitize(html);
}

export default function AdminInbox() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<UnifiedItem | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editMessage, setEditMessage] = useState("");

  // Gmail config status
  const gmailStatusQuery = useQuery<{ configured: boolean; environment: string; message: string }>({
    queryKey: ["/api/admin/emails/status"],
  });

  // Contacts query
  const contactsQuery = useQuery<Contact[]>({
    queryKey: ["/api/contact"],
  });

  // Paginated emails (using infinite query for proper cache + refresh behavior)
  const emailQueries = useInfiniteQuery<EmailsResponse>({
    queryKey: ["/api/admin/emails", "infinite"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ maxResults: "25" });
      if (typeof pageParam === "string" && pageParam) {
        params.set("pageToken", pageParam);
      }
      const res = await fetch(`/api/admin/emails?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        let message = "Failed to load emails";
        try { message = (await res.json()).message || message; } catch {}
        throw new Error(message);
      }
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined,
  });

  const allEmails: GmailEmail[] = useMemo(() => {
    const merged = (emailQueries.data?.pages ?? []).flatMap((p) => p.emails);
    const ids = new Set<string>();
    return merged.filter((e) => {
      if (ids.has(e.id)) return false;
      ids.add(e.id);
      return true;
    });
  }, [emailQueries.data]);

  const handleLoadMore = () => {
    if (emailQueries.hasNextPage && !emailQueries.isFetchingNextPage) {
      emailQueries.fetchNextPage().catch((e) => {
        toast({ title: t("error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      });
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/contact"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails", "infinite"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/status"] }),
    ]);
  };

  // Build the unified, sorted feed
  const unified: UnifiedItem[] = useMemo(() => {
    const list: UnifiedItem[] = [];
    for (const c of contactsQuery.data ?? []) {
      list.push({
        key: `form-${c.id}`,
        source: "form",
        id: c.id,
        fromName: c.name,
        fromEmail: c.email,
        subject: c.subject,
        body: c.message,
        snippet: c.message.slice(0, 140),
        date: safeDate(c.submittedAt),
        isRead: !!c.isRead,
      });
    }
    for (const e of allEmails) {
      const parsed = parseEmailAddress(e.from);
      list.push({
        key: `email-${e.id}`,
        source: "email",
        id: e.id,
        threadId: e.threadId,
        fromName: parsed.name,
        fromEmail: parsed.email,
        subject: e.subject,
        body: e.body,
        snippet: e.snippet,
        date: safeDate(e.date),
        isRead: e.isRead,
      });
    }
    return list.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
  }, [contactsQuery.data, allEmails]);

  const filtered = unified.filter((it) => {
    if (sourceFilter !== "all" && it.source !== sourceFilter) return false;
    if (readFilter === "read" && !it.isRead) return false;
    if (readFilter === "unread" && it.isRead) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !it.fromName.toLowerCase().includes(q) &&
        !it.fromEmail.toLowerCase().includes(q) &&
        !it.subject.toLowerCase().includes(q) &&
        !it.body.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const unreadCount = unified.filter((u) => !u.isRead).length;

  // Mutations
  const markEmailRead = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/read`),
  });
  const markContactRead = useMutation({
    mutationFn: async ({ id, isRead }: { id: number; isRead: boolean }) =>
      apiRequest("PATCH", `/api/contact/${id}`, { isRead }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/contact"] }),
  });
  const deleteContact = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/contact/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contact"] });
      toast({ title: t("msgDeletedSuccess") });
      setSelected(null);
    },
    onError: () => toast({ title: t("error"), description: t("msgDeleteFailed"), variant: "destructive" }),
  });
  const sendReplyMutation = useMutation({
    mutationFn: async (item: UnifiedItem) => {
      const payload = { replyText, replySubject };
      if (item.source === "email") {
        await apiRequest("POST", `/api/admin/emails/${item.id}/reply`, payload);
      } else {
        await apiRequest("POST", `/api/contact/${item.id}/respond`, payload);
      }
    },
    onSuccess: () => {
      toast({ title: t("replySent"), description: t("emailSentSuccessfully") });
      setReplyText("");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["/api/contact"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/emails", "infinite"] });
    },
    onError: (err: unknown) =>
      toast({ title: t("error"), description: err instanceof Error ? err.message : t("failedToSendReply"), variant: "destructive" }),
  });
  const generateMutation = useMutation({
    mutationFn: async (item: UnifiedItem) => {
      const url = item.source === "email"
        ? `/api/admin/emails/${item.id}/generate-response`
        : `/api/contact/${item.id}/generate-response`;
      const res = await apiRequest("POST", url);
      return (await res.json()).response as string;
    },
    onSuccess: (response) => {
      setReplyText(response);
      toast({ title: t("aiResponseGenerated"), description: t("reviewEditBeforeSending") });
    },
    onError: (err: unknown) =>
      toast({ title: t("error"), description: err instanceof Error ? err.message : t("failedToGenerateResponse"), variant: "destructive" }),
  });
  const translateMutation = useMutation({
    mutationFn: async ({ text, target }: { text: string; target: "en" | "he" }) => {
      const res = await apiRequest("POST", `/api/admin/inbox/translate`, { text, target });
      return (await res.json()).translated as string;
    },
  });

  const openItem = (item: UnifiedItem) => {
    setSelected(item);
    setReplyText("");
    const subj = item.subject?.startsWith("Re:") ? item.subject : `Re: ${item.subject || ""}`;
    setReplySubject(subj);
    if (!item.isRead) {
      if (item.source === "email") {
        markEmailRead.mutate(String(item.id), {
          onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/emails", "infinite"] }),
        });
      } else {
        markContactRead.mutate({ id: Number(item.id), isRead: true });
      }
    }
  };

  // Translation always targets the current admin UI language.
  const uiTarget: "en" | "he" = language === "he" ? "he" : "en";
  const translationKey = selected ? `${selected.source}:${selected.id}` : "";
  const translatedBody = translationKey ? translations[translationKey] ?? null : null;

  const handleTranslateMessage = async () => {
    if (!selected) return;
    if (translatedBody) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[translationKey];
        return next;
      });
      return;
    }
    try {
      const out = await translateMutation.mutateAsync({ text: selected.body, target: uiTarget });
      setTranslations((prev) => ({ ...prev, [translationKey]: out }));
    } catch (e) {
      toast({ title: t("error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleTranslateReply = async () => {
    if (!replyText.trim()) return;
    try {
      const out = await translateMutation.mutateAsync({ text: replyText, target: uiTarget });
      setReplyText(out);
    } catch (e) {
      toast({ title: t("error"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const toggleReadStatus = (item: UnifiedItem) => {
    const newIsRead = !item.isRead;
    if (item.source === "email") {
      // Gmail backend only supports mark-as-read; show toast if user tries to mark unread
      if (!newIsRead) {
        toast({ title: t("error"), description: t("inboxCannotMarkEmailUnread"), variant: "destructive" });
        return;
      }
      markEmailRead.mutate(String(item.id), {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/admin/emails", "infinite"] });
          setSelected({ ...item, isRead: true });
        },
      });
    } else {
      markContactRead.mutate(
        { id: Number(item.id), isRead: newIsRead },
        { onSuccess: () => setSelected({ ...item, isRead: newIsRead }) }
      );
    }
  };

  const openEditDialog = () => {
    if (!selected || selected.source !== "form") return;
    setEditSubject(selected.subject);
    setEditMessage(selected.body);
    setEditOpen(true);
  };

  const editContactMutation = useMutation({
    mutationFn: async ({ id, subject, message }: { id: number; subject: string; message: string }) => {
      const res = await apiRequest("PATCH", `/api/contact/${id}`, { subject, message });
      return res.json();
    },
    onSuccess: (updated: Contact) => {
      qc.invalidateQueries({ queryKey: ["/api/contact"] });
      toast({ title: t("msgUpdatedSuccess") });
      setEditOpen(false);
      if (selected) {
        setSelected({ ...selected, subject: updated.subject, body: updated.message });
      }
    },
    onError: () => toast({ title: t("error"), description: t("msgUpdateFailed"), variant: "destructive" }),
  });

  // ============ DETAIL VIEW ============
  if (selected) {
    return (
      <div className="py-10">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} data-testid="button-back-to-inbox">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("backToInbox")}
            </Button>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleReadStatus(selected)}
                disabled={markEmailRead.isPending || markContactRead.isPending}
                data-testid="button-toggle-read"
              >
                {selected.isRead ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    {t("markAsUnread")}
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    {t("markAsRead")}
                  </>
                )}
              </Button>
              {selected.source === "form" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openEditDialog}
                    data-testid="button-edit-message"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {t("msgEdit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDeleteId(Number(selected.id))}
                    data-testid="button-delete-message"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("msgDelete")}
                  </Button>
                </>
              )}
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-xl">{selected.subject || t("noSubject")}</CardTitle>
                  <Badge variant={selected.source === "email" ? "default" : "secondary"}>
                    {selected.source === "email" ? t("inboxSourceEmail") : t("inboxSourceForm")}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span className="font-medium text-foreground">{selected.fromName}</span>
                    {selected.fromEmail && (
                      <a href={`mailto:${selected.fromEmail}`} className="hover:underline">
                        &lt;{selected.fromEmail}&gt;
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{formatDate(selected.date)}</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div
                className="whitespace-pre-wrap bg-muted/30 p-4 rounded-lg text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(translatedBody ?? selected.body) }}
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTranslateMessage}
                  disabled={translateMutation.isPending}
                  data-testid="button-translate-message"
                >
                  <Languages className="h-4 w-4 mr-2" />
                  {translatedBody ? t("inboxShowOriginal") : t("inboxTranslate")}
                </Button>
                {translatedBody && <span className="text-xs text-muted-foreground">{t("inboxTranslated")}</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5" />
                {t("reply")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-2 items-center text-sm">
                <span className="text-muted-foreground">{t("inboxTo")}</span>
                <span className="font-medium">
                  {selected.fromName} {selected.fromEmail && <span className="text-muted-foreground">&lt;{selected.fromEmail}&gt;</span>}
                </span>
                <span className="text-muted-foreground">{t("subject")}</span>
                <Input
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  data-testid="input-reply-subject"
                />
              </div>
              <Textarea
                placeholder={t("writeYourReply")}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={10}
                className="resize-none"
                data-testid="textarea-reply-body"
              />
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateMutation.mutate(selected)}
                    disabled={generateMutation.isPending}
                    data-testid="button-generate-ai"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {generateMutation.isPending ? t("generating") : t("generateAIResponse")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTranslateReply}
                    disabled={!replyText.trim() || translateMutation.isPending}
                    data-testid="button-translate-reply"
                  >
                    <Languages className="h-4 w-4 mr-2" />
                    {t("inboxTranslateReply")}
                  </Button>
                </div>
                <Button
                  onClick={() => sendReplyMutation.mutate(selected)}
                  disabled={!replyText.trim() || sendReplyMutation.isPending}
                  data-testid="button-send-reply"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendReplyMutation.isPending ? t("sending") : t("sendReply")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("inboxSentFromGemach")}</p>
            </CardContent>
          </Card>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("msgEditMessage")}</DialogTitle>
                <DialogDescription>{t("msgEditDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("subject")}</label>
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    data-testid="input-edit-subject"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("message")}</label>
                  <Textarea
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    rows={6}
                    className="resize-none"
                    data-testid="textarea-edit-message"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  onClick={() =>
                    selected &&
                    editContactMutation.mutate({
                      id: Number(selected.id),
                      subject: editSubject,
                      message: editMessage,
                    })
                  }
                  disabled={editContactMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {editContactMutation.isPending ? t("saving") : t("saveChanges")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("msgConfirmDelete")}</AlertDialogTitle>
                <AlertDialogDescription>{t("msgConfirmDeleteDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => confirmDeleteId !== null && deleteContact.mutate(confirmDeleteId)}
                >
                  {deleteContact.isPending ? t("deleting") : t("msgDelete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  // ============ LIST VIEW ============
  const isLoading = contactsQuery.isLoading || emailQueries.isLoading;
  const emailErrorRaw = emailQueries.error;
  const emailError = emailQueries.isError
    ? (emailErrorRaw instanceof Error ? emailErrorRaw.message : String(emailErrorRaw))
    : null;
  const gmailNotConfigured = gmailStatusQuery.data && !gmailStatusQuery.data.configured;
  const gmailInvalidGrant = !!emailError && /refresh token is invalid|invalid_grant/i.test(emailError);
  const showGmailIssue = gmailNotConfigured || gmailInvalidGrant;

  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon" data-testid="button-back-admin">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <InboxIcon className="h-8 w-8" />
                {t("inboxTitle")}
              </h1>
              <p className="text-muted-foreground">{t("inboxSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-sm">
                {unreadCount} {t("unread")}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={emailQueries.isFetching} data-testid="button-refresh">
              <RefreshCw className={`h-4 w-4 mr-2 ${emailQueries.isFetching ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("inboxSearchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["all", "email", "form"] as SourceFilter[]).map((s) => (
              <Button
                key={s}
                variant={sourceFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setSourceFilter(s)}
                data-testid={`filter-source-${s}`}
              >
                {s === "all" ? t("msgAll") : s === "email" ? t("inboxSourceEmail") : t("inboxSourceForm")}
              </Button>
            ))}
            <div className="w-px bg-border mx-1" />
            {(["all", "unread", "read"] as ReadFilter[]).map((r) => (
              <Button
                key={r}
                variant={readFilter === r ? "default" : "outline"}
                size="sm"
                onClick={() => setReadFilter(r)}
                data-testid={`filter-read-${r}`}
              >
                {r === "all" ? t("msgAll") : r === "unread" ? t("unread") : t("read")}
              </Button>
            ))}
          </div>
        </div>

        {showGmailIssue && (
          <Card className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-950/30" data-testid="card-gmail-not-configured">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 text-sm">
                  <div className="font-semibold text-amber-900 dark:text-amber-100">
                    {gmailInvalidGrant ? t("inboxGmailExpiredTitle") : t("inboxGmailNotConfiguredTitle")}
                  </div>
                  <p className="text-amber-900/90 dark:text-amber-100/90">
                    {gmailInvalidGrant ? t("inboxGmailExpiredDesc") : t("inboxGmailNotConfiguredDesc")}
                  </p>
                  <ul className="list-disc list-inside text-xs text-amber-900/80 dark:text-amber-100/80 space-y-0.5">
                    <li><code>GMAIL_CLIENT_ID</code></li>
                    <li><code>GMAIL_CLIENT_SECRET</code></li>
                    <li><code>GMAIL_REFRESH_TOKEN</code>{gmailInvalidGrant && <span className="ml-1">— {t("inboxGmailRegenerateNote")}</span>}</li>
                  </ul>
                  <a
                    href="https://developers.google.com/oauthplayground"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block underline text-amber-900 dark:text-amber-100 font-medium"
                    data-testid="link-gmail-setup"
                  >
                    {gmailInvalidGrant ? t("inboxGmailRegenerateLink") : t("inboxGmailSetupLink")}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {emailError && !showGmailIssue && (
          <Card className="mb-4 border-destructive/50">
            <CardContent className="p-4 flex items-start gap-3 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <div className="font-medium">{t("failedToLoadEmails")}</div>
                <div className="text-muted-foreground">{emailError}</div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="p-4 flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <InboxIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">{t("inboxEmpty")}</h3>
                <p className="text-muted-foreground">{t("inboxEmptyDesc")}</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((it) => (
                  <button
                    key={it.key}
                    onClick={() => openItem(it)}
                    className={`w-full p-4 text-left hover-elevate active-elevate-2 transition-colors flex items-start gap-4 ${
                      !it.isRead ? "bg-primary/5" : ""
                    }`}
                    data-testid={`row-${it.key}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ${
                        !it.isRead ? "bg-primary" : "bg-muted-foreground"
                      }`}
                    >
                      {(it.fromName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-medium truncate ${!it.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                            {it.fromName}
                          </span>
                          <Badge variant={it.source === "email" ? "default" : "secondary"} className="text-[10px] py-0 h-5 flex-shrink-0">
                            {it.source === "email" ? <Mail className="h-3 w-3 mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                            {it.source === "email" ? t("inboxSourceEmail") : t("inboxSourceForm")}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(it.date)}</span>
                      </div>
                      <p className={`text-sm truncate ${!it.isRead ? "font-medium" : ""}`}>
                        {it.subject || t("noSubject")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-1">{it.snippet}</p>
                    </div>
                    {!it.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {emailQueries.hasNextPage && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={handleLoadMore} disabled={emailQueries.isFetchingNextPage} data-testid="button-load-more">
              <ChevronDown className="h-4 w-4 mr-2" />
              {t("inboxLoadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
