import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadPersistedFilters,
  persistFilters,
} from "./utils";
import type {
  Folder,
  ReadFilter,
  ReplyFilter,
  SourceFilter,
} from "./types";

// Single source of truth for inbox filter state. Loads persisted snapshot
// EXACTLY ONCE on mount via a single useState lazy initializer (vs the prior
// 5x calls), then mirrors changes back to localStorage on every change.
export function useInboxFilters() {
  // loadPersistedFilters runs EXACTLY ONCE per mount. We cache the snapshot
  // in a ref so the five useState initializers below all read from the same
  // single localStorage parse — not five separate calls. The ref pattern is
  // hot-reload-safe (state resets cleanly with the component) unlike a
  // module-level cache.
  const initialRef = useRef<ReturnType<typeof loadPersistedFilters> | null>(null);
  if (initialRef.current === null) initialRef.current = loadPersistedFilters();
  const initial = initialRef.current;

  const [folder, setFolderState] = useState<Folder>(initial.folder);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(initial.sourceFilter);
  const [readFilter, setReadFilter] = useState<ReadFilter>(initial.readFilter);
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>(initial.replyFilter);
  const [search, setSearch] = useState<string>(initial.search);

  // Debounced search value used by the visible-list memo so each keystroke
  // doesn't re-run the (potentially expensive) filter chain on every render.
  const [debouncedSearch, setDebouncedSearch] = useState<string>(initial.search);
  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(h);
  }, [search]);

  // Switching folders resets secondary filters so stale state from one folder
  // doesn't yield a confusingly-empty list elsewhere.
  const setFolder = useCallback((next: Folder) => {
    setSourceFilter(next === "sent" ? "email" : "all");
    setReadFilter("all");
    setReplyFilter("all");
    setFolderState(next);
  }, []);

  const clearAll = useCallback(() => {
    setFolderState("inbox");
    setSourceFilter("all");
    setReadFilter("all");
    setReplyFilter("all");
    setSearch("");
  }, []);

  // Mirror filter state to localStorage on every change.
  useEffect(() => {
    persistFilters({ folder, sourceFilter, readFilter, replyFilter, search });
  }, [folder, sourceFilter, readFilter, replyFilter, search]);

  return {
    folder,
    setFolder,
    sourceFilter,
    setSourceFilter,
    readFilter,
    setReadFilter,
    replyFilter,
    setReplyFilter,
    search,
    setSearch,
    debouncedSearch,
    clearAll,
  };
}
