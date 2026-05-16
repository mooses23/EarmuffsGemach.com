import { Rows3, LayoutList } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { CardDensity } from "@/hooks/use-card-density";

interface CardDensityToggleProps {
  density: CardDensity;
  onChange: (next: CardDensity) => void;
  variant?: "dark" | "light";
  className?: string;
}

export function CardDensityToggle({
  density,
  onChange,
  variant = "dark",
  className = "",
}: CardDensityToggleProps) {
  const { t } = useLanguage();

  const baseGroup =
    variant === "dark"
      ? "inline-flex items-center rounded-full border border-white/15 bg-white/5 p-0.5"
      : "inline-flex items-center rounded-full border border-slate-300 bg-white p-0.5 shadow-sm";

  const baseBtn =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors";

  const activeBtn =
    variant === "dark"
      ? "bg-blue-500/30 text-white border border-blue-400/40"
      : "bg-blue-600 text-white";

  const inactiveBtn =
    variant === "dark"
      ? "text-slate-300 hover:text-white border border-transparent"
      : "text-slate-600 hover:text-slate-900 border border-transparent";

  return (
    <div
      className={`${baseGroup} ${className}`}
      role="group"
      aria-label={t("cardViewLabel")}
      data-testid="card-density-toggle"
    >
      <button
        type="button"
        onClick={() => onChange("compact")}
        aria-pressed={density === "compact"}
        className={`${baseBtn} ${density === "compact" ? activeBtn : inactiveBtn}`}
        data-testid="button-card-density-compact"
      >
        <Rows3 className="h-3.5 w-3.5" />
        <span>{t("cardViewCompact")}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("full")}
        aria-pressed={density === "full"}
        className={`${baseBtn} ${density === "full" ? activeBtn : inactiveBtn}`}
        data-testid="button-card-density-full"
      >
        <LayoutList className="h-3.5 w-3.5" />
        <span>{t("cardViewFull")}</span>
      </button>
    </div>
  );
}
