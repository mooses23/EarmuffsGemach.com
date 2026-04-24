import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
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
  BookOpen,
  Archive,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  SlidersHorizontal,
} from "lucide-react";
import { SwipeableRow } from "@/components/admin/SwipeableRow";
import { GlossaryContent } from "./glossary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import DOMPurify from "dompurify";
import type { Contact } from "@shared/schema";

type SourceFilter = "all" | "email" | "form";
type ReadFilter = "all" | "unread" | "read";
type Folder = "inbox" | "spam" | "trash";

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
  isArchived?: boolean;
  isSpam?: boolean;
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
  const [folder, setFolder] = useState<Folder>("inbox");
  const [showFilters, setShowFilters] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editMessage, setEditMessage] = useState("");

  // Gmail config status
  const gmailStatusQuery = useQuery<{ configured: boolean; environment: string; message: string }>({
    queryKey: ["/api/admin/emails/status"],
  });

  // Gmail backlog counts (UNREAD/SPAM/TRASH labels) for folder chips.
  // The endpoint returns zeros if Gmail is unavailable, so this is safe to render unconditionally.
  const gmailLabelCountsQuery = useQuery<{ unread: number; spam: number; trash: number }>({
    queryKey: ["/api/admin/emails/labels"],
    enabled: !!gmailStatusQuery.data?.configured,
    refetchInterval: 60_000,
  });

  // Contacts query
  const contactsQuery = useQuery<Contact[]>({
    queryKey: ["/api/contact"],
  });

  // Paginated emails (using infinite query for proper cache + refresh behavior).
  // The Gmail folder is part of the queryKey so each tab gets its own cache.
  const emailQueries = useInfiniteQuery<EmailsResponse>({
    queryKey: ["/api/admin/emails", "infinite", folder],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ maxResults: "25", mode: folder });
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

  const invalidateEmailLists = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/emails", "infinite"] });
  };

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
        isArchived: !!c.isArchived,
        isSpam: !!c.isSpam,
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

  // Folder filter for form contacts. Gmail messages already arrive pre-filtered
  // by the server based on the `mode` query param, so we don't filter them here.
  const folderFiltered = unified.filter((it) => {
    if (it.source === "form") {
      if (folder === "inbox") return !it.isArchived && !it.isSpam;
      if (folder === "spam") return !!it.isSpam && !it.isArchived;
      if (folder === "trash") return !!it.isArchived;
    }
    return true;
  });

  const filtered = folderFiltered.filter((it) => {
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

  // Unread count is for Inbox only — Spam/Trash unread badges would be noisy.
  const inboxItems = unified.filter(
    (u) => u.source === "email" || (!u.isArchived && !u.isSpam)
  );
  const unreadCount = inboxItems.filter((u) => !u.isRead).length;
  const formSpamCount = (contactsQuery.data ?? []).filter(
    (c) => c.isSpam && !c.isArchived
  ).length;
  const formTrashCount = (contactsQuery.data ?? []).filter(
    (c) => c.isArchived
  ).length;

  // Mutations
  const markEmailRead = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/read`),
  });
  const markContactRead = useMutation({
    mutationFn: async ({ id, isRead }: { id: number; isRead: boolean }) =>
      apiRequest("PATCH", `/api/contact/${id}`, { isRead }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/contact"] }),
  });

  // ===== Folder/spam/archive/trash mutations (emails + contacts) =====
  const markEmailUnread = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/unread`),
    onSuccess: () => invalidateEmailLists(),
  });
  const archiveEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/archive`),
    onSuccess: () => invalidateEmailLists(),
  });
  const trashEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/trash`),
    onSuccess: () => invalidateEmailLists(),
  });
  const untrashEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/untrash`),
    onSuccess: () => invalidateEmailLists(),
  });
  const spamEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/spam`),
    onSuccess: () => invalidateEmailLists(),
  });
  const notSpamEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/not-spam`),
    onSuccess: () => invalidateEmailLists(),
  });
  const updateContactFlags = useMutation({
    mutationFn: async ({ id, ...flags }: { id: number; isRead?: boolean; isArchived?: boolean; isSpam?: boolean }) =>
      apiRequest("PATCH", `/api/contact/${id}`, flags),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/contact"] }),
  });

  // Generic swipe-action handlers — work for both sources.
  const performMarkUnread = (item: UnifiedItem) => {
    const success = () => toast({ title: t("inboxUnreadSuccess") });
    const failure = () => toast({ title: t("inboxUnreadFailed"), variant: "destructive" });
    if (item.source === "email") {
      markEmailUnread.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      updateContactFlags.mutate({ id: Number(item.id), isRead: false }, { onSuccess: success, onError: failure });
    }
  };
  // Toast with an undo action — for destructive/archival operations that the
  // user might want to take back without hunting for the row in Trash/Spam.
  const undoToast = (title: string, undoFn: () => void) => {
    toast({
      title,
      action: (
        <ToastAction altText={t("inboxDetailRestore")} onClick={undoFn} data-testid="toast-undo-action">
          {t("inboxDetailRestore")}
        </ToastAction>
      ),
    });
  };
  const performArchive = (item: UnifiedItem) => {
    const failure = () => toast({ title: t("inboxArchiveFailed"), variant: "destructive" });
    const success = () => undoToast(t("inboxArchiveSuccess"), () => performRestore(item));
    if (item.source === "email") {
      archiveEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      // Contacts have no separate archive bucket — archived contacts surface in Trash.
      updateContactFlags.mutate({ id: Number(item.id), isArchived: true }, { onSuccess: success, onError: failure });
    }
  };
  const performTrash = (item: UnifiedItem) => {
    const failure = () => toast({ title: t("inboxTrashFailed"), variant: "destructive" });
    if (item.source === "email") {
      // Gmail trash is reversible — show an undo toast to mirror iOS Mail.
      const success = () => undoToast(t("inboxTrashSuccess"), () => performRestore(item));
      trashEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      // Contact form messages are hard-deleted (preserves the existing
      // /api/contact/:id DELETE behavior). No undo since the row is gone.
      deleteContact.mutate(Number(item.id), {
        onSuccess: () => toast({ title: t("msgDeletedSuccess") }),
        onError: failure,
      });
    }
  };
  const performRestore = (item: UnifiedItem) => {
    const success = () => toast({ title: t("inboxRestoreSuccess") });
    const failure = () => toast({ title: t("inboxRestoreFailed"), variant: "destructive" });
    if (item.source === "email") {
      // Restoring from Trash and unmarking spam both put the message back in inbox.
      if (folder === "spam") {
        notSpamEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
      } else {
        untrashEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
      }
    } else {
      updateContactFlags.mutate(
        { id: Number(item.id), isArchived: false, isSpam: false },
        { onSuccess: success, onError: failure }
      );
    }
  };
  const performMarkSpam = (item: UnifiedItem) => {
    const failure = () => toast({ title: t("inboxSpamFailed"), variant: "destructive" });
    const success = () => undoToast(t("inboxSpamSuccess"), () => performUnmarkSpam(item));
    if (item.source === "email") {
      spamEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      updateContactFlags.mutate({ id: Number(item.id), isSpam: true }, { onSuccess: success, onError: failure });
    }
  };
  const performUnmarkSpam = (item: UnifiedItem) => {
    const success = () => toast({ title: t("inboxNotSpamSuccess") });
    const failure = () => toast({ title: t("inboxNotSpamFailed"), variant: "destructive" });
    if (item.source === "email") {
      notSpamEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      updateContactFlags.mutate({ id: Number(item.id), isSpam: false }, { onSuccess: success, onError: failure });
    }
  };
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
      const payload: {
        replyText: string;
        replySubject: string;
        aiDraft?: string;
        classification?: string;
        matchedLocationId?: number;
      } = {
        replyText,
        replySubject,
        aiDraft: aiDraftSnapshot ?? undefined,
        classification: draftClassification ?? undefined,
        matchedLocationId: matchedLocation?.id ?? undefined,
      };
      if (item.source === "email") {
        await apiRequest("POST", `/api/admin/emails/${item.id}/reply`, payload);
      } else {
        await apiRequest("POST", `/api/contact/${item.id}/respond`, payload);
      }
    },
    onSuccess: () => {
      toast({ title: t("replySent"), description: t("emailSentSuccessfully") });
      // Offer one-click save-to-FAQ before closing
      setFaqQuestion(selected?.subject || "");
      // Map AI classification → FAQ category so the admin doesn't have to retype it.
      // Keys must match the Classification union in server/openai-client.ts.
      const classificationToCategory: Record<string, string> = {
        new_location: "applications",
        borrow_request: "borrowing",
        return_or_deposit: "deposits",
        application_status: "applications",
        general_question: "general",
        complaint: "general",
        other: "general",
      };
      const mapped = draftClassification ? classificationToCategory[draftClassification] : undefined;
      setFaqCategory(mapped || "general");
      setShowSaveFaq(true);
      qc.invalidateQueries({ queryKey: ["/api/contact"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/emails", "infinite"] });
    },
    onError: (err: unknown) =>
      toast({ title: t("error"), description: err instanceof Error ? err.message : t("failedToSendReply"), variant: "destructive" }),
  });
  const [reviewWarning, setReviewWarning] = useState<string | null>(null);
  const [matchedLocation, setMatchedLocation] = useState<{ id: number; name: string } | null>(null);
  const [forwardNote, setForwardNote] = useState("");
  const [aiDraftSnapshot, setAiDraftSnapshot] = useState<string | null>(null);
  const [draftClassification, setDraftClassification] = useState<string | null>(null);
  type DraftSource = { kind: string; id: number; label?: string; title?: string; snippet?: string; score?: number };
  type GenerateResponse = {
    response: string;
    classification?: string;
    needsHumanReview?: boolean;
    reviewReason?: string;
    matchedLocationId?: number;
    matchedLocationName?: string;
    confidence?: number;
    sources?: DraftSource[];
    citedSourceIds?: string[];
    todayIso?: string;
    senderHistoryCount?: number;
    threadHistoryCount?: number;
    language?: string;
  };
  type DraftMeta = {
    confidence?: number;
    sources?: DraftSource[];
    // Server returns IDs as "kind-id" strings (e.g. "faq-12") so the model can
    // emit them naturally. We parse them client-side for citation highlighting.
    citedSourceIds?: string[];
    todayIso?: string;
    senderHistoryCount?: number;
    threadHistoryCount?: number;
    language?: string;
  } | null;
  const parseCitedId = (raw: string): { kind: string; id: number } | null => {
    const m = String(raw).trim().match(/^([a-z_]+)-(\d+)$/i);
    if (!m) return null;
    return { kind: m[1].toLowerCase(), id: Number(m[2]) };
  };
  const [draftMeta, setDraftMeta] = useState<DraftMeta>(null);
  const [showWhyPanel, setShowWhyPanel] = useState(false);
  const [showSaveFaq, setShowSaveFaq] = useState(false);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqCategory, setFaqCategory] = useState("general");
  const generateMutation = useMutation({
    mutationFn: async (item: UnifiedItem) => {
      const url = item.source === "email"
        ? `/api/admin/emails/${item.id}/generate-response`
        : `/api/contact/${item.id}/generate-response`;
      const res = await apiRequest("POST", url);
      return (await res.json()) as GenerateResponse;
    },
    onSuccess: (data: GenerateResponse) => {
      setReplyText(data.response);
      setAiDraftSnapshot(data.response);
      setDraftClassification(data.classification ?? null);
      setDraftMeta({
        confidence: data.confidence,
        sources: data.sources,
        citedSourceIds: data.citedSourceIds,
        todayIso: data.todayIso,
        senderHistoryCount: data.senderHistoryCount,
        threadHistoryCount: data.threadHistoryCount,
        language: data.language,
      });
      setShowWhyPanel(true);
      if (data.needsHumanReview) {
        setReviewWarning(data.reviewReason || t("inboxReviewBeforeSending"));
      } else {
        setReviewWarning(null);
      }
      if (data.matchedLocationId && data.matchedLocationName) {
        setMatchedLocation({ id: data.matchedLocationId, name: data.matchedLocationName });
      } else {
        setMatchedLocation(null);
      }
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
  const forwardMutation = useMutation({
    mutationFn: async ({ emailId, locationId }: { emailId: string; locationId: number }) => {
      const res = await apiRequest("POST", `/api/admin/emails/${emailId}/forward-to-operator`, {
        locationId, note: forwardNote.trim() || undefined,
      });
      return (await res.json()) as { forwardedTo: string; locationName: string };
    },
    onSuccess: (data) => {
      toast({ title: "Forwarded to operator", description: `${data.locationName} (${data.forwardedTo})` });
      setForwardNote("");
    },
    onError: (err: unknown) =>
      toast({ title: t("error"), description: err instanceof Error ? err.message : "Failed to forward", variant: "destructive" }),
  });

  const openItem = (item: UnifiedItem) => {
    setSelected(item);
    setReplyText("");
    setReviewWarning(null);
    setMatchedLocation(null);
    setForwardNote("");
    setAiDraftSnapshot(null);
    setDraftClassification(null);
    setDraftMeta(null);
    setShowWhyPanel(false);
    setShowSaveFaq(false);
    setFaqQuestion("");
    setFaqCategory("general");
    const subj = item.subject?.startsWith("Re:") ? item.subject : `Re: ${item.subject || ""}`;
    setReplySubject(subj);
    if (!item.isRead) {
      if (item.source === "email") {
        markEmailRead.mutate(String(item.id), {
          onSuccess: () => invalidateEmailLists(),
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
      const m = newIsRead ? markEmailRead : markEmailUnread;
      m.mutate(String(item.id), {
        onSuccess: () => {
          invalidateEmailLists();
          setSelected({ ...item, isRead: newIsRead });
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
              {/* Spam / Not spam toggle (works for both email + form) */}
              {selected.isSpam || folder === "spam" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    performUnmarkSpam(selected);
                    setSelected(null);
                  }}
                  data-testid="button-not-spam"
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {t("inboxDetailNotSpam")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    performMarkSpam(selected);
                    setSelected(null);
                  }}
                  data-testid="button-report-spam"
                >
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  {t("inboxDetailReportSpam")}
                </Button>
              )}
              {/* Restore button when viewing a Trash item */}
              {(folder === "trash" || (selected.source === "form" && selected.isArchived)) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    performRestore(selected);
                    setSelected(null);
                  }}
                  data-testid="button-restore"
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  {t("inboxDetailRestore")}
                </Button>
              )}
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
              {selected.source === "email" && matchedLocation && (
                <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2" data-testid="panel-forward-operator">
                  <div className="text-sm">
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      Sender appears to be asking about: {matchedLocation.name}
                    </div>
                    <div className="text-xs text-blue-900/80 dark:text-blue-100/80 mt-1">
                      Forward this message to that gemach's operator instead of replying yourself.
                    </div>
                  </div>
                  <Textarea
                    placeholder="Optional note to the operator (e.g. 'Please follow up with this borrower directly')"
                    value={forwardNote}
                    onChange={(e) => setForwardNote(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                    data-testid="textarea-forward-note"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={forwardMutation.isPending}
                    onClick={() => forwardMutation.mutate({ emailId: String(selected.id), locationId: matchedLocation.id })}
                    data-testid="button-forward-operator"
                  >
                    {forwardMutation.isPending ? "Forwarding…" : `Forward to ${matchedLocation.name}`}
                  </Button>
                </div>
              )}
              {reviewWarning && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex items-start gap-2" data-testid="banner-needs-review">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-amber-900 dark:text-amber-100">{t("inboxNeedsReviewTitle")}</div>
                    <div className="text-amber-900/90 dark:text-amber-100/90 text-xs mt-1">{reviewWarning}</div>
                  </div>
                </div>
              )}
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

              {draftMeta && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2" data-testid="panel-why-this-draft">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between font-semibold text-sm"
                    onClick={() => setShowWhyPanel((v) => !v)}
                    data-testid="button-toggle-why-draft"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5" />
                      Why this draft
                      {typeof draftMeta.confidence === "number" && (
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono ${
                            draftMeta.confidence >= 0.8
                              ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
                              : draftMeta.confidence >= 0.6
                              ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                              : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
                          }`}
                          data-testid="badge-confidence"
                        >
                          {Math.round((draftMeta.confidence ?? 0) * 100)}%
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">{showWhyPanel ? "−" : "+"}</span>
                  </button>
                  {showWhyPanel && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                        {draftMeta.todayIso && <div>Date used: <span className="font-mono text-foreground">{draftMeta.todayIso}</span></div>}
                        {draftClassification && <div>Classification: <span className="text-foreground">{draftClassification}</span></div>}
                        {draftMeta.language && <div>Language: <span className="text-foreground">{draftMeta.language}</span></div>}
                        {typeof draftMeta.senderHistoryCount === "number" && (
                          <div>Sender history: <span className="text-foreground">{draftMeta.senderHistoryCount}</span></div>
                        )}
                        {typeof draftMeta.threadHistoryCount === "number" && (
                          <div>Thread msgs: <span className="text-foreground">{draftMeta.threadHistoryCount}</span></div>
                        )}
                      </div>
                      {draftMeta.sources && draftMeta.sources.length > 0 ? (
                        <div>
                          {(() => {
                            const citedSet = new Set(
                              (draftMeta.citedSourceIds || [])
                                .map(parseCitedId)
                                .filter((x): x is { kind: string; id: number } => !!x)
                                .map((c) => `${c.kind}:${c.id}`)
                            );
                            return (
                              <>
                                <div className="font-semibold mb-1">
                                  Sources used ({draftMeta.sources.length}
                                  {citedSet.size > 0 ? `, ${citedSet.size} cited` : ""}):
                                </div>
                                <ul className="space-y-1">
                                  {draftMeta.sources.map((s, i) => {
                                    const cited = citedSet.has(`${s.kind}:${s.id}`);
                                    const display = s.label || s.title || `${s.kind}-${s.id}`;
                                    return (
                                      <li key={`${s.kind}-${s.id}-${i}`} className={`flex gap-2 ${cited ? "" : "opacity-60"}`} data-testid={`source-${s.kind}-${s.id}`}>
                                        <span className="font-mono text-[10px] uppercase shrink-0 px-1 py-0.5 rounded bg-background border">{s.kind}</span>
                                        <span className="flex-1">
                                          <span className="font-medium">{display}</span>
                                          {cited && <span className="ml-1 text-green-700 dark:text-green-400">✓ cited</span>}
                                          {s.snippet && <div className="text-muted-foreground line-clamp-2">{s.snippet}</div>}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="text-muted-foreground italic">No knowledge-base matches were retrieved.</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {showSaveFaq && (
                <SaveToFaqPanel
                  defaultQuestion={faqQuestion}
                  defaultCategory={faqCategory}
                  answer={replyText}
                  language={draftMeta?.language || "en"}
                  onCancel={() => {
                    setShowSaveFaq(false);
                    setReplyText("");
                    setSelected(null);
                  }}
                  onSaved={() => {
                    setShowSaveFaq(false);
                    setReplyText("");
                    setSelected(null);
                  }}
                />
              )}
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
            <Dialog open={glossaryOpen} onOpenChange={setGlossaryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-open-glossary">
                  <BookOpen className="h-4 w-4 mr-2" />
                  AI Knowledge Base
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    AI Knowledge Base
                  </DialogTitle>
                  <DialogDescription>
                    Edit the facts and FAQ answers the AI uses when drafting replies in this inbox.
                  </DialogDescription>
                </DialogHeader>
                <GlossaryContent />
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={emailQueries.isFetching} data-testid="button-refresh">
              <RefreshCw className={`h-4 w-4 mr-2 ${emailQueries.isFetching ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        </div>

        {/* Folder tabs (Inbox / Spam / Trash) — primary filter.
            Counts combine contact-form totals with Gmail label backlog so the
            chip reflects the full queue, not just one source. */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {(() => {
            const gmailCounts = gmailLabelCountsQuery.data ?? { unread: 0, spam: 0, trash: 0 };
            return [
              { key: "inbox" as Folder, label: t("inboxFolderInbox"), icon: InboxIcon, count: unreadCount + gmailCounts.unread },
              { key: "spam" as Folder, label: t("inboxFolderSpam"), icon: ShieldAlert, count: formSpamCount + gmailCounts.spam },
              { key: "trash" as Folder, label: t("inboxFolderTrash"), icon: Trash2, count: formTrashCount + gmailCounts.trash },
            ];
          })().map(({ key, label, icon: Icon, count }) => {
            const active = folder === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFolder(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground hover-elevate"
                }`}
                data-testid={`tab-folder-${key}`}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {count > 0 && (
                  <span
                    className={`ml-1 rounded-full px-1.5 text-[10px] font-medium ${
                      active ? "bg-primary-foreground/20" : "bg-muted"
                    }`}
                    data-testid={`tab-folder-${key}-count`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              data-testid="button-toggle-filters"
            >
              <SlidersHorizontal className="h-4 w-4 mr-1.5" />
              {showFilters ? t("inboxFiltersHide") : t("inboxFiltersShow")}
            </Button>
          </div>
        </div>

        {/* Search + secondary filters (collapsible to keep the chrome tidy) */}
        <div className="flex flex-col gap-3 mb-6">
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
          {/* Swipe-discoverability hint (desktop sees a tooltip-like line; on touch it just reads as a tip) */}
          <p className="text-xs text-muted-foreground italic" data-testid="text-swipe-hint">
            {t("inboxSwipeHint")}
          </p>
          {showFilters && (
            <div className="flex gap-2 flex-wrap items-center" data-testid="filters-secondary">
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
              <div className="w-px h-6 bg-border mx-1" />
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
              {(sourceFilter !== "all" || readFilter !== "all" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSourceFilter("all"); setReadFilter("all"); setSearch(""); }}
                  data-testid="button-clear-filters"
                >
                  {t("inboxClearFilters")}
                </Button>
              )}
            </div>
          )}
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
                <h3 className="text-lg font-medium">
                  {folder === "spam"
                    ? t("inboxSpamEmpty")
                    : folder === "trash"
                    ? t("inboxTrashEmpty")
                    : t("inboxEmpty")}
                </h3>
                <p className="text-muted-foreground">{t("inboxEmptyDesc")}</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((it) => {
                  // Swipe action wiring per Task #22 spec:
                  // - Right swipe ALWAYS = Mark unread (in Trash it doubles as Restore since "unread"
                  //   on a trashed item is meaningless — Restore is the equivalent recovery gesture).
                  // - Short left = Archive (Inbox only).
                  // - Long left = Delete (hard-delete for contacts, Gmail trash for emails). Disabled in Trash.
                  const rightAction =
                    folder === "trash"
                      ? { label: t("inboxDetailRestore"), icon: Undo2, color: "bg-blue-500", onCommit: () => performRestore(it) }
                      : { label: t("inboxSwipeMarkUnread"), icon: EyeOff, color: "bg-blue-500", onCommit: () => performMarkUnread(it) };
                  const leftAction =
                    folder === "inbox"
                      ? { label: t("inboxSwipeArchive"), icon: Archive, color: "bg-amber-600", onCommit: () => performArchive(it) }
                      : undefined;
                  const leftLongAction =
                    folder === "trash"
                      ? undefined
                      : { label: t("inboxSwipeDelete"), icon: Trash2, color: "bg-red-600", onCommit: () => performTrash(it) };
                  return (
                    <SwipeableRow
                      key={it.key}
                      testId={`row-${it.key}`}
                      rightAction={rightAction}
                      leftAction={leftAction}
                      leftLongAction={leftLongAction}
                      isRtl={language === "he"}
                    >
                      <button
                        type="button"
                        onClick={() => openItem(it)}
                        className={`w-full p-4 text-left hover-elevate active-elevate-2 transition-colors flex items-start gap-4 ${
                          !it.isRead ? "bg-primary/5" : ""
                        }`}
                        data-testid={`row-${it.key}-button`}
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
                              {it.source === "form" && it.isSpam && (
                                <Badge variant="outline" className="text-[10px] py-0 h-5 flex-shrink-0 border-amber-500 text-amber-700 dark:text-amber-300">
                                  <ShieldAlert className="h-3 w-3 mr-1" />
                                  {t("inboxFolderSpam")}
                                </Badge>
                              )}
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
                    </SwipeableRow>
                  );
                })}
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

function SaveToFaqPanel({
  defaultQuestion, defaultCategory, answer, language, onSaved, onCancel,
}: {
  defaultQuestion: string;
  defaultCategory: string;
  answer: string;
  language: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState(defaultQuestion);
  const [category, setCategory] = useState(defaultCategory);
  const [editedAnswer, setEditedAnswer] = useState(answer);
  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/faq-entries", {
        question: question.trim(),
        answer: editedAnswer.trim(),
        category: category.trim() || "general",
        language: language === "he" ? "he" : "en",
        isActive: true,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to knowledge base", description: "This Q&A will now be retrieved for similar future emails." });
      onSaved();
    },
    onError: (err: unknown) =>
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : String(err), variant: "destructive" }),
  });
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2" data-testid="panel-save-to-faq">
      <div className="font-semibold text-sm text-blue-900 dark:text-blue-100">Save this reply to the knowledge base?</div>
      <div className="text-xs text-blue-900/80 dark:text-blue-100/80">Future emails like this will use it as a reference.</div>
      <Input
        placeholder="Question (what was the sender asking?)"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        data-testid="input-faq-question"
      />
      <Input
        placeholder="Category (e.g. returns, hours, location)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        data-testid="input-faq-category"
      />
      <Textarea
        rows={4}
        value={editedAnswer}
        onChange={(e) => setEditedAnswer(e.target.value)}
        className="resize-none text-sm"
        data-testid="textarea-faq-answer"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} data-testid="button-skip-save-faq">Skip</Button>
        <Button
          size="sm"
          disabled={!question.trim() || !editedAnswer.trim() || saveMut.isPending}
          onClick={() => saveMut.mutate()}
          data-testid="button-save-faq"
        >
          {saveMut.isPending ? "Saving…" : "Save to FAQ"}
        </Button>
      </div>
    </div>
  );
}
