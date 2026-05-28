import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useConversations, useConversationMessages, useTwilioWebhookUrls, type SmsChannel } from "./sms-hooks";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Send,
  Archive,
  ArchiveRestore,
  ShieldAlert,
  MessageSquare,
  Check,
  CheckCheck,
  AlertCircle,
  Search,
  HelpCircle,
  Wand2,
  Copy,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import type { Location, SmsConversation, SmsMessage } from "@shared/schema";
import type { TranslationKey } from "@/lib/translations";

// Sentinel used by the "Assign to gemach" <Select> for the "Unassigned"
// option. Radix <SelectItem> forbids an empty-string value, so we map
// this sentinel to `null` when sending to the API.
const ASSIGN_NONE = "__none__";

type Channel = SmsChannel;

interface Props {
  smsUnread: number;
  whatsappUnread: number;
}

// Self-contained SMS / WhatsApp inbox view. Lives inside the unified admin
// inbox but renders its own list + thread detail because the chat-bubble UX
// and per-conversation reply flow don't fit the email/form UnifiedItem model.
// Polls every 30 s (matching the email inbox cadence) so inbound replies
// surface without manual refresh.
export function SmsInboxView({ smsUnread, whatsappUnread }: Props) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<Channel>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [reply, setReply] = useState("");
  // Task #309: free-text search + "Unknown" triage filter. We debounce the
  // search input so each keystroke doesn't fire a request; 250 ms matches
  // the email inbox cadence and stays inside the "feels instant" window.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchInput), 250);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Reset thread selection (and any draft reply) when the user flips
  // channels, folders, or conversations. Without resetting `reply`, a draft
  // typed for conversation A could be accidentally sent to conversation B
  // after a switch — a material correctness issue for messaging.
  useEffect(() => { setSelectedId(null); setReply(""); }, [channel, showArchived]);
  useEffect(() => { setReply(""); }, [selectedId]);

  // Conversation list + selected thread are fetched via shared hooks so the
  // 30 s polling cadence, query-key shape, and error handling stay in one
  // place (and so other surfaces, e.g. a future contact-page sidebar, can
  // reuse them without duplicating fetch logic).
  const listQuery = useConversations(channel, showArchived ? "archived" : "inbox", {
    q: debouncedSearch,
    unlinkedOnly,
  });
  const threadQuery = useConversationMessages(selectedId);
  const webhookUrlsQuery = useTwilioWebhookUrls();

  const twilioStatusQuery = useQuery<{
    sms: { configured: boolean; reason?: string };
    whatsapp: { configured: boolean; reason?: string };
  }>({
    queryKey: ["/api/admin/twilio-status"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const twilioConfigured =
    twilioStatusQuery.data?.sms.configured ||
    twilioStatusQuery.data?.whatsapp.configured;

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  function copyUrl(url: string) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedUrl(url);
        setTimeout(() => setCopiedUrl(null), 2000);
      },
      () => {},
    );
  }

  // Locations list — used to populate the "Assign to gemach" dropdown and to
  // render the gemach name next to a resolved conversation. Cached
  // aggressively because the list rarely changes.
  const locationsQuery = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const locationsById = useMemo(() => {
    const m = new Map<number, Location>();
    for (const l of locationsQuery.data ?? []) m.set(l.id, l);
    return m;
  }, [locationsQuery.data]);

  const assignMutation = useMutation({
    mutationFn: async ({ id, locationId }: { id: number; locationId: number | null }) =>
      apiRequest("PATCH", `/api/admin/sms/conversations/${id}/assign`, { locationId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/sms/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/sms/conversations", vars.id] });
      toast({ title: t("smsAssignedToast") });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("smsAssignFailedToast"), description: msg, variant: "destructive" });
    },
  });

  // Open + mark-as-read in one server round-trip (the PATCH endpoint accepts
  // markRead: true) so the unread badge in the source filter clears as soon
  // as the admin opens a conversation.
  const openConversation = (conv: SmsConversation) => {
    setSelectedId(conv.id);
    if (conv.unreadCount > 0) {
      apiRequest("PATCH", `/api/admin/sms/conversations/${conv.id}`, { markRead: true })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["/api/admin/sms/conversations"] });
          qc.invalidateQueries({ queryKey: ["/api/admin/inbox/counts"] });
        })
        .catch((e: unknown) => {
          // Surface failures so admins notice when unread state isn't
          // clearing — otherwise a backend regression could silently leave
          // the badge stuck and look like a UI bug.
          console.warn("[sms] markRead failed", e);
          const msg = e instanceof Error ? e.message : String(e);
          toast({
            title: t("smsMarkReadFailed"),
            description: msg,
            variant: "destructive",
          });
        });
    }
  };

  const archiveMutation = useMutation({
    mutationFn: async ({ id, isArchived }: { id: number; isArchived: boolean }) =>
      apiRequest("PATCH", `/api/admin/sms/conversations/${id}`, { isArchived }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/sms/conversations"] });
      // Archiving an unread thread changes the unread count, so refresh the
      // shared counts query immediately rather than waiting for its poll.
      qc.invalidateQueries({ queryKey: ["/api/admin/inbox/counts"] });
      toast({ title: vars.isArchived ? t("smsArchivedToast") : t("smsUnarchivedToast") });
      setSelectedId(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("error"), description: msg, variant: "destructive" });
    },
  });

  // Task #311: one-shot backfill — re-runs the phone resolver against every
  // older conversation that still has no displayName or locationId. The
  // server only fills still-null fields so manual assignments are preserved.
  const backfillNamesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sms/conversations/backfill-names", {});
      return (await res.json()) as { scanned: number; resolved: number; updated: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/sms/conversations"] });
      toast({
        title: t("smsBackfillDoneTitle"),
        description: t("smsBackfillDoneDesc")
          .replace("{scanned}", String(data.scanned))
          .replace("{updated}", String(data.updated)),
      });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("smsBackfillFailedToast"), description: msg, variant: "destructive" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) =>
      apiRequest("POST", `/api/admin/sms/conversations/${id}/reply`, { body }),
    onSuccess: (_data, vars) => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["/api/admin/sms/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/inbox/counts"] });
      // Refetch the active thread immediately so the newly sent bubble
      // appears without waiting for the 30 s poll tick.
      qc.invalidateQueries({ queryKey: ["/api/admin/sms/conversations", vars.id] });
      toast({ title: t("smsReplySentToast") });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("smsReplyFailedToast"), description: msg, variant: "destructive" });
    },
  });

  // Auto-scroll the thread to the bottom whenever a new message arrives,
  // matching the user expectation that the latest reply is always in view.
  useEffect(() => {
    if (threadQuery.data?.messages && threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [threadQuery.data?.messages?.length, selectedId]);

  const selectedConversation = threadQuery.data?.conversation
    ?? listQuery.data?.rows.find(r => r.id === selectedId)
    ?? null;

  const rows = listQuery.data?.rows ?? [];

  // ===== Channel chips (All / SMS / WhatsApp) + archived toggle =====
  const channelChips: { value: Channel; label: string; unread: number; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "all", label: t("smsChannelAll"), unread: smsUnread + whatsappUnread, Icon: MessageSquare },
    { value: "sms", label: t("smsChannelSms"), unread: smsUnread, Icon: MessageSquare },
    { value: "whatsapp", label: t("smsChannelWhatsapp"), unread: whatsappUnread, Icon: SiWhatsapp },
  ];
  const header = (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="flex items-center gap-1 rounded-full border bg-background p-0.5" role="tablist" aria-label={t("smsChannelChips")}>
        {channelChips.map(({ value, label, unread, Icon }) => {
          const active = channel === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setChannel(value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${
                active ? "bg-primary text-primary-foreground" : "text-foreground hover-elevate"
              }`}
              data-testid={`sms-channel-chip-${value}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              {unread > 0 && (
                <span
                  className={`ms-1 rounded-full px-1.5 text-[10px] font-medium ${
                    active ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                  data-testid={`sms-channel-chip-${value}-count`}
                >
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Button
        variant={showArchived ? "default" : "outline"}
        size="sm"
        onClick={() => setShowArchived(v => !v)}
        data-testid="sms-folder-toggle"
      >
        {showArchived ? <ArchiveRestore className="h-4 w-4 me-1.5" /> : <Archive className="h-4 w-4 me-1.5" />}
        {showArchived ? t("smsFolderArchived") : t("smsFolderInbox")}
      </Button>
      {/* Task #309: "Unknown" triage chip — narrows the list to conversations
          with no resolved displayName and no assigned location so an admin
          can quickly assign new numbers. */}
      <Button
        variant={unlinkedOnly ? "default" : "outline"}
        size="sm"
        onClick={() => setUnlinkedOnly(v => !v)}
        aria-pressed={unlinkedOnly}
        aria-label={t("smsFilterUnknownAria")}
        data-testid="sms-filter-unknown"
      >
        <HelpCircle className="h-4 w-4 me-1.5" />
        {t("smsFilterUnknown")}
      </Button>
      {/* Task #311: admin-triggered one-shot backfill that re-runs the phone
          resolver against older conversations created before auto-resolution
          shipped. Idempotent — safe to click more than once. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => backfillNamesMutation.mutate()}
        disabled={backfillNamesMutation.isPending}
        aria-label={t("smsBackfillNamesAria")}
        data-testid="sms-backfill-names"
      >
        <Wand2 className="h-4 w-4 me-1.5" />
        {backfillNamesMutation.isPending ? t("smsBackfillRunning") : t("smsBackfillNames")}
      </Button>
      {/* Task #309: search across phone, displayName, and joined location.name. */}
      <div className="relative ms-auto w-full sm:w-64">
        <Search className="absolute start-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("smsSearchPlaceholder")}
          aria-label={t("smsSearchAriaLabel")}
          className="ps-7 h-9"
          data-testid="sms-search-input"
        />
      </div>
    </div>
  );

  // ===== Thread detail view =====
  if (selectedId !== null && selectedConversation) {
    const isOptedOut = selectedConversation.isOptedOut;
    // Defensive client-side sort (oldest → newest) so the chat thread stays
    // chronological even if the backend ever returns messages in a different
    // order. Matches the "newest at bottom" UX assumption.
    const messages = [...(threadQuery.data?.messages ?? [])].sort((a, b) => {
      const at = a.sentAt instanceof Date ? a.sentAt.getTime() : new Date(a.sentAt as unknown as string).getTime();
      const bt = b.sentAt instanceof Date ? b.sentAt.getTime() : new Date(b.sentAt as unknown as string).getTime();
      return at - bt;
    });
    const ChannelIcon = selectedConversation.channel === "whatsapp" ? SiWhatsapp : MessageSquare;
    const title = selectedConversation.displayName || selectedConversation.phone;

    return (
      <div data-testid="sms-thread-detail">
        {header}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedId(null)}
            data-testid="sms-thread-back"
          >
            <ArrowLeft className="h-4 w-4 me-1.5" />
            {t("smsBackToList")}
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ChannelIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="font-medium truncate" data-testid="sms-thread-title">{title}</div>
              {selectedConversation.displayName && (
                <div className="text-xs text-muted-foreground truncate" dir="ltr">{selectedConversation.phone}</div>
              )}
            </div>
            {isOptedOut && (
              <Badge variant="destructive" className="ms-auto shrink-0" data-testid="sms-opted-out-badge">
                <ShieldAlert className="h-3 w-3 me-1" />
                {t("smsOptedOutBadge")}
              </Badge>
            )}
          </div>
          {/* Task #309: manual "Assign to gemach" selector. Lets the admin
              link an unrecognised number to a location so future messages
              from that phone land pre-attributed. Choosing "Unassigned"
              clears the link (e.g. after a mis-assignment). */}
          <Select
            value={selectedConversation.locationId !== null && selectedConversation.locationId !== undefined
              ? String(selectedConversation.locationId)
              : ASSIGN_NONE}
            onValueChange={(value) => {
              const next = value === ASSIGN_NONE ? null : parseInt(value, 10);
              const current = selectedConversation.locationId ?? null;
              if (next === current) return;
              assignMutation.mutate({ id: selectedConversation.id, locationId: next });
            }}
            disabled={assignMutation.isPending || locationsQuery.isLoading}
          >
            <SelectTrigger
              className="w-[180px] h-9"
              aria-label={t("smsAssignToLocation")}
              data-testid="sms-thread-assign-select"
            >
              <SelectValue placeholder={t("smsAssignToLocation")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ASSIGN_NONE} data-testid="sms-thread-assign-none">
                {t("smsAssignNone")}
              </SelectItem>
              {(locationsQuery.data ?? []).map((loc) => (
                <SelectItem key={loc.id} value={String(loc.id)} data-testid={`sms-thread-assign-${loc.id}`}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => archiveMutation.mutate({ id: selectedConversation.id, isArchived: !selectedConversation.isArchived })}
            disabled={archiveMutation.isPending}
            data-testid="sms-thread-archive-toggle"
          >
            {selectedConversation.isArchived ? <ArchiveRestore className="h-4 w-4 me-1.5" /> : <Archive className="h-4 w-4 me-1.5" />}
            {selectedConversation.isArchived ? t("smsUnarchiveAction") : t("smsArchiveAction")}
          </Button>
        </div>

        <div
          ref={threadScrollRef}
          className="border rounded-md bg-muted/30 p-3 h-[60vh] overflow-y-auto space-y-2"
          data-testid="sms-thread-messages"
        >
          {threadQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-3/4" />)}
            </div>
          ) : threadQuery.isError ? (
            <div
              className="flex flex-col items-center text-center text-sm text-destructive py-8 gap-2"
              data-testid="sms-thread-error"
            >
              <AlertCircle className="h-5 w-5" />
              <div>{(threadQuery.error as Error)?.message || t("smsReplyFailedToast")}</div>
              <Button size="sm" variant="outline" onClick={() => threadQuery.refetch()}>
                {t("smsRetry")}
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">{t("smsThreadEmpty")}</div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} language={language} />)
          )}
        </div>

        {/* Reply bar (or opted-out warning strip) */}
        {isOptedOut ? (
          <div
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2 text-sm"
            data-testid="sms-reply-disabled-notice"
          >
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">{t("smsOptedOutTitle")}</div>
              <div className="text-muted-foreground">{t("smsOptedOutDesc")}</div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2 items-end" data-testid="sms-reply-bar">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={selectedConversation.channel === "whatsapp" ? t("smsReplyPlaceholderWhatsapp") : t("smsReplyPlaceholderSms")}
              className="min-h-[60px] flex-1"
              maxLength={1600}
              data-testid="sms-reply-input"
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter sends — matches the email inbox shortcut.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && reply.trim().length > 0) {
                  e.preventDefault();
                  replyMutation.mutate({ id: selectedConversation.id, body: reply.trim() });
                }
              }}
            />
            <Button
              onClick={() => replyMutation.mutate({ id: selectedConversation.id, body: reply.trim() })}
              disabled={reply.trim().length === 0 || replyMutation.isPending}
              data-testid="sms-reply-send"
            >
              <Send className="h-4 w-4 me-1.5" />
              {t("smsReplySend")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ===== Conversation list =====
  return (
    <div data-testid="sms-inbox-list-view">
      {header}
      <div className="border rounded-md bg-background overflow-hidden">
        {listQuery.isLoading ? (
          <div className="divide-y">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-3 flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : listQuery.isError ? (
          <div
            className="p-10 text-center text-destructive flex flex-col items-center gap-2"
            data-testid="sms-list-error"
          >
            <AlertCircle className="h-8 w-8" />
            <div className="font-medium">{(listQuery.error as Error)?.message || t("smsReplyFailedToast")}</div>
            <Button size="sm" variant="outline" onClick={() => listQuery.refetch()}>
              {t("smsRetry")}
            </Button>
          </div>
        ) : rows.length === 0 && listQuery.data?.total === 0 && channel === "all" && !showArchived && !debouncedSearch && !unlinkedOnly ? (
          <div className="p-4 flex flex-col gap-4" data-testid="sms-empty-state">
            {twilioConfigured && webhookUrlsQuery.data ? (
              <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                  <div>
                    <div className="font-semibold text-foreground">Set up Twilio to receive messages</div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      Twilio credentials are configured. To receive inbound SMS and WhatsApp messages here,
                      register these two URLs in the{" "}
                      <a
                        href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-primary inline-flex items-center gap-0.5"
                      >
                        Twilio console
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      .
                    </div>
                  </div>
                </div>

                {!webhookUrlsQuery.data.isBaseUrlEnvSet && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>Note:</strong> The URLs below are based on the current request host because
                      {" "}<code className="text-xs font-mono">APP_URL</code> or{" "}
                      <code className="text-xs font-mono">SITE_URL</code> is not set. Set one of those
                      environment variables to your production domain so the URL is stable.
                    </span>
                  </div>
                )}

                <ol className="flex flex-col gap-3 text-sm">
                  <li className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">
                      1. Open your Twilio phone number → Messaging → "A message comes in" (Webhook)
                    </span>
                    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                      <span className="flex-1 select-all">{webhookUrlsQuery.data.inboundUrl}</span>
                      <button
                        type="button"
                        onClick={() => copyUrl(webhookUrlsQuery.data!.inboundUrl)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy inbound URL"
                      >
                        {copiedUrl === webhookUrlsQuery.data.inboundUrl ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">Method: HTTP POST</span>
                  </li>

                  <li className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">
                      2. In the same page → "Message status changes to" (Webhook)
                    </span>
                    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                      <span className="flex-1 select-all">{webhookUrlsQuery.data.statusCallbackUrl}</span>
                      <button
                        type="button"
                        onClick={() => copyUrl(webhookUrlsQuery.data!.statusCallbackUrl)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy status callback URL"
                      >
                        {copiedUrl === webhookUrlsQuery.data.statusCallbackUrl ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">Method: HTTP POST</span>
                  </li>

                  <li className="text-muted-foreground">
                    3. Save changes in the Twilio console, then send a test SMS or WhatsApp message to your Twilio
                    number — it will appear here within seconds.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="p-10 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <div className="font-medium text-foreground">{t("smsEmptyTitle")}</div>
                <div className="text-sm">{t("smsEmptyDesc")}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y" role="list">
            {rows.map((conv) => {
              const isUnread = conv.unreadCount > 0;
              const ChannelIcon = conv.channel === "whatsapp" ? SiWhatsapp : MessageSquare;
              const label = conv.displayName || conv.phone;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => openConversation(conv)}
                  // Use logical `text-start` (not `text-left`) so Hebrew/RTL
                  // aligns to the visual right. Expose unread state on the
                  // button itself so screen readers announce it.
                  className={`w-full text-start p-3 flex items-center gap-3 transition-colors hover-elevate ${
                    isUnread ? "bg-primary/5" : ""
                  }`}
                  data-testid={`sms-conv-row-${conv.id}`}
                  aria-label={`${label}${isUnread ? ` — ${t("unread")} (${conv.unreadCount})` : ""}`}
                >
                  <div className="relative shrink-0">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                      <ChannelIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {isUnread && (
                      <span
                        className="absolute -top-0.5 -end-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background"
                        data-testid={`sms-conv-row-${conv.id}-unread-dot`}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`truncate ${isUnread ? "font-semibold" : "font-medium"}`}>{label}</span>
                      {conv.displayName && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline" dir="ltr">{conv.phone}</span>
                      )}
                      {/* Task #309: gemach name when the conversation is linked
                          to a location — gives admins immediate context on
                          which gemach the borrower belongs to without
                          opening the thread. */}
                      {conv.locationId !== null && conv.locationId !== undefined && locationsById.get(conv.locationId) && (
                        <Badge variant="outline" className="shrink-0 text-[10px] py-0 px-1.5 hidden md:inline-flex" data-testid={`sms-conv-row-${conv.id}-location`}>
                          {locationsById.get(conv.locationId)!.name}
                        </Badge>
                      )}
                      <span className="ms-auto text-xs text-muted-foreground shrink-0">
                        {formatRelativeTimestamp(conv.lastMessageAt, t, language)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5">
                      {conv.lastDirection === "outbound" && (
                        <span className="text-muted-foreground/70 me-1">{t("smsListLastSentPrefix")}</span>
                      )}
                      {conv.lastMessagePreview || ""}
                    </div>
                  </div>
                  {conv.unreadCount > 1 && (
                    <Badge variant="default" className="shrink-0" data-testid={`sms-conv-row-${conv.id}-unread-count`}>
                      {conv.unreadCount}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Locale-aware relative timestamp for the conversation list ("just now",
// "5m", "3h", "2d"). Falls back to a localized short date for anything older
// than a week so older threads stay readable.
function formatRelativeTimestamp(
  raw: string | Date | null | undefined,
  t: (k: TranslationKey, params?: Record<string, string | number>) => string,
  language: string,
): string {
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("smsRelativeJustNow");
  if (minutes < 60) return t("smsRelativeMinutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("smsRelativeHours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("smsRelativeDays", { count: days });
  return d.toLocaleDateString(language === "he" ? "he-IL" : undefined, {
    month: "short",
    day: "numeric",
  });
}

// Single chat bubble. Inbound = left/grey, outbound = right/primary. Outbound
// bubbles also show the Twilio delivery state (queued/sent/delivered/failed)
// via small icons so admins can see at a glance whether a reply actually
// reached the recipient.
function MessageBubble({ message, language }: { message: SmsMessage; language: string }) {
  const { t } = useLanguage();
  const outbound = message.direction === "outbound";
  const sentAt = message.sentAt instanceof Date ? message.sentAt : new Date(message.sentAt as string);
  const timeLabel = isNaN(sentAt.getTime())
    ? ""
    : sentAt.toLocaleString(language === "he" ? "he-IL" : undefined, {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      });

  const renderStatus = () => {
    if (!outbound) return null;
    const status = message.deliveryStatus || "";
    if (status === "failed" || status === "undelivered") {
      return (
        <span className="inline-flex items-center text-red-100" title={message.errorMessage || t("smsStatusFailed")}>
          <AlertCircle className="h-3 w-3" />
        </span>
      );
    }
    if (status === "delivered" || status === "read") {
      return <CheckCheck className="h-3 w-3" aria-label={t("smsStatusDelivered")} />;
    }
    if (status === "sent" || status === "queued" || status === "accepted") {
      return <Check className="h-3 w-3" aria-label={t("smsStatusSent")} />;
    }
    return null;
  };

  return (
    <div
      className={`flex ${outbound ? "justify-end" : "justify-start"}`}
      data-testid={`sms-bubble-${message.direction}-${message.id}`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words ${
          outbound
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-background border rounded-bl-sm"
        }`}
      >
        <div>{message.body}</div>
        <div
          className={`mt-1 flex items-center gap-1.5 text-[10px] ${
            outbound ? "text-primary-foreground/80 justify-end" : "text-muted-foreground"
          }`}
        >
          <span>{timeLabel}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  );
}

