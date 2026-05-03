import DOMPurify from "dompurify";
import {
  DEFAULT_FILTER_STATE,
  FILTER_STORAGE_KEY,
  type Folder,
  type PersistedFilterState,
  type ReadFilter,
  type ReplyFilter,
  type SourceFilter,
  type UnifiedItem,
} from "./types";

export function parseEmailAddress(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (from.includes("@")) return { name: from.split("@")[0], email: from.trim() };
  return { name: from || "Unknown", email: "" };
}

export function formatDate(dateStr: string | Date): string {
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

export function safeDate(input: string | Date | null | undefined): string {
  if (!input) return new Date().toISOString();
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function sanitizeHtml(body: string): string {
  const html = body.includes("<") ? body : body.replace(/\n/g, "<br/>");
  return DOMPurify.sanitize(html);
}

export function normalizeSubject(s: string): string {
  return String(s || "")
    .replace(/^\s*((re|fw|fwd|aw|tr)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function groupKey(item: UnifiedItem, formKeys: Map<string, string>): string {
  if (item.source === "email") return `email::${item.threadId || item.id}`;
  const precomputed = formKeys.get(String(item.id));
  if (precomputed) return precomputed;
  const email = (item.fromEmail || "").toLowerCase();
  return `form::${email}::${normalizeSubject(item.subject)}`;
}

export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s"'<>)\]]+/gi;
  const matches = text.match(re) ?? [];
  return Array.from(new Set(matches.map((u) => u.replace(/[.,;:!?]+$/, ""))));
}

// Read once on mount. Defensive against missing localStorage, malformed JSON,
// and out-of-range enum values from older builds.
export function loadPersistedFilters(): PersistedFilterState {
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
    const normalizedSource: SourceFilter = folder === "sent" ? "email" : sourceFilter;
    const normalizedRead: ReadFilter = folder === "sent" ? "all" : readFilter;
    const normalizedReply: ReplyFilter = folder === "sent" ? "all" : replyFilter;
    return { folder, sourceFilter: normalizedSource, readFilter: normalizedRead, replyFilter: normalizedReply, search };
  } catch {
    return DEFAULT_FILTER_STATE;
  }
}

export function persistFilters(state: PersistedFilterState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* non-fatal */
  }
}
