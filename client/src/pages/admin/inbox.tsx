import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ChevronUp,
  Pencil,
  Eye,
  EyeOff,
  BookOpen,
  Archive,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { SwipeableRow } from "@/components/admin/SwipeableRow";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare, X } from "lucide-react";
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
import DOMPurify from "dompurify";
import type { Contact, Location } from "@shared/schema";
import { groupFormContacts } from "@shared/form-thread-grouping";
import type { TranslationKey } from "@/lib/translations";

type SourceFilter = "all" | "email" | "form";
type ReadFilter = "all" | "unread" | "read";
type ReplyFilter = "all" | "unreplied" | "replied";
type Folder = "inbox" | "spam" | "trash" | "sent";

// Persisted-filter state (Task #36). Saved to localStorage so an admin who
// leaves the inbox to open a transaction or refresh the page returns to the
// SAME triage view (e.g. "Needs reply" filter still active) instead of
// resetting to All / All / All every time. The bump suffix lets us safely
// invalidate stale shapes if the persisted format ever changes.
const FILTER_STORAGE_KEY = "admin-inbox-filters-v1";

interface PersistedFilterState {
  folder: Folder;
  sourceFilter: SourceFilter;
  readFilter: ReadFilter;
  replyFilter: ReplyFilter;
  search: string;
}

const DEFAULT_FILTER_STATE: PersistedFilterState = {
  folder: "inbox",
  sourceFilter: "all",
  readFilter: "all",
  replyFilter: "all",
  search: "",
};

// Read once on mount. Defensive against missing localStorage (SSR/private
// mode), malformed JSON, and out-of-range enum values from older builds —
// any unrecognized field falls back to its default. Strings (search) are
// length-capped so a malicious/legacy huge value can't blow up state.
function loadPersistedFilters(): PersistedFilterState {
  if (typeof window === "undefined") return DEFAULT_FILTER_STATE;
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTER_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedFilterState>;
    const folder: Folder =
      parsed.folder === "inbox" || parsed.folder === "spam" || parsed.folder === "trash" || parsed.folder === "sent"
        ? parsed.folder
        : DEFAULT_FILTER_STATE.folder;
    const sourceFilter: SourceFilter =
      parsed.sourceFilter === "all" || parsed.sourceFilter === "email" || parsed.sourceFilter === "form"
        ? parsed.sourceFilter
        : DEFAULT_FILTER_STATE.sourceFilter;
    const readFilter: ReadFilter =
      parsed.readFilter === "all" || parsed.readFilter === "unread" || parsed.readFilter === "read"
        ? parsed.readFilter
        : DEFAULT_FILTER_STATE.readFilter;
    const replyFilter: ReplyFilter =
      parsed.replyFilter === "all" || parsed.replyFilter === "unreplied" || parsed.replyFilter === "replied"
        ? parsed.replyFilter
        : DEFAULT_FILTER_STATE.replyFilter;
    const search = typeof parsed.search === "string" ? parsed.search.slice(0, 500) : DEFAULT_FILTER_STATE.search;
    // If the persisted folder is Sent, normalize secondary filters to the same
    // state that handleFolderChange would produce, so stale filter values from
    // an older session don't produce an empty-looking Sent view on reload.
    const normalizedSource: SourceFilter = folder === "sent" ? "email" : sourceFilter;
    const normalizedRead: ReadFilter = folder === "sent" ? "all" : readFilter;
    const normalizedReply: ReplyFilter = folder === "sent" ? "all" : replyFilter;
    return { folder, sourceFilter: normalizedSource, readFilter: normalizedRead, replyFilter: normalizedReply, search };
  } catch {
    return DEFAULT_FILTER_STATE;
  }
}

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
  // Server-authoritative thread totals (from /api/admin/emails/threads).
  messageCount?: number;
  unreadCount?: number;
  // Lowercased concat of from+subject+body across every message in the thread,
  // populated only by /api/admin/emails/threads. Used by inbox search to match
  // tokens that only appear in older messages of a Gmail conversation.
  searchText?: string;
}

