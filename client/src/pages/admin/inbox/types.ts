export type SourceFilter = "all" | "email" | "form";
export type ReadFilter = "all" | "unread" | "read";
export type ReplyFilter = "all" | "unreplied" | "replied";
export type Folder = "inbox" | "spam" | "trash" | "sent";

export interface PersistedFilterState {
  folder: Folder;
  sourceFilter: SourceFilter;
  readFilter: ReadFilter;
  replyFilter: ReplyFilter;
  search: string;
}

export interface GmailEmail {
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
  messageCount?: number;
  unreadCount?: number;
  searchText?: string;
}

export interface EmailsResponse {
  threads?: GmailEmail[];
  emails?: GmailEmail[];
  nextPageToken?: string;
}

export interface UnifiedItem {
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
  serverMessageCount?: number;
  serverUnreadCount?: number;
  toAddress?: string;
  labels?: string[];
  searchText?: string;
}

export interface InboxThread {
  key: string;
  latest: UnifiedItem;
  members: UnifiedItem[];
  messageCount: number;
  unreadCount: number;
}

export interface ThreadEntry {
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

export interface ThreadResponse {
  source: "email" | "form";
  threadKey: string;
  messages: ThreadEntry[];
}

export const FILTER_STORAGE_KEY = "admin-inbox-filters-v1";

export const DEFAULT_FILTER_STATE: PersistedFilterState = {
  folder: "inbox",
  sourceFilter: "all",
  readFilter: "all",
  replyFilter: "all",
  search: "",
};
