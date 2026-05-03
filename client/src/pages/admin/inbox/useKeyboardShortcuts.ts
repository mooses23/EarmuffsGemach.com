import { useEffect } from "react";

// Common chat/email shortcuts. Skips while a text input or contenteditable
// element is focused so typing into the search box or reply textarea is not
// hijacked. Esc and "?" still fire while a non-text element is focused.
export interface InboxShortcutHandlers {
  onMoveDown?: () => void;       // j / ArrowDown
  onMoveUp?: () => void;         // k / ArrowUp
  onOpen?: () => void;           // Enter
  onArchive?: () => void;        // e
  onTrash?: () => void;          // #
  onSpam?: () => void;           // !
  onReply?: () => void;          // r
  onToggleRead?: () => void;     // u
  onFocusSearch?: () => void;    // /
  onToggleSelect?: () => void;   // x (bulk-select toggle)
  onShowHelp?: () => void;       // ?
  onEscape?: () => void;         // Esc — closes overlay or detail
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useInboxKeyboardShortcuts(h: InboxShortcutHandlers, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // Always-on keys (don't require non-input focus)
      if (e.key === "Escape") {
        h.onEscape?.();
        return;
      }
      if (e.key === "?" && !isEditable(e.target)) {
        e.preventDefault();
        h.onShowHelp?.();
        return;
      }
      // Allow "/" to grab focus from anywhere except a text input
      if (e.key === "/" && !isEditable(e.target)) {
        e.preventDefault();
        h.onFocusSearch?.();
        return;
      }
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          h.onMoveDown?.();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          h.onMoveUp?.();
          break;
        case "Enter":
          h.onOpen?.();
          break;
        case "e":
          h.onArchive?.();
          break;
        case "#":
          h.onTrash?.();
          break;
        case "!":
          h.onSpam?.();
          break;
        case "r":
          h.onReply?.();
          break;
        case "u":
          h.onToggleRead?.();
          break;
        case "x":
          h.onToggleSelect?.();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h, enabled]);
}