interface EmailsResponse {
  // `threads` from the new thread-grouped endpoint; `emails` from the legacy one.
  threads?: GmailEmail[];
  emails?: GmailEmail[];
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
  // Server-authoritative thread counts; preferred over client-derived counts when set.
  serverMessageCount?: number;
  serverUnreadCount?: number;
  // Recipient address — populated for outbound (SENT) Gmail items so the
  // Sent folder can display "To: …" instead of "From: …".
  toAddress?: string;
  // Raw Gmail label IDs on the latest thread message (e.g. ['SENT', 'INBOX']).
  // Used to detect outbound threads in any folder (not just the Sent folder).
  labels?: string[];
  // Lowercased concat of from+subject+body across EVERY message in this
  // Gmail thread (set only on email items by /api/admin/emails/threads).
  // Lets the inbox search match a token that only appears in an older
  // message — without it, search would only see this row's "latest" body.
  // Form items don't need this: every contact in a form thread is a
  // standalone UnifiedItem already, so per-item body search already
  // covers the whole conversation via `g.members.some(...)`.
  searchText?: string;
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

// Strip leading "Re:" / "Fwd:" / "Aw:" / "Tr:" prefixes and collapse
// whitespace so two messages with the same underlying subject group together
// in the thread view. Mirrors the server-side helper in openai-client.ts /
// the /api/admin/inbox/thread endpoint so client and server agree on what
// counts as "the same conversation".
function normalizeSubject(s: string): string {
  return String(s || "")
    .replace(/^\s*((re|fw|fwd|aw|tr)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Stable per-conversation key. Email items thread by Gmail's native threadId
// (with id fallback when threadId is missing). Form items thread loosely:
// same sender + (identical | fuzzy-similar subject | empty subject within a
// time window | any subject within a tight time window). The clustering
// happens up front in `buildGroups` via `groupFormContacts` so this lookup
// just maps a single item to its precomputed canonical key.
function groupKey(item: UnifiedItem, formKeys: Map<string, string>): string {
  if (item.source === "email") return `email::${item.threadId || item.id}`;
  const precomputed = formKeys.get(String(item.id));
  if (precomputed) return precomputed;
  // Fallback (shouldn't normally hit): old key shape so the row still renders.
  const email = (item.fromEmail || "").toLowerCase();
  return `form::${email}::${normalizeSubject(item.subject)}`;
}

interface InboxThread {
  key: string;
  latest: UnifiedItem;
  members: UnifiedItem[];
  messageCount: number;
  unreadCount: number;
}

interface ThreadEntry {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to?: string;
  subject: string;
  body: string;
  date: string;
  isRead?: boolean;
  source: "gmail" | "form" | "saved";
  messageRef?: string;
}

interface ThreadResponse {
  source: "email" | "form";
  threadKey: string;
  messages: ThreadEntry[];
}

export default function AdminInbox() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<UnifiedItem | null>(null);
  // Seed every filter from the persisted snapshot using LAZY useState
  // initializers — React invokes these functions exactly once per state
  // slot (on the very first render, never again), so localStorage is read
  // only on mount and never on subsequent re-renders even though the
  // surrounding component re-renders dozens of times as queries resolve.
  const [search, setSearch] = useState<string>(() => loadPersistedFilters().search);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => loadPersistedFilters().sourceFilter);
  const [readFilter, setReadFilter] = useState<ReadFilter>(() => loadPersistedFilters().readFilter);
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>(() => loadPersistedFilters().replyFilter);
  const [folder, setFolder] = useState<Folder>(() => loadPersistedFilters().folder);

  // Reset secondary filters on every folder change so stale read/source/
  // reply state from one folder doesn't produce a confusing empty list
  // in another folder. Entering Sent pins source="email" (no form
  // submissions exist there); all other folders default to source="all".
  const handleFolderChange = (next: Folder) => {
    setSourceFilter(next === "sent" ? "email" : "all");
    setReadFilter("all");
    setReplyFilter("all");
    setFolder(next);
  };

  // Mirror filter state to localStorage on every change. Whenever the admin
  // toggles a filter — including the clear-filters button (which calls the
  // setters and so flows through this effect) — the new snapshot is written.
  // Quietly swallows errors: storage may be full or unavailable in private
  // browsing, and a failure here should never break the inbox.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const snapshot: PersistedFilterState = {
        folder,
        sourceFilter,
        readFilter,
        replyFilter,
        search,
      };
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // localStorage write failed — non-fatal, ignore.
    }
  }, [folder, sourceFilter, readFilter, replyFilter, search]);
  // Bulk-select mode lets the admin tick multiple rows and apply a single
  // batch action (Archive / Trash / Report-spam / Mark read) instead of
  // swiping each row individually.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [brokenLinkWarning, setBrokenLinkWarning] = useState<{ links: { url: string; reason?: string }[]; item: UnifiedItem } | null>(null);
  const [linkCheckPending, setLinkCheckPending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editMessage, setEditMessage] = useState("");

  // Gmail config status
  const gmailStatusQuery = useQuery<{ configured: boolean; environment: string; message: string }>({
    queryKey: ["/api/admin/emails/status"],
  });

  // Gmail backlog totals (INBOX/SENT/SPAM/TRASH label sizes) for folder chips.
  // The endpoint returns zeros if Gmail is unavailable, so this is safe to render unconditionally.
  const gmailLabelCountsQuery = useQuery<{ inbox: number; sent: number; spam: number; trash: number }>({
    queryKey: ["/api/admin/emails/labels"],
    enabled: !!gmailStatusQuery.data?.configured,
    refetchInterval: 60_000,
  });

  // Contacts query
  const contactsQuery = useQuery<Contact[]>({
    queryKey: ["/api/contact"],
  });

  // Locations query — used to derive operator email set for inbox badge and save-email banner.
  const locationsQuery = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  // Set of lower-cased email addresses that belong to known gemach operators.
  const operatorEmailSet = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const loc of locationsQuery.data ?? []) {
      if (loc.email) s.add(loc.email.toLowerCase().trim());
    }
    return s;
  }, [locationsQuery.data]);

  // State for the "save email to profile" banner shown in thread detail view.
  const [saveEmailBannerDismissed, setSaveEmailBannerDismissed] = useState(false);
  const [saveEmailLocationId, setSaveEmailLocationId] = useState<string>("");
  const [saveEmailPending, setSaveEmailPending] = useState(false);

  // Which messages have already been answered (from any saved reply example).
  // Aggregated server-side as one row per (sourceType, sourceRef) so the list
  // can render a "Replied" badge without per-row fetches. Refetches on a slow
  // poll so the badge appears even if a reply was sent from another tab.
  const repliedRefsQuery = useQuery<{ sourceType: string; sourceRef: string; lastRepliedAt: string }[]>({
    queryKey: ["/api/admin/reply-examples/refs"],
    refetchInterval: 60_000,
  });
  const repliedRefMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of repliedRefsQuery.data ?? []) {
      m.set(`${r.sourceType}:${r.sourceRef}`, r.lastRepliedAt);
    }
    return m;
  }, [repliedRefsQuery.data]);
  // For email items the saved reply ref key is the Gmail threadId (so all
  // messages on a conversation share replied state); forms key by contact id.
  const replyRefForItem = (item: UnifiedItem): string => {
    if (item.source === "email") return String(item.threadId || item.id);
    return String(item.id);
  };
  const lookupReplied = (item: UnifiedItem): string | null => {
    // Primary lookup uses the current key (threadId for email). Falls back
    // to the legacy message-id key so historical reply_example rows captured
    // before threadId became the standard still mark messages as replied.
    const primary = repliedRefMap.get(`${item.source}:${replyRefForItem(item)}`);
    if (primary !== undefined) return primary || ""; // empty string => "replied, no exact date"
    if (item.source === "email") {
      const legacy = repliedRefMap.get(`email:${String(item.id)}`);
      if (legacy !== undefined) return legacy || "";
    }
    return null;
  };

  // Paginated thread-grouped email list (one entry per Gmail conversation).
  const emailQueries = useInfiniteQuery<EmailsResponse>({
    queryKey: ["/api/admin/emails/threads", "infinite", folder],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ maxResults: "25", mode: folder });
      if (typeof pageParam === "string" && pageParam) {
        params.set("pageToken", pageParam);
      }
      const res = await fetch(`/api/admin/emails/threads?${params.toString()}`, { credentials: "include" });
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
    qc.invalidateQueries({ queryKey: ["/api/admin/emails/threads", "infinite"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/emails/labels"] });
  };

  const allEmails: GmailEmail[] = useMemo(() => {
    const merged = (emailQueries.data?.pages ?? []).flatMap((p) => p.threads ?? p.emails ?? []);
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/threads", "infinite"] }),
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
        toAddress: e.to || undefined,
        labels: e.labels || [],
        subject: e.subject,
        body: e.body,
        snippet: e.snippet,
        date: safeDate(e.date),
        isRead: e.isRead,
        serverMessageCount: e.messageCount,
        serverUnreadCount: e.unreadCount,
        searchText: e.searchText,
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
      // Form submissions have no "Sent" equivalent — exclude them entirely.
      if (folder === "sent") return false;
      if (folder === "inbox") return !it.isArchived && !it.isSpam;
      if (folder === "spam") return !!it.isSpam && !it.isArchived;
      if (folder === "trash") return !!it.isArchived;
    }
    return true;
  });

  // Source filter still operates per-item (a form-only or email-only view of
  // the folder). Read/replied/search filters move to the THREAD level below
  // so a long thread isn't reduced to a partial transcript by a search hit
  // on an old message — the row should appear with its full message count
  // even when the match is buried in the conversation.
  const filtered = folderFiltered.filter((it) => {
    if (sourceFilter !== "all" && it.source !== sourceFilter) return false;
    return true;
  });

  // Collapse the flat per-message feed into one row per conversation.
  // The list now shows the latest message in each thread (with a "{N}
  // messages" pill when multiple messages are grouped) instead of repeating
  // the same sender/subject pair on every back-and-forth turn. Bulk-select
  // and swipe gestures still operate on the latest message — opening a
  // thread loads the full transcript via /api/admin/inbox/thread.
  // Helper: build a map of conversation groups from a list of items.
  // Used twice — once over filtered items (for the visible inbox list)
  // and once over the full unified list (for thread-level mutations so
  // archive/spam/trash always fan out to every sibling, even when the
  // user has a folder/search/unread filter active that hides some of
  // them).
  const buildGroups = (items: UnifiedItem[]): InboxThread[] => {
    // Precompute the loose conversation key for every form item up front so
    // sibling submissions with rewritten subjects collapse onto a single
    // row. The same helper runs server-side in /api/admin/inbox/thread so
    // opening any row pulls the matching expanded transcript.
    const formGrouping = groupFormContacts(
      items
        .filter((it) => it.source === "form")
        .map((it) => ({
          id: String(it.id),
          email: it.fromEmail,
          subject: it.subject,
          date: it.date,
        })),
    );
    const formKeys = formGrouping.keyByContactId;
    const groups = new Map<string, InboxThread>();
    for (const it of items) {
      const k = groupKey(it, formKeys);
      const existing = groups.get(k);
      if (!existing) {
        groups.set(k, {
          key: k,
          latest: it,
          members: [it],
          messageCount: 1,
          unreadCount: it.isRead ? 0 : 1,
        });
        continue;
      }
      existing.members.push(it);
      existing.messageCount += 1;
      if (!it.isRead) existing.unreadCount += 1;
      const tNew = new Date(it.date).getTime();
      const tCur = new Date(existing.latest.date).getTime();
      if ((isNaN(tNew) ? 0 : tNew) > (isNaN(tCur) ? 0 : tCur)) {
        existing.latest = it;
      }
    }
    // Prefer server-supplied counts (full thread) over client-derived ones (loaded only).
    Array.from(groups.values()).forEach((g) => {
      if (typeof g.latest.serverMessageCount === 'number') {
        g.messageCount = g.latest.serverMessageCount;
      }
      if (typeof g.latest.serverUnreadCount === 'number') {
        g.unreadCount = g.latest.serverUnreadCount;
      }
    });
    return Array.from(groups.values()).sort((a, b) => {
      const ta = new Date(a.latest.date).getTime();
      const tb = new Date(b.latest.date).getTime();
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
  };

  // Replied-state lookup at the thread level. For Gmail threads every
  // member shares the same threadId so the existing per-item lookup is
  // sufficient. For form threads the saved reply is keyed by the original
  // contact id, so we walk every sibling and surface the most recent
  // replied-at timestamp. Defined here (above threadGroups) because the
  // visible-list memo uses it to apply the replied/un-replied filter.
  const lookupRepliedForGroup = (g: InboxThread): string | null => {
    if (g.latest.source === "email") return lookupReplied(g.latest);
    let latest: string | null = null;
    for (const m of g.members) {
      const r = lookupReplied(m);
      if (r === null) continue;
      if (latest === null || (r && r.localeCompare(latest) > 0)) latest = r;
    }
    return latest;
  };

  // Build thread groups first (so messageCount stays full), then apply the
  // read/replied/search filters at the THREAD level. A thread matches the
  // search if ANY of its messages contain the query — so a hit in an old
  // message correctly surfaces the conversation row with its full
  // "{N} messages" badge intact, instead of dropping the thread entirely or
  // collapsing it to just the matching message.
  const threadGroups: InboxThread[] = useMemo(() => {
    const allGroups = buildGroups(filtered);
    const q = search.trim().toLowerCase();
    return allGroups.filter((g) => {
      // Read filter — a thread is "unread" if any sibling is unread, "read"
      // when every sibling has been read.
      if (readFilter === "unread" && g.unreadCount === 0) return false;
      if (readFilter === "read" && g.unreadCount > 0) return false;

      // Replied filter — operates against the per-thread replied lookup so
      // it stays accurate for both Gmail (one shared threadId) and form
      // (per-contact saved replies, latest wins).
      if (replyFilter !== "all") {
        const repliedAt = lookupRepliedForGroup(g);
        if (replyFilter === "replied" && repliedAt === null) return false;
        if (replyFilter === "unreplied" && repliedAt !== null) return false;
      }

      // Search — match across every message in the thread, not just the
      // latest. For form threads each contact is its own UnifiedItem so
      // walking `g.members` covers the full conversation. For Gmail threads
      // only the latest message lives client-side; older messages are
      // searched via the server-built `searchText` blob attached to the
      // email member (lowercased concat of from+subject+body for every
      // message in the Gmail thread). fromName/email tend to be identical
      // across siblings, but subject and body can differ (especially with
      // Re:/Fwd: variants).
      if (q) {
        const hit = g.members.some((m) =>
          m.fromName.toLowerCase().includes(q) ||
          m.fromEmail.toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q) ||
          (m.searchText ? m.searchText.includes(q) : false),
        );
        if (!hit) return false;
      }
      return true;
    });
    // `repliedRefMap` is the underlying data source `lookupRepliedForGroup`
    // reads from. Including it in deps ensures the visible list recomputes
    // when the replied-refs query loads or refreshes — without it, an admin
    // who switches to "Needs reply" before the refs query resolves would see
    // stale results until another listed dep changed.
  }, [filtered, readFilter, replyFilter, search, repliedRefMap]);

  // Canonical thread map across ALL loaded messages (no filters
  // applied). Mutation handlers — bulk actions, swipe gestures, detail
  // header buttons — resolve a thread's full member list against this
  // map so an action on one row always touches every sibling, even if
  // the unread/source/search filter currently hides some of them.
  const allThreadGroupsByKey: Map<string, InboxThread> = useMemo(() => {
    const map = new Map<string, InboxThread>();
    for (const g of buildGroups(unified)) map.set(g.key, g);
    return map;
  }, [unified]);

  // Form-grouping map computed against the FULL unified set so any form
  // item can be resolved back to its canonical conversation key, even when
  // the visible (`filtered`) set hides some siblings.
  const allFormKeys: Map<string, string> = useMemo(() => {
    return groupFormContacts(
      unified
        .filter((it) => it.source === "form")
        .map((it) => ({
          id: String(it.id),
          email: it.fromEmail,
          subject: it.subject,
          date: it.date,
        })),
    ).keyByContactId;
  }, [unified]);

  const groupMembersFor = (item: UnifiedItem | null | undefined): UnifiedItem[] => {
    if (!item) return [];
    const g = allThreadGroupsByKey.get(groupKey(item, allFormKeys));
    return g?.members ?? [item];
  };

  // Items currently selected in bulk mode, resolved against the visible list.
  // Looking up by key (rather than caching items at click-time) keeps the
  // selection in sync if the underlying data refetches mid-selection.
  // Bulk selection now operates at the conversation (thread) level — the
  // visible "key set" is the latest message of each thread, matching the
  // rows the user actually sees. Bulk actions still apply to that latest
  // message just like the swipe gestures on a single row.
  const filteredKeySet = useMemo(
    () => new Set(threadGroups.map((g) => g.latest.key)),
    [threadGroups]
  );
  const selectedItems = useMemo(
    () => threadGroups.map((g) => g.latest).filter((it) => selectedKeys.has(it.key)),
    [threadGroups, selectedKeys]
  );
  // Flatten the selected threads to ALL their members so bulk actions
  // (archive/trash/spam/restore/markRead) move every sibling, not just
  // the latest. Falls back to the visible item when a group can't be
  // resolved (extremely defensive — shouldn't happen in practice).
  const selectedThreadMembers = useMemo(() => {
    const out: UnifiedItem[] = [];
    const seen = new Set<string>();
    for (const it of selectedItems) {
      const members = groupMembersFor(it);
      for (const m of members) {
        if (seen.has(m.key)) continue;
        seen.add(m.key);
        out.push(m);
      }
    }
    return out;
  }, [selectedItems, allThreadGroupsByKey]);

  // Drop any selected keys that no longer appear in the visible list (e.g.
  // after switching folders, applying a filter, or after a bulk action moved
  // them out). Prevents "phantom" selections.
  useEffect(() => {
    if (selectedKeys.size === 0) return;
    const keysArr = Array.from(selectedKeys);
    const needsPrune = keysArr.some((k) => !filteredKeySet.has(k));
    if (needsPrune) {
      setSelectedKeys((prev) => {
        const next = new Set<string>();
        Array.from(prev).forEach((k) => { if (filteredKeySet.has(k)) next.add(k); });
        return next;
      });
    }
  }, [filteredKeySet, selectedKeys]);

  // Leaving select mode always clears any pending selection.
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  };
  const toggleRowSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const allVisibleSelected = threadGroups.length > 0 && selectedItems.length === threadGroups.length;
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(threadGroups.map((g) => g.latest.key)));
    }
  };

  // Folder chip counts use TOTAL backlog per source — not unread — so they
  // mirror Gmail's own folder badges. Form-side counts come from the local
  // contacts list; Gmail-side counts come from /api/admin/emails/labels.
  const formInboxCount = (contactsQuery.data ?? []).filter(
    (c) => !c.isArchived && !c.isSpam
  ).length;
  // Unread badge in the header reflects only currently-loaded inbox items
  // (used as a quick visual cue, not an authoritative backlog metric).
  const unreadCount = unified.filter(
    (u) => !u.isRead && (u.source === "email" || (!u.isArchived && !u.isSpam))
  ).length;
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
  const unarchiveEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/unarchive`),
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
      duration: 5000,
      action: (
        <ToastAction altText={t("inboxDetailRestore")} onClick={undoFn} data-testid="toast-undo-action">
          {t("inboxDetailRestore")}
        </ToastAction>
      ),
    });
  };
  const performUnarchive = (item: UnifiedItem) => {
    const success = () => toast({ title: t("inboxRestoreSuccess") });
    const failure = () => toast({ title: t("inboxRestoreFailed"), variant: "destructive" });
    if (item.source === "email") {
      // Re-add INBOX label so the message reappears in the inbox folder.
      unarchiveEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      updateContactFlags.mutate(
        { id: Number(item.id), isArchived: false },
        { onSuccess: success, onError: failure }
      );
    }
  };
  const performArchive = (item: UnifiedItem) => {
    const failure = () => toast({ title: t("inboxArchiveFailed"), variant: "destructive" });
    // Undo archive uses the dedicated unarchive path (re-add INBOX label for
    // Gmail; clear isArchived for contact-form messages). performRestore would
    // call untrash, which is wrong for archived-but-not-trashed messages.
    const success = () => undoToast(t("inboxArchiveSuccess"), () => performUnarchive(item));
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
      // Bind the inverse here so undo works regardless of current folder.
      const undo = () => {
        const ok = () => toast({ title: t("inboxRestoreSuccess") });
        const ko = () => toast({ title: t("inboxRestoreFailed"), variant: "destructive" });
        untrashEmailMut.mutate(String(item.id), { onSuccess: ok, onError: ko });
      };
      const success = () => undoToast(t("inboxTrashSuccess"), undo);
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
  const performUnmarkSpam = (item: UnifiedItem) => {
    const success = () => toast({ title: t("inboxNotSpamSuccess") });
    const failure = () => toast({ title: t("inboxNotSpamFailed"), variant: "destructive" });
    if (item.source === "email") {
      notSpamEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      updateContactFlags.mutate({ id: Number(item.id), isSpam: false }, { onSuccess: success, onError: failure });
    }
  };
  const performMarkSpam = (item: UnifiedItem) => {
    const failure = () => toast({ title: t("inboxSpamFailed"), variant: "destructive" });
    // Bind the inverse explicitly so undo works regardless of folder state.
    const undo = () => performUnmarkSpam(item);
    const success = () => undoToast(t("inboxSpamSuccess"), undo);
    if (item.source === "email") {
      spamEmailMut.mutate(String(item.id), { onSuccess: success, onError: failure });
    } else {
      updateContactFlags.mutate({ id: Number(item.id), isSpam: true }, { onSuccess: success, onError: failure });
    }
  };

  // ===== Bulk actions =====
  // `unarchive` is archive's inverse; `untrash` is trash's inverse; `restore` is the folder-aware user action.
  type BulkKind = "markRead" | "markUnread" | "archive" | "unarchive" | "trash" | "untrash" | "spam" | "notSpam" | "restore";
  const runOneBulk = async (item: UnifiedItem, kind: BulkKind): Promise<void> => {
    const idStr = String(item.id);
    const idNum = Number(item.id);
    if (item.source === "email") {
      // Prefer the thread endpoint so all siblings move atomically.
      const tid = item.threadId;
      const base = tid
        ? `/api/admin/emails/thread/${tid}`
        : `/api/admin/emails/${idStr}`;
      switch (kind) {
        case "markRead": await apiRequest("POST", `${base}/read`); return;
        case "markUnread": await apiRequest("POST", `${base}/unread`); return;
        case "archive": await apiRequest("POST", `${base}/archive`); return;
        case "unarchive": await apiRequest("POST", `${base}/unarchive`); return;
        case "trash": await apiRequest("POST", `${base}/trash`); return;
        case "untrash": await apiRequest("POST", `${base}/untrash`); return;
        case "spam": await apiRequest("POST", `${base}/spam`); return;
        case "notSpam": await apiRequest("POST", `${base}/not-spam`); return;
        case "restore":
          if (folder === "spam") {
            await apiRequest("POST", `${base}/not-spam`);
          } else {
            await apiRequest("POST", `${base}/untrash`);
          }
          return;
      }
    } else {
      switch (kind) {
        case "markRead":
          await apiRequest("PATCH", `/api/contact/${idNum}`, { isRead: true }); return;
        case "markUnread":
          await apiRequest("PATCH", `/api/contact/${idNum}`, { isRead: false }); return;
        case "archive":
          await apiRequest("PATCH", `/api/contact/${idNum}`, { isArchived: true }); return;
        case "unarchive":
          await apiRequest("PATCH", `/api/contact/${idNum}`, { isArchived: false }); return;
        case "trash":
          // Contacts are hard-deleted on trash.
          await apiRequest("DELETE", `/api/contact/${idNum}`); return;
        case "spam":
          await apiRequest("PATCH", `/api/contact/${idNum}`, { isSpam: true }); return;
        case "notSpam":
          await apiRequest("PATCH", `/api/contact/${idNum}`, { isSpam: false }); return;
        case "restore":
          await apiRequest("PATCH", `/api/contact/${idNum}`, { isArchived: false, isSpam: false }); return;
      }
    }
  };
  // One request per Gmail thread; form items kept per-row (no thread endpoint).
  const dedupeForBulk = (items: UnifiedItem[]): UnifiedItem[] => {
    const seen = new Set<string>();
    const out: UnifiedItem[] = [];
    for (const it of items) {
      const tag = it.source === "email" && it.threadId
        ? `email-thread::${it.threadId}`
        : `${it.source}::${it.id}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push(it);
    }
    return out;
  };
  const runBulkAction = async (kind: BulkKind, items: UnifiedItem[]) => {
    if (items.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    const targets = dedupeForBulk(items);
    const results = await Promise.allSettled(targets.map((it) => runOneBulk(it, kind)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    qc.invalidateQueries({ queryKey: ["/api/contact"] });
    invalidateEmailLists();
    if (fail === 0) {
      toast({ title: t("inboxBulkAllSucceeded"), description: `${ok}` });
    } else if (ok === 0) {
      toast({ title: t("inboxBulkAllFailed"), description: `${fail}`, variant: "destructive" });
    } else {
      toast({ title: t("inboxBulkPartial"), description: `${ok} ✓ · ${fail} ✗`, variant: "destructive" });
    }
    setSelectedKeys(new Set());
    setSelectMode(false);
    setBulkRunning(false);
  };

  // Apply a bulk action to all members of a thread, with optional undo toast.
  const performThreadAction = async (
    items: UnifiedItem[],
    kind: BulkKind,
    successTitle: string,
    failTitle: string,
    undoKind?: BulkKind,
    undoTitle?: string,
    undoFailTitle?: string,
  ) => {
    if (items.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    const targets = dedupeForBulk(items);
    const results = await Promise.allSettled(targets.map((it) => runOneBulk(it, kind)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    qc.invalidateQueries({ queryKey: ["/api/contact"] });
    invalidateEmailLists();
    if (fail === 0) {
      if (undoKind) {
        undoToast(successTitle, () => {
          performThreadAction(
            items,
            undoKind,
            undoTitle || successTitle,
            undoFailTitle || failTitle,
          );
        });
      } else {
        toast({ title: successTitle });
      }
    } else if (ok === 0) {
      toast({ title: failTitle, variant: "destructive" });
    } else {
      toast({ title: t("inboxBulkPartial"), description: `${ok} ✓ · ${fail} ✗`, variant: "destructive" });
    }
    setBulkRunning(false);
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
      qc.invalidateQueries({ queryKey: ["/api/admin/emails/threads", "infinite"] });
      // Refresh "Replied" badges everywhere and the per-message thread for
      // the selected item so the new reply appears immediately. Email items
      // are keyed by Gmail threadId so the entire conversation gets marked.
      qc.invalidateQueries({ queryKey: ["/api/admin/reply-examples/refs"] });
      if (selected) {
        // Use a prefix-style invalidation (predicate) so any per-message
        // history query for this conversation is refreshed regardless of
        // its trailing legacyMessageId cache segment.
        qc.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey;
            return Array.isArray(key)
              && key[0] === "/api/admin/reply-examples/by-ref"
              && key[1] === selected.source
              && key[2] === replyRefForItem(selected);
          },
        });
      }
    },
    onError: (err: unknown) =>
      toast({ title: t("error"), description: err instanceof Error ? err.message : t("failedToSendReply"), variant: "destructive" }),
  });

  function extractUrls(text: string): string[] {
    const re = /https?:\/\/[^\s"'<>)\]]+/gi;
    const matches = text.match(re) ?? [];
    return Array.from(new Set(matches.map((u) => u.replace(/[.,;:!?]+$/, ""))));
  }

  async function handleSendClick(item: UnifiedItem) {
    const urls = extractUrls(replyText);
    // Always send rawText so the backend can scan for bare-domain blocklist hits
    // (e.g. "babybanzgemach.com/apply" without an http:// prefix).
    if (urls.length === 0) {
      // Still check raw text for blocklisted bare domains even if no http:// URLs present.
      setLinkCheckPending(true);
      try {
        const res = await apiRequest("POST", "/api/admin/check-urls", { urls: [], rawText: replyText });
        const data: { results: { url: string; ok: boolean; reason?: string }[] } = await res.json();
        const broken = (data.results ?? []).filter((r) => !r.ok);
        if (broken.length > 0) {
          setBrokenLinkWarning({ links: broken, item });
        } else {
          sendReplyMutation.mutate(item);
        }
      } catch {
        sendReplyMutation.mutate(item);
      } finally {
        setLinkCheckPending(false);
      }
      return;
    }
    setLinkCheckPending(true);
    try {
      const res = await apiRequest("POST", "/api/admin/check-urls", { urls, rawText: replyText });
      const data: { results: { url: string; ok: boolean; reason?: string }[] } = await res.json();
      const broken = (data.results ?? []).filter((r) => !r.ok);
      if (broken.length > 0) {
        setBrokenLinkWarning({ links: broken, item });
      } else {
        sendReplyMutation.mutate(item);
      }
    } catch {
      sendReplyMutation.mutate(item);
    } finally {
      setLinkCheckPending(false);
    }
  }

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
    setSaveEmailBannerDismissed(false);
    setSaveEmailLocationId("");
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
      setSelected({ ...item, isRead: true });
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

  // Toggle read state for the whole conversation.
  const toggleReadStatus = (item: UnifiedItem) => {
    const newIsRead = !item.isRead;
    const members = groupMembersFor(item);
    const targets = dedupeForBulk(members);
    const calls = targets.map((m) =>
      runOneBulk(m, newIsRead ? "markRead" : "markUnread")
    );
    Promise.allSettled(calls).then((results) => {
      qc.invalidateQueries({ queryKey: ["/api/contact"] });
      invalidateEmailLists();
      const fail = results.filter((r) => r.status === "rejected").length;
      if (fail > 0) {
        toast({
          title: newIsRead ? t("error") : t("inboxUnreadFailed"),
          variant: "destructive",
        });
      }
      setSelected({ ...item, isRead: newIsRead });
    });
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
  // Resolve the full conversation members for the selected message
  // against the unfiltered thread map so detail-view actions
  // (spam/restore/mark-read) act on EVERY sibling — even when the
  // current folder/search/unread filter hides them.
  const currentItems: UnifiedItem[] = groupMembersFor(selected);

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
              {/* Spam / Not spam toggle — applied to the whole thread so
                  older siblings move with the latest message. */}
              {selected.isSpam || folder === "spam" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    performThreadAction(
                      currentItems,
                      "notSpam",
                      t("inboxNotSpamSuccess"),
                      t("inboxNotSpamFailed"),
                    );
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
                    performThreadAction(
                      currentItems,
                      "spam",
                      t("inboxSpamSuccess"),
                      t("inboxSpamFailed"),
                      "notSpam",
                      t("inboxNotSpamSuccess"),
                      t("inboxNotSpamFailed"),
                    );
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
                    performThreadAction(
                      currentItems,
                      "restore",
                      t("inboxRestoreSuccess"),
                      t("inboxRestoreFailed"),
                    );
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

          {/* "Save email to profile" banner — shown when the sender is not a known
              operator email but their message mentions "gemach", hinting they
              might be an operator writing from an unrecognised address. */}
          {(() => {
            const senderEmail = selected.fromEmail?.toLowerCase().trim() ?? "";
            const isKnownOperator = senderEmail && operatorEmailSet.has(senderEmail);
            const mentionsGemach = /gemach|gema[cç]h|גמ[״"']?ח/i.test(selected.body + " " + selected.subject);
            if (isKnownOperator || !mentionsGemach || saveEmailBannerDismissed) return null;
            const availableLocations = (locationsQuery.data ?? []).filter((l) => l.email !== selected.fromEmail);
            return (
              <div
                className="mb-4 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 flex flex-col gap-2"
                data-testid="banner-save-email-to-profile"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 shrink-0" />
                    Possible gemach operator
                  </div>
                  <button
                    type="button"
                    className="text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
                    onClick={() => setSaveEmailBannerDismissed(true)}
                    aria-label="Dismiss"
                    data-testid="button-dismiss-save-email-banner"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-blue-800/90 dark:text-blue-200/90">
                  This sender mentions a gemach but isn't linked to any location profile. You can save their email to a location so they'll be recognised as an operator in future.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={saveEmailLocationId} onValueChange={setSaveEmailLocationId}>
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[200px] flex-1" data-testid="select-save-email-location">
                      <SelectValue placeholder="Select a location…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLocations.map((loc) => (
                        <SelectItem key={loc.id} value={String(loc.id)}>
                          {loc.name} · {loc.locationCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 text-xs"
                    disabled={!saveEmailLocationId || saveEmailPending}
                    data-testid="button-save-email-to-profile"
                    onClick={async () => {
                      if (!saveEmailLocationId || !selected.fromEmail) return;
                      setSaveEmailPending(true);
                      try {
                        await apiRequest("PATCH", `/api/locations/${saveEmailLocationId}`, { email: selected.fromEmail });
                        qc.invalidateQueries({ queryKey: ["/api/locations"] });
                        toast({ title: "Email saved", description: `${selected.fromEmail} linked to location profile.` });
                        setSaveEmailBannerDismissed(true);
                      } catch (e) {
                        toast({ title: "Error", description: e instanceof Error ? e.message : "Could not save email", variant: "destructive" });
                      } finally {
                        setSaveEmailPending(false);
                      }
                    }}
                  >
                    {saveEmailPending ? "Saving…" : "Save to profile"}
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Gmail-style transcript: every message in this conversation
              (inbound + our outbound replies) rendered oldest → newest.
              Falls back to the single selected message if the thread fetch
              fails. The translate-message button still acts on the latest
              inbound message body to keep parity with the prior single-card
              behavior. */}
          <ThreadTranscriptPanel
            selected={selected}
            folder={folder}
            t={t}
            translatedBody={translatedBody}
            onTranslateLatestInbound={handleTranslateMessage}
            isTranslating={translateMutation.isPending}
            uiTarget={uiTarget}
          />

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
                  onClick={() => handleSendClick(selected)}
                  disabled={!replyText.trim() || sendReplyMutation.isPending || linkCheckPending}
                  data-testid="button-send-reply"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendReplyMutation.isPending ? t("sending") : linkCheckPending ? "Checking links…" : t("sendReply")}
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

          <AlertDialog open={brokenLinkWarning !== null} onOpenChange={(o) => !o && setBrokenLinkWarning(null)}>
            <AlertDialogContent data-testid="dialog-broken-link-warning">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Potentially broken link detected
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>The following link{(brokenLinkWarning?.links.length ?? 0) > 1 ? "s" : ""} in your reply could not be verified:</p>
                    <ul className="space-y-1">
                      {(brokenLinkWarning?.links ?? []).map(({ url, reason }) => (
                        <li key={url} className="flex flex-col gap-0.5 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                          <span className="break-all font-mono text-xs text-foreground">{url}</span>
                          {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground">You can go back to fix the link, or send the reply anyway.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-broken-link-go-back">Go back to edit</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-broken-link-send-anyway"
                  onClick={() => {
                    const itemToSend = brokenLinkWarning?.item;
                    setBrokenLinkWarning(null);
                    if (itemToSend) sendReplyMutation.mutate(itemToSend);
                  }}
                >
                  Send anyway
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
    <>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <InboxIcon className="h-8 w-8" />
              {t("inboxTitle")}
            </h1>
            <p className="text-muted-foreground">{t("inboxSubtitle")}</p>
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
            const gmailCounts = gmailLabelCountsQuery.data ?? { inbox: 0, sent: 0, spam: 0, trash: 0 };
            return [
              { key: "inbox" as Folder, label: t("inboxFolderInbox"), icon: InboxIcon, count: formInboxCount + gmailCounts.inbox },
              { key: "sent" as Folder, label: t("inboxFolderSent"), icon: Send, count: gmailCounts.sent },
              { key: "spam" as Folder, label: t("inboxFolderSpam"), icon: ShieldAlert, count: formSpamCount + gmailCounts.spam },
              { key: "trash" as Folder, label: t("inboxFolderTrash"), icon: Trash2, count: formTrashCount + gmailCounts.trash },
            ];
          })().map(({ key, label, icon: Icon, count }) => {
            const active = folder === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleFolderChange(key)}
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
        </div>

        {/* Search + source/read filters in one always-visible compact row. */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("inboxSearchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <div className="flex gap-2 flex-wrap items-center" data-testid="filters-secondary">
              {/* Source filter */}
              {folder !== "sent" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">{t("inboxFilterSourceLabel")}</span>
                  <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                    <SelectTrigger className="h-8 text-sm w-[110px]" data-testid="filter-source-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="filter-source-all">{t("msgAll")}</SelectItem>
                      <SelectItem value="email" data-testid="filter-source-email">{t("inboxSourceEmail")}</SelectItem>
                      <SelectItem value="form" data-testid="filter-source-form">{t("inboxSourceForm")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Read/unread status filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">{t("inboxFilterStatusLabel")}</span>
                <Select value={readFilter} onValueChange={(v) => setReadFilter(v as ReadFilter)}>
                  <SelectTrigger className="h-8 text-sm w-[110px]" data-testid="filter-read-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="filter-read-all">{t("msgAll")}</SelectItem>
                    <SelectItem value="unread" data-testid="filter-read-unread">{t("unread")}</SelectItem>
                    <SelectItem value="read" data-testid="filter-read-read">{t("read")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Reply-state filter */}
              {folder !== "sent" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">{t("inboxFilterReplyLabel")}</span>
                  <Select value={replyFilter} onValueChange={(v) => setReplyFilter(v as ReplyFilter)}>
                    <SelectTrigger className="h-8 text-sm w-[110px]" data-testid="filter-reply-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="filter-reply-all">{t("msgAll")}</SelectItem>
                      <SelectItem value="unreplied" data-testid="filter-reply-unreplied">{t("inboxFilterUnreplied")}</SelectItem>
                      <SelectItem value="replied" data-testid="filter-reply-replied">{t("inboxFilterReplied")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(folder !== "inbox" || sourceFilter !== "all" || readFilter !== "all" || replyFilter !== "all" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Reset every persisted filter dimension so the admin
                    // returns to the default view (Inbox / All / All / All
                    // / empty search) in one click. The persist effect
                    // mirrors these defaults to localStorage immediately.
                    setFolder("inbox");
                    setSourceFilter("all");
                    setReadFilter("all");
                    setReplyFilter("all");
                    setSearch("");
                  }}
                  data-testid="button-clear-filters"
                >
                  {t("inboxClearFilters")}
                </Button>
              )}
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant={selectMode ? "default" : "outline"}
                size="sm"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                data-testid="button-toggle-select-mode"
                disabled={bulkRunning}
              >
                {selectMode ? (
                  <><X className="h-4 w-4 mr-1.5" />{t("inboxBulkExit")}</>
                ) : (
                  <><CheckSquare className="h-4 w-4 mr-1.5" />{t("inboxBulkSelect")}</>
                )}
              </Button>
            </div>
          </div>
          {!selectMode && (
            <p className="text-xs text-muted-foreground italic" data-testid="text-swipe-hint">
              {t("inboxSwipeHint")}
            </p>
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
            ) : threadGroups.length === 0 ? (
              <div className="p-12 text-center">
                {folder === "sent" ? (
                  <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                ) : (
                  <InboxIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                )}
                <h3 className="text-lg font-medium">
                  {folder === "sent"
                    ? t("inboxSentEmpty")
                    : folder === "spam"
                    ? t("inboxSpamEmpty")
                    : folder === "trash"
                    ? t("inboxTrashEmpty")
                    : t("inboxEmpty")}
                </h3>
                <p className="text-muted-foreground">{t("inboxEmptyDesc")}</p>
              </div>
            ) : (
              <div className="divide-y">
                {threadGroups.map((g) => {
                  // One row per conversation; latest message is the preview.
                  const it = g.latest;
                  const isThreadUnread = g.unreadCount > 0;
                  // Treat the row as outbound when the Sent folder is active OR when the
                  // latest message carries the SENT Gmail label (e.g. a replied thread
                  // still sitting in the Inbox). Used for avatar/name/icon rendering.
                  const isSentRow = folder === "sent" || !!(it.labels?.includes("SENT"));
                  // Use canonical (unfiltered) members so hidden siblings move with the row.
                  const canonicalMembers = groupMembersFor(it);
                  const rightAction =
                    folder === "trash"
                      ? {
                          label: t("inboxDetailRestore"),
                          icon: Undo2,
                          color: "bg-blue-500",
                          onCommit: () =>
                            performThreadAction(
                              canonicalMembers,
                              "restore",
                              t("inboxRestoreSuccess"),
                              t("inboxRestoreFailed"),
                            ),
                        }
                      : {
                          label: t("inboxSwipeMarkUnread"),
                          icon: EyeOff,
                          color: "bg-blue-500",
                          onCommit: () =>
                            performThreadAction(
                              canonicalMembers,
                              "markUnread",
                              t("inboxUnreadSuccess"),
                              t("inboxUnreadFailed"),
                            ),
                        };
                  const leftAction =
                    folder === "inbox"
                      ? {
                          label: t("inboxSwipeArchive"),
                          icon: Archive,
                          color: "bg-gray-500",
                          // Archive's inverse is `unarchive` (not `restore`/untrash).
                          onCommit: () =>
                            performThreadAction(
                              canonicalMembers,
                              "archive",
                              t("inboxArchiveSuccess"),
                              t("inboxArchiveFailed"),
                              "unarchive",
                              t("inboxRestoreSuccess"),
                              t("inboxRestoreFailed"),
                            ),
                        }
                      : undefined;
                  const leftLongAction =
                    folder === "trash"
                      ? undefined
                      : {
                          label: t("inboxSwipeDelete"),
                          icon: Trash2,
                          color: "bg-red-600",
                          onCommit: () =>
                            performThreadAction(
                              canonicalMembers,
                              "trash",
                              t("inboxTrashSuccess"),
                              t("inboxTrashFailed"),
                              // Only emails support untrash; contacts are hard-deleted. Use explicit `untrash` so undo is unambiguous regardless of folder.
                              canonicalMembers.every((m) => m.source === "email") ? "untrash" : undefined,
                              t("inboxRestoreSuccess"),
                              t("inboxRestoreFailed"),
                            ),
                        };
                  const isChecked = selectedKeys.has(it.key);
                  return (
                    <SwipeableRow
                      key={g.key}
                      testId={`row-${it.key}`}
                      rightAction={rightAction}
                      leftAction={leftAction}
                      leftLongAction={leftLongAction}
                      // Disable swipe gestures while in select mode so the
                      // checkbox click target isn't fighting drag handlers.
                      disabled={selectMode}
                    >
                      <button
                        type="button"
                        onClick={() => (selectMode ? toggleRowSelection(it.key) : openItem(it))}
                        className={`w-full p-4 text-left hover-elevate active-elevate-2 transition-colors flex items-start gap-3 ${
                          isThreadUnread ? "bg-primary/10 dark:bg-primary/15" : ""
                        } ${selectMode && isChecked ? "bg-primary/20" : ""}`}
                        data-testid={`row-${it.key}-button`}
                        data-unread={isThreadUnread ? "true" : "false"}
                        aria-pressed={selectMode ? isChecked : undefined}
                      >
                        {selectMode && (
                          // Visual-only checkbox — the outer <button> handles
                          // clicks so we suppress pointer events here to avoid
                          // nesting an interactive control inside a button.
                          <div
                            className="flex items-center pt-1 flex-shrink-0 pointer-events-none"
                            data-testid={`row-${it.key}-checkbox`}
                            aria-hidden="true"
                          >
                            <Checkbox checked={isChecked} tabIndex={-1} />
                          </div>
                        )}
                        {/* Read/unread accent bar — first thing the eye lands
                            on. Bold primary color for unread; invisible spacer
                            for read so list rows still align. */}
                        <div
                          className={`self-stretch w-1 rounded-full flex-shrink-0 ${
                            isThreadUnread ? "bg-primary" : "bg-transparent"
                          }`}
                          aria-hidden="true"
                        />
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ${
                            isThreadUnread ? "bg-primary" : "bg-muted-foreground/60"
                          }`}
                        >
                          {(() => {
                            const toName = isSentRow && it.toAddress
                              ? parseEmailAddress(it.toAddress).name
                              : null;
                            return (isSentRow ? (toName || it.toAddress || "?") : (it.fromName || "?")).charAt(0).toUpperCase();
                          })()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {isSentRow && (
                                <span className="text-xs text-muted-foreground flex-shrink-0">To:</span>
                              )}
                              <span
                                className={`truncate ${isThreadUnread ? "font-bold text-foreground" : "font-normal text-muted-foreground"}`}
                                title={isSentRow && it.toAddress ? it.toAddress : undefined}
                              >
                                {isSentRow
                                  ? (() => {
                                      if (!it.toAddress) return it.fromName;
                                      const p = parseEmailAddress(it.toAddress);
                                      // Show the email address (not just display-name local-part)
                                      // so the recipient is unambiguous at a glance.
                                      return p.email || p.name;
                                    })()
                                  : it.fromName}
                              </span>
                              {/* "N messages" pill — only shown when this row
                                  represents more than one message. Mirrors the
                                  Gmail thread-count chip and is the main visible
                                  payoff of the inbox-grouping change. */}
                              {g.messageCount > 1 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] py-0 h-5 flex-shrink-0 font-medium tabular-nums"
                                  data-testid={`badge-thread-count-${it.key}`}
                                  title={t("inboxThreadCountMany").replace("{count}", String(g.messageCount))}
                                >
                                  {g.messageCount}
                                </Badge>
                              )}
                              {/* Quiet outline-style source marker. For outbound
                                  rows (Sent folder or SENT-labelled latest message)
                                  we swap the Mail icon for a Send icon to signal
                                  outbound direction clearly. */}
                              <span
                                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/80 flex-shrink-0"
                                title={isSentRow ? t("inboxFolderSent") : it.source === "email" ? t("inboxSourceEmail") : t("inboxSourceForm")}
                                data-testid={`source-tag-${it.source}`}
                              >
                                {isSentRow
                                  ? <Send className="h-3 w-3" />
                                  : it.source === "email"
                                  ? <Mail className="h-3 w-3" />
                                  : <MessageSquare className="h-3 w-3" />}
                                <span className="hidden sm:inline">
                                  {isSentRow ? t("inboxFolderSent") : it.source === "email" ? t("inboxSourceEmail") : t("inboxSourceForm")}
                                </span>
                              </span>
                              {(() => {
                                // Skip the badge in Spam/Trash folders so the
                                // list there isn't visually noisy; replied
                                // state is still visible in the detail view.
                                if (folder === "spam" || folder === "trash") return null;
                                const repliedAt = lookupRepliedForGroup(g);
                                if (repliedAt === null) return null;
                                const dateLabel = repliedAt ? formatDate(repliedAt) : "";
                                return (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 h-5 flex-shrink-0 border-green-600 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700 font-semibold gap-1"
                                    data-testid={`badge-replied-${it.key}`}
                                    title={dateLabel ? t("inboxRepliedOn").replace("{date}", dateLabel) : t("inboxReplied")}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>{t("inboxReplied")}</span>
                                    {dateLabel && (
                                      <span className="font-normal opacity-80">· {dateLabel}</span>
                                    )}
                                  </Badge>
                                );
                              })()}
                              {it.source === "form" && it.isSpam && (
                                <Badge variant="outline" className="text-[10px] py-0 h-5 flex-shrink-0 border-amber-500 text-amber-700 dark:text-amber-300">
                                  <ShieldAlert className="h-3 w-3 mr-1" />
                                  {t("inboxFolderSpam")}
                                </Badge>
                              )}
                              {it.fromEmail && operatorEmailSet.has(it.fromEmail.toLowerCase().trim()) && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] py-0 h-5 flex-shrink-0 border-purple-500 bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-600 font-semibold gap-1"
                                  data-testid={`badge-operator-${it.key}`}
                                  title="This sender is a registered gemach operator"
                                >
                                  <Building2 className="h-3 w-3" />
                                  <span>Operator</span>
                                </Badge>
                              )}
                            </div>
                            <span className={`text-xs whitespace-nowrap ${isThreadUnread ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{formatDate(it.date)}</span>
                          </div>
                          <p className={`text-sm truncate ${isThreadUnread ? "font-semibold text-foreground" : "font-normal text-muted-foreground"}`}>
                            {it.subject || t("noSubject")}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-1">{it.snippet}</p>
                        </div>
                        {isThreadUnread && <div className="w-2.5 h-2.5 rounded-full bg-primary mt-2 flex-shrink-0 ring-2 ring-primary/30" />}
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

        {/* Bulk-action bar — fixed to the bottom of the viewport while in
            select mode. Shows the selection count, a Select-all toggle, and
            folder-aware action buttons. The padding spacer above the bar
            (h-24) prevents the last list row from being obscured. */}
        {selectMode && (
          <>
            <div className="h-24" aria-hidden />
            <div
              className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
              data-testid="bulk-action-bar"
              role="toolbar"
              aria-label="Bulk actions"
            >
              <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 mr-auto">
                  <Checkbox
                    checked={allVisibleSelected && threadGroups.length > 0}
                    onCheckedChange={() => toggleSelectAll()}
                    data-testid="checkbox-select-all"
                    aria-label={t("inboxBulkSelectAll")}
                  />
                  <span className="text-sm font-medium" data-testid="text-bulk-count">
                    {selectedItems.length} {t("inboxBulkSelectedCount")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectAll}
                    disabled={threadGroups.length === 0 || bulkRunning}
                    data-testid="button-bulk-select-all"
                  >
                    {t("inboxBulkSelectAll")}
                  </Button>
                </div>
                {folder !== "trash" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulkAction("markRead", selectedThreadMembers)}
                    disabled={selectedItems.length === 0 || bulkRunning}
                    data-testid="button-bulk-mark-read"
                  >
                    <Eye className="h-4 w-4 mr-1.5" />
                    {t("inboxBulkMarkRead")}
                  </Button>
                )}
                {folder === "inbox" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulkAction("archive", selectedThreadMembers)}
                    disabled={selectedItems.length === 0 || bulkRunning}
                    data-testid="button-bulk-archive"
                  >
                    <Archive className="h-4 w-4 mr-1.5" />
                    {t("inboxBulkArchive")}
                  </Button>
                )}
                {folder === "inbox" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulkAction("spam", selectedThreadMembers)}
                    disabled={selectedItems.length === 0 || bulkRunning}
                    data-testid="button-bulk-spam"
                  >
                    <ShieldAlert className="h-4 w-4 mr-1.5" />
                    {t("inboxBulkReportSpam")}
                  </Button>
                )}
                {folder === "spam" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulkAction("notSpam", selectedThreadMembers)}
                    disabled={selectedItems.length === 0 || bulkRunning}
                    data-testid="button-bulk-not-spam"
                  >
                    <ShieldCheck className="h-4 w-4 mr-1.5" />
                    {t("inboxBulkNotSpam")}
                  </Button>
                )}
                {folder === "trash" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runBulkAction("restore", selectedThreadMembers)}
                    disabled={selectedItems.length === 0 || bulkRunning}
                    data-testid="button-bulk-restore"
                  >
                    <Undo2 className="h-4 w-4 mr-1.5" />
                    {t("inboxBulkRestore")}
                  </Button>
                )}
                {folder !== "trash" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => runBulkAction("trash", selectedThreadMembers)}
                    disabled={selectedItems.length === 0 || bulkRunning}
                    data-testid="button-bulk-trash"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    {bulkRunning ? t("inboxBulkRunning") : t("inboxBulkTrash")}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
    </>
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

// Unified Gmail-style transcript for the inbox detail view. Shows EVERY
// message in the conversation (inbound + our outbound replies) oldest →
// newest, replacing the old "single message + sent-replies dropdown"
// layout. The selected message is auto-expanded; older messages are
// collapsed behind a one-line summary the admin can click to expand.
// On Gmail-fetch failure we fall back to the single selected-message
// body so the detail view always renders something.
function ThreadTranscriptPanel({
  selected,
  folder,
  t,
  translatedBody,
  onTranslateLatestInbound,
  isTranslating,
  uiTarget,
}: {
  selected: UnifiedItem;
  folder: Folder;
  t: (k: TranslationKey) => string;
  translatedBody: string | null;
  onTranslateLatestInbound: () => void;
  isTranslating: boolean;
  uiTarget: "en" | "he";
}) {
  const isSentView = folder === "sent";
  // Per-entry translations for older inbound messages (latest uses parent state).
  const [entryTranslations, setEntryTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const translateEntryMutation = useMutation({
    mutationFn: async ({ text, target }: { text: string; target: "en" | "he" }) => {
      const res = await apiRequest("POST", `/api/admin/inbox/translate`, { text, target });
      return (await res.json()).translated as string;
    },
  });
  const { toast } = useToast();
  const handleTranslateEntry = async (entry: ThreadEntry) => {
    if (entryTranslations[entry.id]) {
      setEntryTranslations((p) => {
        const next = { ...p };
        delete next[entry.id];
        return next;
      });
      return;
    }
    setTranslatingId(entry.id);
    try {
      const out = await translateEntryMutation.mutateAsync({ text: entry.body, target: uiTarget });
      setEntryTranslations((p) => ({ ...p, [entry.id]: out }));
    } catch (e) {
      toast({ title: "Translate failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setTranslatingId(null);
    }
  };
  const ref = selected.source === "email"
    ? String(selected.threadId || selected.id)
    : String(selected.id);
  const query = useQuery<ThreadResponse>({
    queryKey: ["/api/admin/inbox/thread", selected.source, ref],
    queryFn: async () => {
      const params = new URLSearchParams({ source: selected.source, ref });
      const res = await fetch(`/api/admin/inbox/thread?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load conversation");
      return res.json();
    },
  });

  // Fallback when the thread fetch is loading or failed. In the Sent view
  // the selected row represents an outbound message, so seed the fallback
  // entry as outbound with `to` populated from selected.toAddress so the
  // header still renders "To: …" correctly while the thread fetch is
  // in flight.
  const fallbackEntry: ThreadEntry = useMemo(() => ({
    id: `${selected.source}:${selected.id}`,
    direction: isSentView ? "outbound" : "inbound",
    from: selected.fromEmail
      ? `${selected.fromName} <${selected.fromEmail}>`
      : selected.fromName,
    to: isSentView ? selected.toAddress : undefined,
    subject: selected.subject,
    body: selected.body,
    date: safeDate(selected.date),
    isRead: selected.isRead,
    source: selected.source === "email" ? "gmail" : "form",
    messageRef: String(selected.id),
  }), [selected, isSentView]);

  const messages: ThreadEntry[] = query.data?.messages?.length
    ? query.data.messages
    : [fallbackEntry];

  // The clicked-into message; always expanded by default.
  const currentRef = String(selected.id);
  const isCurrent = (m: ThreadEntry) => {
    if (selected.source === "email") return m.source === "gmail" && m.messageRef === currentRef;
    return m.source === "form" && m.messageRef === currentRef;
  };
  const latestIdx = messages.length - 1;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isExpanded = (m: ThreadEntry, idx: number) => {
    if (m.id in expanded) return expanded[m.id];
    return isCurrent(m) || idx === latestIdx;
  };
  const toggle = (id: string, current: boolean) =>
    setExpanded((p) => ({ ...p, [id]: !current }));

  // Latest outbound date, if any (drives the "Replied {date}" badge).
  const repliedAt = useMemo(() => {
    const outbound = messages.filter((m) => m.direction === "outbound");
    if (!outbound.length) return null;
    return outbound[outbound.length - 1].date;
  }, [messages]);

  return (
    <Card className="mb-6" data-testid="panel-thread-transcript">
      <CardHeader>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-xl truncate" data-testid="text-thread-subject">
                {selected.subject || t("noSubject")}
              </CardTitle>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] py-0 h-5 font-medium tabular-nums" data-testid="badge-thread-message-count">
                  {messages.length === 1
                    ? t("inboxThreadCountSingle")
                    : t("inboxThreadCountMany").replace("{count}", String(messages.length))}
                </Badge>
                {query.isLoading && (
                  <span className="text-xs text-muted-foreground" data-testid="text-thread-loading">
                    {t("inboxLoadingThread")}
                  </span>
                )}
                {query.isError && (
                  <span className="text-xs text-amber-700 dark:text-amber-300" data-testid="text-thread-error">
                    {t("inboxThreadLoadFailed")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {repliedAt && (
                <Badge
                  variant="outline"
                  className="border-green-600 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700 font-semibold"
                  data-testid="badge-replied-detail"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  {t("inboxRepliedOn").replace("{date}", formatDate(repliedAt))}
                </Badge>
              )}
              <span
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"
                data-testid={`source-tag-detail-${selected.source}`}
              >
                {selected.source === "email"
                  ? <Mail className="h-3.5 w-3.5" />
                  : <MessageSquare className="h-3.5 w-3.5" />}
                {selected.source === "email" ? t("inboxSourceEmail") : t("inboxSourceForm")}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 1 && !query.isLoading && (
          <div className="text-xs text-muted-foreground italic" data-testid="text-thread-only-message">
            {t("inboxThreadOnlyMessage")}
          </div>
        )}
        {messages.map((m, idx) => {
          const open = isExpanded(m, idx);
          // Treat any message in the Sent view as outbound for header
          // rendering, even if direction is missing/inbound on a fallback
          // entry — the Sent folder only ever lists outbound threads.
          const outbound = m.direction === "outbound" || isSentView;
          // Translate is offered on every inbound entry.
          const showTranslate = !outbound;
          const isLatestInbound = isCurrent(m);
          const entryTranslated = isLatestInbound
            ? translatedBody
            : entryTranslations[m.id] ?? null;
          const isThisTranslating = isLatestInbound
            ? isTranslating
            : translatingId === m.id;
          const body = showTranslate && entryTranslated ? entryTranslated : m.body;
          return (
            <div
              key={m.id}
              className={`rounded-md border ${
                outbound
                  ? "bg-blue-50/60 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900"
                  : "bg-muted/20 border-border"
              } ${isCurrent(m) ? "ring-1 ring-primary/50" : ""}`}
              data-testid={`thread-entry-${m.id}`}
            >
              <button
                type="button"
                onClick={() => toggle(m.id, open)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover-elevate"
                data-testid={`thread-entry-toggle-${m.id}`}
                aria-expanded={open}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 h-5 uppercase tracking-wide ${
                      outbound
                        ? "border-blue-600 text-blue-800 dark:text-blue-300"
                        : "border-muted-foreground/40 text-muted-foreground"
                    }`}
                    data-testid={`thread-entry-direction-${m.id}`}
                  >
                    {outbound ? t("inboxThreadOutbound") : t("inboxThreadInbound")}
                  </Badge>
                  {outbound ? (
                    <>
                      <span className="text-xs text-muted-foreground flex-shrink-0">To:</span>
                      <span
                        className="font-medium truncate text-sm"
                        title={m.to || undefined}
                        data-testid={`thread-entry-to-${m.id}`}
                      >
                        {(() => {
                          if (!m.to) return m.from || "—";
                          const p = parseEmailAddress(m.to);
                          return p.email || p.name || m.to;
                        })()}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium truncate text-sm" data-testid={`thread-entry-from-${m.id}`}>
                      {m.from || "—"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span data-testid={`thread-entry-date-${m.id}`}>{formatDate(m.date)}</span>
                  {open
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </button>
              {open && (
                <div className="px-3 pb-3" data-testid={`thread-entry-body-${m.id}`}>
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
                  />
                  {showTranslate && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => isLatestInbound ? onTranslateLatestInbound() : handleTranslateEntry(m)}
                        disabled={isThisTranslating}
                        data-testid={isLatestInbound ? "button-translate-message" : `button-translate-entry-${m.id}`}
                      >
                        <Languages className="h-4 w-4 mr-2" />
                        {entryTranslated ? t("inboxShowOriginal") : t("inboxTranslate")}
                      </Button>
                      {entryTranslated && (
                        <span className="text-xs text-muted-foreground">{t("inboxTranslated")}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
