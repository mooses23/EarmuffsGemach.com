import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  type SourceFilter,
  type ReadFilter,
  type ReplyFilter,
  type Folder,
  type GmailEmail,
  type EmailsResponse,
  type UnifiedItem,
  type InboxThread,
  type BulkKind,
} from "./inbox/types";
import { InboxDetailView } from "./inbox/InboxDetailView";
import {
  parseEmailAddress,
  formatDate,
  safeDate,
  groupKey,
} from "./inbox/utils";
import { useInboxFilters } from "./inbox/useInboxFilters";
import { useInboxKeyboardShortcuts } from "./inbox/useKeyboardShortcuts";
import { ShortcutsHelp } from "./inbox/ShortcutsHelp";
import { SmsInboxView } from "./inbox/SmsInboxView";
import { Brain } from "lucide-react";
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
  Eye,
  EyeOff,
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

export default function AdminInbox() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<UnifiedItem | null>(null);
  // ===== Focus management =====
  // When the admin opens a thread we move keyboard focus into the detail
  // pane (the Back button) so keyboard/screen-reader users land in the new
  // context. When they close it we restore focus to the row that opened it
  // so j/k navigation continues from the same position.
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastOpenedRowKeyRef = useRef<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const handleToolbarKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = toolbarRef.current;
    if (!el) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      el.scrollBy({ left: 120, behavior: "smooth" });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      el.scrollBy({ left: -120, behavior: "smooth" });
    }
  }, []);
  useEffect(() => {
    if (selected) {
      // Defer to the next tick so the detail pane has actually mounted.
      const id = window.setTimeout(() => backButtonRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    if (lastOpenedRowKeyRef.current) {
      const key = lastOpenedRowKeyRef.current;
      const id = window.setTimeout(() => {
        document.querySelector<HTMLButtonElement>(`[data-testid="row-${key}-button"]`)?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [selected]);
  // All filter state lives in the dedicated hook — it reads localStorage
  // exactly once on mount, debounces the search input, and mirrors changes
  // back to storage. The handler on folder change resets secondary filters
  // so stale state from one folder doesn't yield a confusingly-empty list
  // elsewhere; entering Sent pins source="email" (no form submissions exist).
  const filters = useInboxFilters();
  const {
    folder,
    setFolder: handleFolderChange,
    sourceFilter,
    setSourceFilter,
    readFilter,
    setReadFilter,
    replyFilter,
    setReplyFilter,
    search,
    setSearch,
    debouncedSearch,
    clearAll: clearAllFilters,
  } = filters;
  // Help-overlay (?) and search-input ref (used by "/" keyboard shortcut).
    const [helpOpen, setHelpOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [glossaryOpen, setGlossaryOpen] = useState(false);
    // Bulk-select mode lets the admin tick multiple rows and apply a single
    // batch action (Archive / Trash / Report-spam / Mark read) instead of
    // swiping each row individually.
    const [selectMode, setSelectMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
    const [bulkRunning, setBulkRunning] = useState(false);
      const [editSubject, setEditSubject] = useState("");
  const [editMessage, setEditMessage] = useState("");
  // Mixed-thread trash guard (Problem O): when a thread contains form-contact
  // members, trashing hard-deletes them permanently. Pending action is stored
  // here so the confirmation dialog can re-run it after the user confirms.
  const [pendingMixedTrash, setPendingMixedTrash] = useState<{
    items: UnifiedItem[];
    successTitle: string;
    failTitle: string;
  } | null>(null);
  const [threadExpandedMap, setThreadExpandedMap] = useState<Record<string, Record<string, boolean>>>({});

  // Gmail config status
  const gmailStatusQuery = useQuery<{ configured: boolean; environment: string; message: string }>({
    queryKey: ["/api/admin/emails/status"],
  });

  // Combined unread counts (Gmail unread threads + unread form submissions)
  // per folder. Drives the folder chips so the badge represents actionable
  // work (unread items) rather than total backlog. Polled every 15s while
  // the tab is visible so a new email/form submission incrementing a chip
  // surfaces without a manual refresh.
  const inboxCountsQuery = useQuery<{ inbox: number; sent: number; spam: number; trash: number; smsUnread?: number; whatsappUnread?: number }>({
    queryKey: ["/api/admin/inbox/counts"],
    // 30 s aligns with the SMS list/thread polling cadence so all inbox
    // signals refresh on the same heartbeat.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const smsUnread = inboxCountsQuery.data?.smsUnread ?? 0;
  const whatsappUnread = inboxCountsQuery.data?.whatsappUnread ?? 0;
  // True when the user picked the unified "SMS / WhatsApp" source. In that
  // mode we hand the entire list+detail area over to SmsInboxView (which
  // manages its own All/SMS/WhatsApp channel chips internally) and bypass
  // the email/form rendering pipeline below.
  const isSmsView = filters.sourceFilter === "sms";

  // When the user pivots into SMS/WhatsApp, drop any email/form selection so
  // the early `if (selected) return …` detail view doesn't intercept the
  // render below and hide the SMS pane.
  useEffect(() => {
    if (isSmsView && selected) setSelected(null);
  }, [isSmsView, selected]);

  // Contacts query — `debouncedSearch` is part of the cache key so each
  // search term gets its own server round-trip (server-side ILIKE-style
  // filter on name/email/subject/message). Polled every 15s for live
  // updates; pauses when the tab is hidden.
  const contactsQuery = useQuery<Contact[]>({
    queryKey: ["/api/contact", debouncedSearch],
    queryFn: async ({ queryKey }) => {
      const q = (queryKey[1] as string) || "";
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const url = params.toString() ? `/api/contact?${params.toString()}` : "/api/contact";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        let message = "Failed to load contacts";
        try { message = (await res.json()).message || message; } catch {}
        throw new Error(message);
      }
      return res.json();
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
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
    // Gmail SENT label — thread already has an outbound reply even if the
    // admin sent it directly in Gmail rather than through this UI, meaning
    // no reply_example row exists for it. Treat the presence of the SENT
    // label as "replied, date unknown" so the Unreplied filter never shows
    // a thread the admin has already handled.
    if (item.source === "email" && item.labels?.includes("SENT")) return "";
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
  // `debouncedSearch` is part of the cache key so each search term hits a
  // distinct cache; the value is forwarded to Gmail as a `q` parameter
  // (server-side search across every message in every thread, not just the
  // ones we've loaded). Polled every 15s while the tab is visible so a new
  // email arriving in Gmail appears without a manual refresh — react-query
  // re-fetches the loaded pages in place, preserving scroll/selection.
  const emailQueries = useInfiniteQuery<EmailsResponse>({
    queryKey: ["/api/admin/emails/threads", "infinite", folder, debouncedSearch],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, queryKey }) => {
      const search = (queryKey[3] as string) || "";
      const params = new URLSearchParams({ maxResults: "25", mode: folder });
      if (typeof pageParam === "string" && pageParam) {
        params.set("pageToken", pageParam);
      }
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/emails/threads?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        let message = "Failed to load emails";
        try { message = (await res.json()).message || message; } catch {}
        throw new Error(message);
      }
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const invalidateEmailLists = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/emails/threads", "infinite"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/inbox/counts"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inbox/counts"] }),
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
        isRead: c.isRead === true,   // treat null (pre-migration rows) as unread
        isArchived: c.isArchived === true,
        isSpam: c.isSpam === true,
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
      });
    }
    // Primary sort: newest first. For NaN dates (should never happen after
    // safeDate) treat as epoch=0 so they sink to the bottom rather than
    // distorting the order. Stable tiebreaker: when dates are equal (common
    // when two sources land at the same second), compare IDs as strings with
    // localeCompare so Gmail string IDs ("18fda…") and numeric contact IDs
    // both produce a stable, deterministic order instead of both mapping to 0.
    return list.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      const da = isNaN(ta) ? 0 : ta;
      const db = isNaN(tb) ? 0 : tb;
      if (db !== da) return db - da;
      // Cross-source: put form contacts before emails when dates are equal so
      // the list is deterministic even when mixing sources. Within same source,
      // lexicographic descending ID comparison keeps high IDs (= newer) first.
      if (a.source !== b.source) return a.source === "form" ? -1 : 1;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [contactsQuery.data, allEmails]);

  // Folder filter for form contacts. Gmail messages already arrive pre-filtered
  // by the server based on the `mode` query param, so we don't filter them here.
  //
  // Inbox rule for form contacts: only non-archived, non-spam submissions appear
  // in the inbox. Spam-tagged contacts live exclusively in the Spam folder so
  // the admin's mental model matches Gmail and other inbox clients. Archiving
  // (trash / isArchived=true) is the intentional action that moves a row to Trash.
  //
  // Defensive: isArchived and isSpam are stored as booleans (notNull default
  // false) but the unified builder already normalises them with === true so
  // null/undefined values from pre-migration rows can never sneak through.
  const folderFiltered = unified.filter((it) => {
    if (it.source === "form") {
      // Form submissions have no "Sent" equivalent — exclude them entirely.
      if (folder === "sent") return false;
      // Inbox: non-archived, non-spam submissions only. Spam-flagged contacts
      // belong exclusively in the Spam folder (not a dual-display) so the inbox
      // stays clean and the admin's mental model matches every other inbox client.
      if (folder === "inbox") return it.isArchived !== true && it.isSpam !== true;
      // Spam: dedicated review queue — spam-tagged, not yet trashed.
      if (folder === "spam") return it.isSpam === true && it.isArchived !== true;
      // Trash: only explicitly archived rows.
      if (folder === "trash") return it.isArchived === true;
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
  // read/replied filters at the THREAD level. Search is applied SERVER-SIDE:
  // the email infinite query forwards the term to Gmail as `q` (so a token
  // in any message in any thread surfaces, including threads we haven't
  // loaded yet), and the contacts query forwards the term to /api/contact?q
  // (case-insensitive substring across name/email/subject/message). Both
  // sources merge through the `unified` builder above, so the rendered
  // thread groups are already pre-filtered by the search term.
  const threadGroups: InboxThread[] = useMemo(() => {
    const allGroups = buildGroups(filtered);
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
      return true;
    });
    // `repliedRefMap` is the underlying data source `lookupRepliedForGroup`
    // reads from. Including it in deps ensures the visible list recomputes
    // when the replied-refs query loads or refreshes — without it, an admin
    // who switches to "Needs reply" before the refs query resolves would see
    // stale results until another listed dep changed.
  }, [filtered, readFilter, replyFilter, repliedRefMap]);

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


  // ===== Optimistic-update helpers (Task #185) =====
  // Both helpers follow the standard React-Query optimistic pattern:
  //   1) cancel in-flight refetches so they can't clobber the optimistic state
  //   2) snapshot current cache so onError can roll back
  //   3) mutate the cache so the UI updates instantly
  //   4) onError restores the snapshot
  //   5) onSettled invalidates so server truth eventually wins
  // Prefix keys — the actual cache keys also include the active folder and
  // (for emails) the debounced search term, so we use prefix-style
  // cancel/setQueriesData calls so optimistic patches hit every cached
  // variant (e.g. inbox + spam + the with-search and without-search caches
  // a user has visited in this session).
  const EMAIL_THREADS_KEY = ["/api/admin/emails/threads", "infinite"] as const;
  const CONTACT_KEY = ["/api/contact"] as const;

  // Snapshot of all cache entries that matched a prefix before an
  // optimistic patch was applied. Used by onError handlers to roll every
  // patched variant back to its pre-mutation value.
  type CacheSnapshot<T> = Array<{ key: readonly unknown[]; data: T | undefined }>;
  const restoreSnapshot = <T,>(snap: CacheSnapshot<T>) => {
    for (const { key, data } of snap) qc.setQueryData(key as unknown as readonly unknown[], data);
  };

  // Patch (or remove) a single Gmail email across every page of EVERY
  // cached infinite-query variant. `patch` returns the new email or null
  // to drop it.
  const patchEmailCache = async (
    id: string,
    patch: (e: GmailEmail) => GmailEmail | null,
  ): Promise<CacheSnapshot<{ pages: EmailsResponse[] }>> => {
    await qc.cancelQueries({ queryKey: EMAIL_THREADS_KEY });
    const snap: CacheSnapshot<{ pages: EmailsResponse[] }> = qc
      .getQueriesData<{ pages: EmailsResponse[] }>({ queryKey: EMAIL_THREADS_KEY })
      .map(([key, data]) => ({ key, data }));
    qc.setQueriesData<{ pages: EmailsResponse[] }>({ queryKey: EMAIL_THREADS_KEY }, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p) => {
          const list = p.threads ?? p.emails ?? [];
          const next: GmailEmail[] = [];
          for (const e of list) {
            if (e.id === id) {
              const patched = patch(e);
              if (patched) next.push(patched);
            } else next.push(e);
          }
          return p.threads ? { ...p, threads: next } : { ...p, emails: next };
        }),
      };
    });
    return snap;
  };
  const patchContactCache = async (
    id: number,
    patch: (c: Contact) => Contact | null,
  ): Promise<CacheSnapshot<Contact[]>> => {
    await qc.cancelQueries({ queryKey: CONTACT_KEY });
    const snap: CacheSnapshot<Contact[]> = qc
      .getQueriesData<Contact[]>({ queryKey: CONTACT_KEY })
      .map(([key, data]) => ({ key, data }));
    qc.setQueriesData<Contact[]>({ queryKey: CONTACT_KEY }, (old) => {
      if (!old) return old;
      const next: Contact[] = [];
      for (const c of old) {
        if (c.id === id) {
          const patched = patch(c);
          if (patched) next.push(patched);
        } else next.push(c);
      }
      return next;
    });
    return snap;
  };

  // Mutations
  const markEmailRead = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/read`),
    onMutate: async (id: string) => ({
      prev: await patchEmailCache(id, (e) => ({ ...e, isRead: true, unreadCount: 0 })),
    }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const markContactRead = useMutation({
    mutationFn: async ({ id, isRead }: { id: number; isRead: boolean }) =>
      apiRequest("PATCH", `/api/contact/${id}`, { isRead }),
    onMutate: async ({ id, isRead }) => ({
      prev: await patchContactCache(id, (c) => ({ ...c, isRead })),
    }),
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CONTACT_KEY }),
  });

  // ===== Folder/spam/archive/trash mutations (emails + contacts) =====
  // Each destructive email mutation removes the row from the current cached
  // list immediately (so the inbox feels snappy on slow networks) and rolls
  // back if the server rejects.
  const optimisticRemoveEmail = (id: string) => patchEmailCache(id, () => null);

  const markEmailUnread = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/unread`),
    onMutate: async (id: string) => ({
      prev: await patchEmailCache(id, (e) => ({ ...e, isRead: false, unreadCount: Math.max(1, e.unreadCount ?? 1) })),
    }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const archiveEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/archive`),
    onMutate: async (id: string) => ({ prev: await optimisticRemoveEmail(id) }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const trashEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/trash`),
    onMutate: async (id: string) => ({ prev: await optimisticRemoveEmail(id) }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const untrashEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/untrash`),
    onMutate: async (id: string) => ({ prev: await optimisticRemoveEmail(id) }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const unarchiveEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/unarchive`),
    onMutate: async (id: string) => ({ prev: await optimisticRemoveEmail(id) }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const spamEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/spam`),
    onMutate: async (id: string) => ({ prev: await optimisticRemoveEmail(id) }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const notSpamEmailMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/emails/${id}/not-spam`),
    onMutate: async (id: string) => ({ prev: await optimisticRemoveEmail(id) }),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => invalidateEmailLists(),
  });
  const updateContactFlags = useMutation({
    mutationFn: async ({ id, ...flags }: { id: number; isRead?: boolean; isArchived?: boolean; isSpam?: boolean }) =>
      apiRequest("PATCH", `/api/contact/${id}`, flags),
    onMutate: async (vars) => {
      // Archive (isArchived=true) removes the contact from inbox immediately.
      // Spam (isSpam=true) keeps the contact in cache (updates its isSpam flag)
      // so it still appears in the Spam folder. The inbox folderFiltered already
      // excludes spam-flagged contacts (isSpam !== true), so the row disappears
      // from the inbox list on next render without a separate cache removal.
      const removes = vars.isArchived === true;
      const prev = await patchContactCache(vars.id, (c) => {
        if (removes) return null;
        const next: Contact = { ...c };
        if (vars.isRead !== undefined) next.isRead = vars.isRead;
        if (vars.isArchived !== undefined) next.isArchived = vars.isArchived;
        if (vars.isSpam !== undefined) next.isSpam = vars.isSpam;
        return next;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) restoreSnapshot(ctx.prev);
    },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: CONTACT_KEY }),
      qc.invalidateQueries({ queryKey: ["/api/admin/inbox/counts"] }),
    ]),
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
  // BulkKind is now defined in ./inbox/types and imported at the top.
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
  const openItem = (item: UnifiedItem) => {
      // Remember which row the admin opened so we can restore focus to it
      // when the detail pane closes (a11y: keyboard nav continues smoothly).
      lastOpenedRowKeyRef.current = item.key;
      // Optimistically flip isRead before the request resolves so the detail
      // header / row state updates instantly. The mutation invalidates the
      // list query on success, reconciling the optimistic state with the
      // server snapshot. On failure the next refetch reverts the row.
      const optimistic = item.isRead ? item : { ...item, isRead: true };
      setSelected(optimistic);
      if (!item.isRead) {
        if (item.source === "email") {
          markEmailRead.mutate(String(item.id), {
            onSuccess: () => invalidateEmailLists(),
          });
        } else {
          markContactRead.mutate({ id: Number(item.id), isRead: true });
        }
      }
    };;

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

    // ===== List virtualization =====
  // useWindowVirtualizer mounts only the rows currently in the viewport (plus
  // a small overscan). On a typical inbox with hundreds of threads this keeps
  // scroll smooth and prevents every row from re-rendering on cache updates.
  // We measure each row dynamically because thread rows have variable height
  // (subjects wrap, badges/preview lines toggle).
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useWindowVirtualizer({
    count: threadGroups.length,
    estimateSize: () => 88,
    overscan: 6,
    // Offset from the top of the document — needed for window-virtualizer to
    // line up scrollTop with row offsets.
    scrollMargin: listContainerRef.current?.offsetTop ?? 0,
  });

  // ===== Keyboard navigation =====
  // Tracks the cursor position in the visible list. Falls back to 0 when
  // the user has not yet pressed j/k or when the list re-orders.
  const [cursorIndex, setCursorIndex] = useState<number>(-1);
  // Reset cursor when the visible list changes shape (folder/filter).
  useEffect(() => {
    setCursorIndex(-1);
  }, [folder, sourceFilter, readFilter, replyFilter, debouncedSearch]);
  // aria-live announcement for assistive tech (status badges + counts).
  const [liveMessage, setLiveMessage] = useState<string>("");
  useEffect(() => {
    setLiveMessage(`Showing ${threadGroups.length} ${threadGroups.length === 1 ? "conversation" : "conversations"}`);
  }, [threadGroups.length]);

  useInboxKeyboardShortcuts({
    onMoveDown: () => {
      if (selected) return;
      setCursorIndex((i) => Math.min(threadGroups.length - 1, (i < 0 ? -1 : i) + 1));
    },
    onMoveUp: () => {
      if (selected) return;
      setCursorIndex((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
    },
    onOpen: () => {
      if (selected) return;
      const idx = cursorIndex;
      if (idx >= 0 && idx < threadGroups.length) openItem(threadGroups[idx].latest);
    },
    onArchive: () => {
      const target = selected ?? (cursorIndex >= 0 ? threadGroups[cursorIndex]?.latest : undefined);
      if (!target || folder !== "inbox") return;
      const members = groupMembersFor(target);
      performThreadAction(members, "archive", t("inboxArchiveSuccess"), t("inboxArchiveFailed"), "unarchive", t("inboxRestoreSuccess"), t("inboxRestoreFailed"));
      if (selected) setSelected(null);
    },
    onTrash: () => {
      const target = selected ?? (cursorIndex >= 0 ? threadGroups[cursorIndex]?.latest : undefined);
      if (!target || folder === "trash") return;
      const members = groupMembersFor(target);
      const hasFormMember = members.some((m) => m.source === "form");
      const hasEmailMember = members.some((m) => m.source === "email");
      if (hasFormMember && hasEmailMember) {
        setPendingMixedTrash({
          items: members,
          successTitle: t("inboxTrashSuccess"),
          failTitle: t("inboxTrashFailed"),
        });
      } else {
        performThreadAction(members, "trash", t("inboxTrashSuccess"), t("inboxTrashFailed"), members.every((m) => m.source === "email") ? "untrash" : undefined, t("inboxRestoreSuccess"), t("inboxRestoreFailed"));
      }
      if (selected) setSelected(null);
    },
    onSpam: () => {
      const target = selected ?? (cursorIndex >= 0 ? threadGroups[cursorIndex]?.latest : undefined);
      if (!target || folder === "spam") return;
      const members = groupMembersFor(target);
      performThreadAction(members, "spam", t("inboxSpamSuccess"), t("inboxSpamFailed"), "notSpam", t("inboxNotSpamSuccess"), t("inboxNotSpamFailed"));
      if (selected) setSelected(null);
    },
    onReply: () => {
      if (selected) {
        // Focus the reply textarea
        const ta = document.querySelector<HTMLTextAreaElement>('[data-testid="textarea-reply-body"]');
        ta?.focus();
        return;
      }
      if (cursorIndex >= 0 && cursorIndex < threadGroups.length) openItem(threadGroups[cursorIndex].latest);
    },
    onToggleRead: () => {
      const target = selected ?? (cursorIndex >= 0 ? threadGroups[cursorIndex]?.latest : undefined);
      if (target) toggleReadStatus(target);
    },
    onFocusSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onToggleSelect: () => {
      if (selected) return;
      if (selectMode) exitSelectMode(); else setSelectMode(true);
    },
    onShowHelp: () => setHelpOpen(true),
    onEscape: () => {
      if (helpOpen) setHelpOpen(false);
      else if (selected) setSelected(null);
      else if (selectMode) exitSelectMode();
    },
  });

  // ============ DETAIL VIEW ============
    // key={selected.key} causes React to unmount + remount InboxDetailView
    // whenever the selected item changes, which auto-resets all per-keystroke
    // state owned by InboxDetailView — no manual state resets needed here.
    const currentItems: UnifiedItem[] = groupMembersFor(selected);

    if (selected) {
      return (
        <InboxDetailView
          key={selected.key}
          selected={selected}
          setSelected={setSelected}
          folder={folder}
          t={t}
          backButtonRef={backButtonRef}
          currentItems={currentItems}
          performThreadAction={performThreadAction}
          isMarkReadPending={markEmailRead.isPending || markContactRead.isPending}
          onToggleRead={() => toggleReadStatus(selected)}
          deletePending={deleteContact.isPending}
          onDelete={(id) => deleteContact.mutate(id)}
          operatorEmailSet={operatorEmailSet}
          locationsData={locationsQuery.data}
          threadExpandedMap={threadExpandedMap}
          setThreadExpandedMap={setThreadExpandedMap}
        />
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
        <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
        {/* Visually-hidden polite live region — announces filter/result
            changes for screen readers without disrupting sighted users. */}
        <div
          role="status"
          aria-live="polite"
          className="sr-only"
          data-testid="inbox-live-region"
        >
          {liveMessage}
        </div>
        <div className="mb-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-1">
              <InboxIcon className="h-8 w-8" />
              {t("inboxTitle")}
            </h1>
            <p className="text-muted-foreground">{t("inboxSubtitle")}</p>
          </div>
        </div>

        {/* Single horizontally-scrollable row: folder chips + AI Knowledge Base + Refresh.
            All items share one row so nothing wraps onto a second line on mobile.
            Counts come from /api/admin/inbox/counts (authoritative server-side unread
            counts) so each chip shows actionable work rather than total backlog. */}
        <div
          ref={toolbarRef}
          className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none"
          role="toolbar"
          aria-label="Inbox folders and actions"
          onKeyDown={handleToolbarKeyDown}
        >
          {(() => {
            const counts = inboxCountsQuery.data ?? { inbox: 0, sent: 0, spam: 0, trash: 0 };
            return [
              { key: "inbox" as Folder, label: t("inboxFolderInbox"), icon: InboxIcon, count: counts.inbox },
              { key: "sent" as Folder, label: t("inboxFolderSent"), icon: Send, count: counts.sent },
              { key: "spam" as Folder, label: t("inboxFolderSpam"), icon: ShieldAlert, count: counts.spam },
              { key: "trash" as Folder, label: t("inboxFolderTrash"), icon: Trash2, count: counts.trash },
            ];
          })().map(({ key, label, icon: Icon, count }) => {
            const active = folder === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleFolderChange(key)}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground hover-elevate"
                }`}
                data-testid={`tab-folder-${key}`}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{label}</span>
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
          <div className="w-px h-5 bg-border shrink-0 mx-0.5" />
          <Dialog open={glossaryOpen} onOpenChange={setGlossaryOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                data-testid="button-open-glossary"
                aria-label="AI Knowledge Base"
                title="AI Knowledge Base"
              >
                <Brain className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI Knowledge Base
                </DialogTitle>
                <DialogDescription>
                  Edit the facts and FAQ answers the AI uses when drafting replies in this inbox.
                </DialogDescription>
              </DialogHeader>
              <GlossaryContent />
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 w-8 p-0"
            onClick={handleRefresh}
            disabled={emailQueries.isFetching}
            data-testid="button-refresh"
            aria-label={t("refresh")}
            title={t("refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${emailQueries.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Search + source/read filters in one always-visible compact row. */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder={t("inboxSearchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
                aria-label={t("inboxSearchPlaceholder")}
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
                      <SelectItem value="sms" data-testid="filter-source-sms">
                        {t("inboxSourceSmsWhatsapp")}
                        {smsUnread + whatsappUnread > 0 ? ` (${smsUnread + whatsappUnread})` : ""}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Read/unread status filter — hidden in SMS mode, where the
                  SMS view has its own All/SMS/WhatsApp + Inbox/Archived
                  chips rather than the read/reply axes. */}
              {!isSmsView && (
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
              )}
              {/* Reply-state filter — also hidden in SMS mode. */}
              {!isSmsView && folder !== "sent" && (
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
                  onClick={clearAllFilters}
                  data-testid="button-clear-filters"
                >
                  {t("inboxClearFilters")}
                </Button>
              )}
              {/* Bulk-select and swipe-hint are email/form affordances; the
                  SMS view has its own per-conversation actions instead. */}
              {!isSmsView && (
                <>
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
                </>
              )}
            </div>
          </div>
          {!selectMode && !isSmsView && (
            <p className="text-xs text-muted-foreground italic" data-testid="text-swipe-hint">
              {t("inboxSwipeHint")}
            </p>
          )}
        </div>

        {isSmsView && (
          <SmsInboxView
            smsUnread={smsUnread}
            whatsappUnread={whatsappUnread}
          />
        )}
        {!isSmsView && (<>
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
              (() => {
                // Highest-priority empty state: Gmail isn't connected at all,
                // so there's nothing the admin can do until they fix the
                // connection. Surface that explicitly above the bland copy.
                if (gmailNotConfigured) {
                  return (
                    <div className="p-12 text-center" data-testid="empty-state-gmail-not-configured">
                      <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                      <h3 className="text-lg font-medium">Gmail isn't connected</h3>
                      <p className="text-muted-foreground max-w-md mx-auto">
                        Connect Gmail to start receiving and replying to email from this inbox.
                      </p>
                    </div>
                  );
                }
                // Distinct empty states. When the user has narrowed with
                // filters/search we surface a different message + a "clear
                // filters" CTA instead of the bland generic empty copy.
                const hasNarrowed = !!(debouncedSearch.trim() || sourceFilter !== "all" || readFilter !== "all" || replyFilter !== "all");
                if (hasNarrowed) {
                  return (
                    <div className="p-12 text-center" data-testid="empty-state-no-results">
                      <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">No results match your filters</h3>
                      <p className="text-muted-foreground">Try clearing the filters or searching for a different term.</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={clearAllFilters} data-testid="button-empty-clear-filters">
                        {t("inboxClearFilters")}
                      </Button>
                    </div>
                  );
                }
                const map: Record<Folder, { icon: typeof InboxIcon; title: string; desc: string }> = {
                  inbox: { icon: InboxIcon, title: t("inboxEmpty"), desc: t("inboxEmptyDesc") },
                  sent: { icon: Send, title: t("inboxSentEmpty"), desc: "Replies you send will appear here." },
                  spam: { icon: ShieldAlert, title: t("inboxSpamEmpty"), desc: "Spam-flagged messages land here so you can review them." },
                  trash: { icon: Trash2, title: t("inboxTrashEmpty"), desc: "Trashed messages stay here until permanently deleted." },
                };
                const { icon: Icon, title, desc } = map[folder];
                return (
                  <div className="p-12 text-center" data-testid={`empty-state-${folder}`}>
                    <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">{title}</h3>
                    <p className="text-muted-foreground">{desc}</p>
                  </div>
                );
              })()
            ) : (
              <div
                ref={listContainerRef}
                role="list"
                data-testid="inbox-list"
                className="relative"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const gIdx = virtualRow.index;
                  const g = threadGroups[gIdx];
                  // One row per conversation; latest message is the preview.
                  const it = g.latest;
                  const isThreadUnread = g.unreadCount > 0;
                  // Treat the row as outbound when the Sent folder is active OR when the
                  // latest message carries the SENT Gmail label (e.g. a replied thread
                  // still sitting in the Inbox). Used for avatar/name/icon rendering.
                  const isSentRow = folder === "sent" || !!(it.labels?.includes("SENT"));
                  // Use canonical (unfiltered) members so hidden siblings move with the row.
                  const canonicalMembers = groupMembersFor(it);
                  // Swipe direction conventions (matches Gmail / iOS Mail):
                  //   Right swipe (short) → Archive  (primary, reversible)
                  //   Right swipe (trash folder) → Restore
                  //   Left swipe (short)  → Trash (destructive)
                  //   Left swipe (long)   → Mark Unread
                  // Sent folder gets no swipe actions (no archive / trash from Sent).
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
                      : folder === "inbox" || folder === "spam"
                      ? {
                          label: t("inboxSwipeArchive"),
                          icon: Archive,
                          color: "bg-gray-500",
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
                  // Left (short): Trash — shown in all folders except Trash and Sent.
                  // Guard: threads with form-contact members hard-delete permanently,
                  // so route them through the mixed-thread confirmation dialog.
                  const leftAction =
                    folder === "trash" || folder === "sent"
                      ? undefined
                      : {
                          label: t("inboxSwipeDelete"),
                          icon: Trash2,
                          color: "bg-red-600",
                          onCommit: () => {
                            const hasFormMember = canonicalMembers.some((m) => m.source === "form");
                            const hasEmailMember = canonicalMembers.some((m) => m.source === "email");
                            if (hasFormMember && hasEmailMember) {
                              // Mixed thread — warn before hard-deleting form contacts.
                              setPendingMixedTrash({
                                items: canonicalMembers,
                                successTitle: t("inboxTrashSuccess"),
                                failTitle: t("inboxTrashFailed"),
                              });
                              return;
                            }
                            performThreadAction(
                              canonicalMembers,
                              "trash",
                              t("inboxTrashSuccess"),
                              t("inboxTrashFailed"),
                              canonicalMembers.every((m) => m.source === "email") ? "untrash" : undefined,
                              t("inboxRestoreSuccess"),
                              t("inboxRestoreFailed"),
                            );
                          },
                        };
                  // Left (long): Mark Unread — secondary, available everywhere except Trash.
                  const leftLongAction =
                    folder === "trash"
                      ? undefined
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
                  const isChecked = selectedKeys.has(it.key);
                  const isCursor = cursorIndex === gIdx;
                  return (
                    <div
                      key={g.key}
                      data-index={gIdx}
                      ref={rowVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full border-b"
                      style={{
                        transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                      }}
                    >
                    <SwipeableRow
                      testId={`row-${it.key}`}
                      rightAction={rightAction}
                      leftAction={leftAction}
                      leftLongAction={leftLongAction}
                      // Disable swipe gestures while in select mode so the
                      // checkbox click target isn't fighting drag handlers.
                      disabled={selectMode}
                    >
                      <div role="listitem">
                      <button
                        type="button"
                        onClick={() => (selectMode ? toggleRowSelection(it.key) : openItem(it))}
                        className={`w-full p-4 text-left hover-elevate active-elevate-2 transition-colors flex items-start gap-3 ${
                          isThreadUnread ? "bg-primary/10 dark:bg-primary/15" : ""
                        } ${selectMode && isChecked ? "bg-primary/20" : ""} ${
                          isCursor ? "ring-2 ring-inset ring-primary/60" : ""
                        }`}
                        data-testid={`row-${it.key}-button`}
                        data-unread={isThreadUnread ? "true" : "false"}
                        data-cursor={isCursor ? "true" : undefined}
                        aria-pressed={selectMode ? isChecked : undefined}
                        aria-label={`${isSentRow ? "Sent to" : "From"} ${it.fromName || it.toAddress || "Unknown"}: ${it.subject || "(no subject)"}${isThreadUnread ? ", unread" : ""}`}
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
                      </div>
                    </SwipeableRow>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {emailQueries.hasNextPage && (
          <div className="flex flex-col items-center gap-1 mt-4">
            <Button variant="outline" onClick={handleLoadMore} disabled={emailQueries.isFetchingNextPage} data-testid="button-load-more">
              {emailQueries.isFetchingNextPage
                ? <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : <ChevronDown className="h-4 w-4 mr-2" />}
              {t("inboxLoadMore")}
            </Button>
            {/* Page indicator: show how many threads are currently loaded
                compared to total known threads (if the server reports a count).
                Helps the admin gauge how far down the list they've scrolled. */}
            {(() => {
              const loaded = allEmails.length;
              if (!loaded) return null;
              const estimate = emailQueries.data?.pages?.[0]?.resultSizeEstimate;
              const showTotal = typeof estimate === "number" && estimate > loaded;
              return (
                <p className="text-xs text-muted-foreground" data-testid="text-load-more-count">
                  {showTotal ? `${loaded} loaded · ~${estimate} total` : `${loaded} loaded · more available`}
                </p>
              );
            })()}
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

          {/* Mixed-thread trash guard — rendered at parent level so it persists
              even after setSelected(null) closes the detail view (e.g. keyboard
              shortcut 't' while viewing a thread). */}
          <AlertDialog open={pendingMixedTrash !== null} onOpenChange={(o) => !o && setPendingMixedTrash(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  {t("inboxMixedTrashTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("inboxMixedTrashDesc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPendingMixedTrash(null)}>
                  {t("cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (!pendingMixedTrash) return;
                    const { items, successTitle, failTitle } = pendingMixedTrash;
                    setPendingMixedTrash(null);
                    performThreadAction(
                      items,
                      "trash",
                      successTitle,
                      failTitle,
                      items.every((m) => m.source === "email") ? "untrash" : undefined,
                      t("inboxRestoreSuccess"),
                      t("inboxRestoreFailed"),
                    );
                  }}
                >
                  {t("inboxMixedTrashConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </>)}
    </>
  );
}

