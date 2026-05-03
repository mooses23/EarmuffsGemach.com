import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "j / ↓", label: "Next message" },
  { keys: "k / ↑", label: "Previous message" },
  { keys: "Enter", label: "Open message" },
  { keys: "e", label: "Archive" },
  { keys: "#", label: "Move to trash" },
  { keys: "!", label: "Report spam" },
  { keys: "r", label: "Reply" },
  { keys: "u", label: "Toggle read/unread" },
  { keys: "/", label: "Focus search" },
  { keys: "x", label: "Toggle bulk-select mode" },
  { keys: "Esc", label: "Close overlay or detail" },
  { keys: "?", label: "Show this help" },
];

export function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-shortcuts-help">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press any of these keys while viewing the inbox.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{s.label}</span>
              <kbd
                className="font-mono text-xs px-2 py-0.5 rounded bg-muted border"
                data-testid={`shortcut-key-${s.keys}`}
              >
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
