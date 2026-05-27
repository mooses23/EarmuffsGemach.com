import { useQuery } from "@tanstack/react-query";
import type { SmsConversation, SmsMessage } from "@shared/schema";

export interface TwilioWebhookUrls {
  inboundUrl: string;
  statusCallbackUrl: string;
  baseUrl: string;
  isBaseUrlEnvSet: boolean;
}

export type SmsChannel = "all" | "sms" | "whatsapp";
export type SmsFolder = "inbox" | "archived";

export interface ConversationsResponse {
  rows: SmsConversation[];
  total: number;
}

export interface MessagesResponse {
  conversation: SmsConversation;
  messages: SmsMessage[];
}

const POLL_MS = 30_000;

export interface UseConversationsOpts {
  q?: string;
  unlinkedOnly?: boolean;
}

export function useConversations(
  channel: SmsChannel,
  folder: SmsFolder,
  opts: UseConversationsOpts = {},
) {
  const { q = "", unlinkedOnly = false } = opts;
  return useQuery<ConversationsResponse>({
    // Search term + unlinked flag are part of the cache key so each filter
    // combination gets its own round-trip and the previous result list
    // doesn't briefly flash for a different filter set.
    queryKey: ["/api/admin/sms/conversations", channel, folder, q, unlinkedOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ folder, limit: "100" });
      if (channel !== "all") params.set("channel", channel);
      if (q.trim()) params.set("q", q.trim());
      if (unlinkedOnly) params.set("unlinked", "1");
      const res = await fetch(`/api/admin/sms/conversations?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load conversations");
      }
      return res.json();
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useConversationMessages(conversationId: number | null) {
  return useQuery<MessagesResponse>({
    queryKey: ["/api/admin/sms/conversations", conversationId],
    enabled: conversationId !== null,
    queryFn: async () => {
      const res = await fetch(`/api/admin/sms/conversations/${conversationId}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load conversation");
      }
      return res.json();
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useTwilioWebhookUrls() {
  return useQuery<TwilioWebhookUrls>({
    queryKey: ["/api/admin/twilio/webhook-urls"],
    queryFn: async () => {
      const res = await fetch("/api/admin/twilio/webhook-urls", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load webhook URLs");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
