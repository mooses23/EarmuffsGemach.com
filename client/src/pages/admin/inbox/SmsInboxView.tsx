import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import type { SmsConversation, SmsMessage } from "@shared/schema";

type Channel = "all" | "sms" | "whatsapp";

interface Props {
  smsUnread: number;
  whatsappUnread: number;
}

interface ListResponse {
  rows: SmsConversation[];
  total: number;
}

interface MessagesResponse {
  conversation: SmsConversation;
  messages: SmsMessage[];
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
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  // Reset thread selection (and any draft reply) when the user flips
  // channels, folders, or conversations. Without resetting `reply`, a draft
  // typed for conversation A could be accidentally sent to conversation B
  // after a switch — a material correctness issue for messaging.
  useEffect(() => { setSelectedId(null); setReply(""); }, [channel, showArchived]);
  useEffect(() => { setReply(""); }, [selectedId]);

  const listQuery = useQuery<ListResponse>({
    queryKey: ["/api/admin/sms/conversations", channel, showArchived ? "archived" : "inbox"],
    queryFn: async () => {
      // Omit the channel param entirely when the user picked "All" — the
      // server treats an unrecognized/missing channel as "no filter" and
      // returns SMS + WhatsApp combined.
      const params = new URLSearchParams({
        folder: showArchived ? "archived" : "inbox",
        limit: "100",
      });
      if (channel !== "all") params.set("channel", channel);
      const res = await fetch(`/api/admin/sms/conversations?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed to load conversations");
      return res.json();
    },
    // 30s polling per task spec; complements the 15s counts poll so the
    // badge clears quickly while list traffic stays modest.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const threadQuery = useQuery<MessagesResponse>({
    queryKey: ["/api/admin/sms/conversations", selectedId],
    enabled: selectedId !== null,
    queryFn: async () => {
      const res = await fetch(`/api/admin/sms/conversations/${selectedId}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed to load conversation");
      return res.json();
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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
        .catch((e) => {
          // Surface failures so admins notice when unread state isn't
          // clearing — otherwise a backend regression could silently leave
          // the badge stuck and look like a UI bug.
          console.warn("[sms] markRead failed", e);
          toast({
            title: t("smsMarkReadFailed"),
            description: e?.message ?? String(e),
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
      toast({ title: vars.isArchived ? t("smsArchivedToast") : t("smsUnarchivedToast") });
      setSelectedId(null);
    },
    onError: (e: any) => toast({ title: t("error"), description: e?.message ?? String(e), variant: "destructive" }),
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
    onError: (e: any) => toast({ title: t("smsReplyFailedToast"), description: e?.message ?? String(e), variant: "destructive" }),
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
    </div>
  );

  // ===== Thread detail view =====
  if (selectedId !== null && selectedConversation) {
    const isOptedOut = selectedConversation.isOptedOut;
    const messages = threadQuery.data?.messages ?? [];
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
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground" data-testid="sms-empty-state">
            <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <div className="font-medium text-foreground">{t("smsEmptyTitle")}</div>
            <div className="text-sm">{t("smsEmptyDesc")}</div>
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
                      <span className="ms-auto text-xs text-muted-foreground shrink-0">
                        {formatRelativeTimestamp(conv.lastMessageAt as unknown as string, t, language)}
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
  t: (k: any, params?: Record<string, string | number>) => string,
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
  const sentAt = new Date(message.sentAt as unknown as string);
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

