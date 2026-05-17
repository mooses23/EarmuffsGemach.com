import { useQuery } from "@tanstack/react-query";
import type { SmsConversation, SmsMessage } from "@shared/schema";

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

export function useConversations(channel: SmsChannel, folder: SmsFolder) {
  return useQuery<ConversationsResponse>({
    queryKey: ["/api/admin/sms/conversations", channel, folder],
    queryFn: async () => {
      const params = new URLSearchParams({ folder, limit: "100" });
      if (channel !== "all") params.set("channel", channel);
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
