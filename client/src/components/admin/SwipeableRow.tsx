import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
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

const REVEAL = 72;
const COMMIT = 160;
const LONG = 260;

type RevealState = "closed" | "right" | "left";

export function SwipeableRow({
  children,
  rightAction,
  leftAction,
  leftLongAction,
  disabled = false,
  testId,
}: SwipeableRowProps) {
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState<RevealState>("closed");

  const rightBg = useTransform(x, [0, REVEAL, COMMIT], [0, 0.85, 1]);
  const leftBg = useTransform(x, [-COMMIT, -REVEAL, 0], [1, 0.85, 0]);
  const leftLongBg = useTransform(x, [-LONG, -COMMIT, -REVEAL], [1, 0, 0]);

  const close = () => {
    animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
    setReveal("closed");
  };

  const commit = (action: SwipeAction) => {
    action.onCommit();
    x.set(0);
    setReveal("closed");
  };

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (disabled) return close();
    const offset = info.offset.x;
    if (offset >= COMMIT && rightAction) return commit(rightAction);
    if (offset <= -LONG && leftLongAction) return commit(leftLongAction);
    if (offset <= -COMMIT && leftAction) return commit(leftAction);
    // Persistent partial-reveal: user can tap the revealed action or tap outside to cancel.
    if (offset >= REVEAL && rightAction) {
      animate(x, REVEAL + 24, { type: "spring", stiffness: 500, damping: 40 });
      setReveal("right");
      return;
    }
    if (offset <= -REVEAL && (leftAction || leftLongAction)) {
      animate(x, -(REVEAL + 24), { type: "spring", stiffness: 500, damping: 40 });
      setReveal("left");
      return;
    }
    close();
  };

  // Tap-outside to cancel the partial reveal.
  useEffect(() => {
    if (reveal === "closed") return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer as EventListener, true);
    return () => document.removeEventListener("pointerdown", onPointer as EventListener, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  const RightIcon = rightAction?.icon;
  const LeftIcon = leftAction?.icon;
  const LeftLongIcon = leftLongAction?.icon;

  return (
    <div ref={containerRef} className="relative overflow-hidden" data-testid={testId}>
      {rightAction && (
        <motion.div
          className={`absolute inset-y-0 left-0 flex items-center justify-start pl-6 ${rightAction.color}`}
          style={{ opacity: rightBg, width: "100%" }}
          aria-hidden
        >
          <button
            type="button"
            onClick={() => commit(rightAction)}
            className="flex items-center gap-2 text-white"
            data-testid={testId ? `${testId}-action-right` : undefined}
            tabIndex={reveal === "right" ? 0 : -1}
          >
            {RightIcon ? <RightIcon className="h-5 w-5" /> : null}
            <span className="text-sm font-semibold">{rightAction.label}</span>
          </button>
        </motion.div>
      )}
      {leftAction && (
        <motion.div
          className={`absolute inset-y-0 right-0 flex items-center justify-end pr-6 ${leftAction.color}`}
          style={{ opacity: leftBg, width: "100%" }}
          aria-hidden
        >
          <button
            type="button"
            onClick={() => commit(leftAction)}
            className="flex items-center gap-2 text-white"
            data-testid={testId ? `${testId}-action-left` : undefined}
            tabIndex={reveal === "left" ? 0 : -1}
          >
            {LeftIcon ? <LeftIcon className="h-5 w-5" /> : null}
            <span className="text-sm font-semibold">{leftAction.label}</span>
          </button>
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
        dragConstraints={{ left: -LONG - 40, right: COMMIT + 40 }}
        dragElastic={0.15}
        style={{ x, touchAction: "pan-y" }}
        onDragEnd={handleDragEnd}
        onClickCapture={(e) => {
          // While a swipe action is revealed, intercept clicks: cancel the
          // reveal instead of opening the underlying row.
          if (reveal !== "closed") {
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        }}
        className="relative bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}
