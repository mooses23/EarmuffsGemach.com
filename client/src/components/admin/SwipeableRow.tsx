import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { type LucideIcon } from "lucide-react";

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  color: string;
  onCommit: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  rightAction?: SwipeAction;
  leftAction?: SwipeAction;
  leftLongAction?: SwipeAction;
  disabled?: boolean;
  testId?: string;
}

const REVEAL_THRESHOLD = 64;
const COMMIT_THRESHOLD = 180;
const LONG_THRESHOLD = 280;

export function SwipeableRow({
  children,
  rightAction,
  leftAction,
  leftLongAction,
  disabled = false,
  testId,
}: SwipeableRowProps) {
  // Physical direction mapping per spec — kept identical in LTR and RTL so
  // muscle memory carries across locales (right = mark unread, left = archive,
  // long left = delete).
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [committing, setCommitting] = useState<"left" | "right" | "leftLong" | null>(null);

  const rightBg = useTransform(x, [0, REVEAL_THRESHOLD, COMMIT_THRESHOLD], [0, 0.7, 1]);
  const leftBg = useTransform(x, [-COMMIT_THRESHOLD, -REVEAL_THRESHOLD, 0], [1, 0.7, 0]);
  const leftLongBg = useTransform(x, [-LONG_THRESHOLD, -COMMIT_THRESHOLD, -REVEAL_THRESHOLD], [1, 0, 0]);

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const offset = info.offset.x;
    if (disabled) {
      x.set(0);
      return;
    }
    if (offset >= COMMIT_THRESHOLD && rightAction) {
      setCommitting("right");
      const width = containerRef.current?.offsetWidth || 600;
      void Promise.resolve()
        .then(() => {
          x.set(width);
        })
        .then(() => {
          window.setTimeout(() => {
            try { rightAction.onCommit(); } finally { x.set(0); setCommitting(null); }
          }, 160);
        });
      return;
    }
    if (offset <= -LONG_THRESHOLD && leftLongAction) {
      setCommitting("leftLong");
      const width = containerRef.current?.offsetWidth || 600;
      x.set(-width);
      window.setTimeout(() => {
        try { leftLongAction.onCommit(); } finally { x.set(0); setCommitting(null); }
      }, 160);
      return;
    }
    if (offset <= -COMMIT_THRESHOLD && leftAction) {
      setCommitting("left");
      const width = containerRef.current?.offsetWidth || 600;
      x.set(-width);
      window.setTimeout(() => {
        try { leftAction.onCommit(); } finally { x.set(0); setCommitting(null); }
      }, 160);
      return;
    }
    // Snap back to neutral
    x.set(0);
  };

  const RightIcon = rightAction?.icon;
  const LeftIcon = leftAction?.icon;
  const LeftLongIcon = leftLongAction?.icon;

  return (
    <div ref={containerRef} className="relative overflow-hidden" data-testid={testId}>
      {/* Right-swipe action (revealed when dragging right) */}
      {rightAction && (
        <motion.div
          className={`absolute inset-y-0 left-0 flex items-center justify-start pl-6 ${rightAction.color}`}
          style={{ opacity: rightBg, width: "100%" }}
          aria-hidden
          data-testid={testId ? `${testId}-action-right` : undefined}
        >
          <div className="flex items-center gap-2 text-white">
            {RightIcon ? <RightIcon className="h-5 w-5" /> : null}
            <span className="text-sm font-semibold">{rightAction.label}</span>
          </div>
        </motion.div>
      )}
      {/* Left-swipe actions (revealed when dragging left) */}
      {leftAction && (
        <motion.div
          className={`absolute inset-y-0 right-0 flex items-center justify-end pr-6 ${leftAction.color}`}
          style={{ opacity: leftBg, width: "100%" }}
          aria-hidden
          data-testid={testId ? `${testId}-action-left` : undefined}
        >
          <div className="flex items-center gap-2 text-white">
            {LeftIcon ? <LeftIcon className="h-5 w-5" /> : null}
            <span className="text-sm font-semibold">{leftAction.label}</span>
          </div>
        </motion.div>
      )}
      {leftLongAction && (
        <motion.div
          className={`absolute inset-y-0 right-0 flex items-center justify-end pr-6 ${leftLongAction.color}`}
          style={{ opacity: leftLongBg, width: "100%" }}
          aria-hidden
          data-testid={testId ? `${testId}-action-left-long` : undefined}
        >
          <div className="flex items-center gap-2 text-white">
            {LeftLongIcon ? <LeftLongIcon className="h-5 w-5" /> : null}
            <span className="text-sm font-semibold">{leftLongAction.label}</span>
          </div>
        </motion.div>
      )}

      <motion.div
        drag={disabled ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: -LONG_THRESHOLD - 40, right: COMMIT_THRESHOLD + 40 }}
        dragElastic={0.15}
        style={{ x, touchAction: "pan-y" }}
        onDragEnd={handleDragEnd}
        className={`relative bg-card ${committing ? "pointer-events-none" : ""}`}
      >
        {children}
      </motion.div>
    </div>
  );
}
