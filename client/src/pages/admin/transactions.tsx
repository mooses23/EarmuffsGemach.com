import React, { useState, useMemo, useEffect, useCallback } from "react";
import type { ElementType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLocations, getTransactions, markTransactionReturned } from "@/lib/api";
import { Location, Transaction, CityCategory, Region } from "@shared/schema";
import { localizeIsraelDistrict, IL_DISTRICT_ORDER } from "@/lib/location-names";
import { TransactionForm } from "@/components/admin/transaction-form";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Edit,
  MoreVertical,
  RotateCw,
  Calendar,
  User,
  Mail,
  Phone,
  AlertCircle,
  DollarSign,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Package,
  MapPin,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Activity,
  ArrowUpDown,
  X,
  ListChecks,
  CreditCard,
  Zap,
  Link2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format, differenceInDays } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";

const CHART_COLORS = ["hsl(var(--primary))", "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
const PIE_COLORS = ["hsl(var(--primary))", "#94a3b8"];

// Days before card expiry to start showing warnings
const CARD_EXPIRY_WARN_DAYS = 14;

function KpiTile({
  icon: Icon,
  label,
  value,
  loading,
  accent,
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-start gap-3 border border-white/10 backdrop-blur-sm bg-white/5">
      <div className={`p-2 rounded-lg shrink-0 ${accent ?? "bg-primary/20"}`}>
        <Icon className={`h-4 w-4 ${accent ? "text-white" : "text-primary"}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-14 mt-1" />
        ) : (
          <p className="text-xl font-bold text-white leading-tight mt-0.5">{value}</p>
        )}
      </div>
    </div>
  );
}

function ChartSkeleton({ height = 260 }: { height?: number }) {
  return <Skeleton className="w-full rounded-xl" style={{ height }} />;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

/** Returns days until a saved card hits the stale-card limit, or null if not applicable. */
function cardDaysUntilExpiry(transaction: Transaction, maxCardAgeDays: number): number | null {
  if (!transaction.cardSavedAt || !transaction.stripePaymentMethodId) return null;
  const savedAt = new Date(transaction.cardSavedAt);
  const expiryDate = new Date(savedAt.getTime() + maxCardAgeDays * 24 * 60 * 60 * 1000);
  return differenceInDays(expiryDate, new Date());
}

/** True if this transaction has a saved card that is chargeable or approaching expiry. */
function hasActiveCard(transaction: Transaction): boolean {
  return !!(
    transaction.stripePaymentMethodId &&
    (transaction.payLaterStatus === "CARD_SETUP_COMPLETE" || transaction.payLaterStatus === "APPROVED")
  );
}

interface TransactionCardProps {
  transaction: Transaction;
  locationName: string;
  onEdit: (t: Transaction) => void;
  onRefund: (t: Transaction) => void;
  onCharge: (t: Transaction) => void;
  onResendCardLink: (t: Transaction) => void;
  onRemoveCard: (t: Transaction) => void;
  t: (key: string) => string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  maxCardAgeDays: number;
}

function TransactionCard({
  transaction,
  locationName,
  onEdit,
  onRefund,
  onCharge,
  onResendCardLink,
  onRemoveCard,
  t,
  selectionMode,
  isSelected,
  onToggleSelect,
  maxCardAgeDays,
}: TransactionCardProps) {
  const isOverdue =
    !transaction.isReturned &&
    transaction.expectedReturnDate &&
    new Date(transaction.expectedReturnDate) < new Date();

  const refundStatus = (() => {
    if (!transaction.isReturned) return null;
    const refund = transaction.refundAmount ?? 0;
    const deposit = transaction.depositAmount ?? 0;
    if (refund === 0) return "none";
    if (refund >= deposit) return "full";
    return "partial";
  })();

  const cardChargeable = hasActiveCard(transaction);
  const daysUntilExpiry = cardDaysUntilExpiry(transaction, maxCardAgeDays);
  const cardExpiringSoon = cardChargeable && daysUntilExpiry !== null && daysUntilExpiry <= CARD_EXPIRY_WARN_DAYS;
  const cardExpired = cardChargeable && daysUntilExpiry !== null && daysUntilExpiry < 0;

  return (
    <div
      className={`glass-card rounded-xl border backdrop-blur-sm bg-white/5 p-4 flex flex-col gap-3 relative transition-colors ${
        isSelected ? "border-primary/60 bg-primary/10" : cardExpiringSoon ? "border-amber-500/40" : "border-white/10"
      }`}
    >
      {/* Header row: name + status + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {!transaction.isReturned && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(transaction.id)}
              onClick={(e) => e.stopPropagation()}
              className={`shrink-0 transition-opacity data-[state=checked]:bg-primary data-[state=checked]:border-primary ${
                selectionMode ? "opacity-100 border-primary/60" : "opacity-30 hover:opacity-80 border-white/40"
              }`}
            />
          )}
          <div className="p-1.5 rounded-full bg-primary/20 shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-white truncate">{transaction.borrowerName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {transaction.isReturned ? (
            <Badge className="bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/20 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t("returned")}
            </Badge>
          ) : (
            <Badge className={`text-xs border ${isOverdue ? "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/20" : "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"}`}>
              <Activity className="h-3 w-3 mr-1" />
              {isOverdue ? t("overdue") || "Overdue" : t("activeBorrow")}
            </Badge>
          )}
          {/* Card status badge */}
          {cardChargeable && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    className={`text-xs border gap-1 cursor-default ${
                      cardExpired
                        ? "bg-red-500/20 text-red-300 border-red-500/30"
                        : cardExpiringSoon
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                    }`}
                  >
                    <CreditCard className="h-3 w-3" />
                    {cardExpired ? "Card expired" : cardExpiringSoon ? `Expires ${daysUntilExpiry}d` : "Card saved"}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {cardExpired
                    ? "This saved card is past its authorization limit and can no longer be charged. Request a new card or remove it."
                    : cardExpiringSoon
                    ? `Card authorization expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. Charge now or ask borrower to re-enter their card.`
                    : `Card on file — can be charged if item is not returned.`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10">
                <span className="sr-only">{t("openMenu")}</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(transaction)}>
                <Edit className="mr-2 h-4 w-4" />
                {t("edit")}
              </DropdownMenuItem>
              {!transaction.isReturned && (
                <DropdownMenuItem onClick={() => onRefund(transaction)}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  {t("markAsReturned")}
                </DropdownMenuItem>
              )}
              {!transaction.isReturned && (
                <DropdownMenuItem onClick={() => onRefund(transaction)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("processRefund")}
                </DropdownMenuItem>
              )}
              {/* Card actions — only shown when a card is on file */}
              {cardChargeable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground py-1 px-2">
                    Card on file
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => onCharge(transaction)}
                    className="text-orange-400 focus:text-orange-400"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Charge card
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onResendCardLink(transaction)}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Resend card-update link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onRemoveCard(transaction)}
                    className="text-red-400 focus:text-red-400"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove card
                  </DropdownMenuItem>
                </>
              )}
              {/* Resend link even when card setup is pending */}
              {transaction.payLaterStatus === "CARD_SETUP_PENDING" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onResendCardLink(transaction)}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Resend card-setup link
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Card expiry warning strip */}
      {cardExpiringSoon && !cardExpired && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Card authorization expires in <strong>{daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"}</strong> — charge or ask borrower to update.</span>
        </div>
      )}
      {cardExpired && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Card authorization has <strong>expired</strong> — request a new card or remove it.</span>
        </div>
      )}

      {/* Contact chips */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {transaction.borrowerEmail && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[180px]">{transaction.borrowerEmail}</span>
          </span>
        )}
        {transaction.borrowerPhone && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Phone className="h-3 w-3 shrink-0" />
            {transaction.borrowerPhone}
          </span>
        )}
      </div>

      {/* Location + Deposit row */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-slate-300 min-w-0">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{locationName}</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="bg-white/10 text-slate-200 border-white/10 text-xs">
            ${transaction.depositAmount} {t("depositLabel") || "deposit"}
          </Badge>
          {transaction.isReturned && (
            <>
              {refundStatus === "full" && (
                <Badge className="bg-green-500/15 text-green-300 border border-green-500/25 hover:bg-green-500/15 text-xs">
                  {t("fullRefund")}
                </Badge>
              )}
              {refundStatus === "partial" && (
                <Badge className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/25 hover:bg-yellow-500/15 text-xs">
                  {t("partialRefund")} (${transaction.refundAmount})
                </Badge>
              )}
              {refundStatus === "none" && (
                <Badge variant="outline" className="text-xs text-slate-400 border-white/10">
                  {t("noRefund")}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* Date row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 border-t border-white/5 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {format(new Date(transaction.borrowDate), "MMM d, yyyy")}
        </span>
        {transaction.expectedReturnDate && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            {t("dueDate")}: {format(new Date(transaction.expectedReturnDate), "MMM d, yyyy")}
            {isOverdue && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertCircle className="h-3 w-3 text-red-400 ml-0.5" />
                  </TooltipTrigger>
                  <TooltipContent><p>{t("pastExpectedReturnDate")}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
        )}
        {transaction.actualReturnDate && (
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            {t("returned")}: {format(new Date(transaction.actualReturnDate), "MMM d, yyyy")}
          </span>
        )}
      </div>

      {/* Quick-action buttons for active borrows */}
      {!transaction.isReturned && (
        <div className={`pt-1 border-t border-white/5 grid gap-2 ${cardChargeable ? "grid-cols-2" : "grid-cols-1"}`}>
          <Button
            size="sm"
            className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 hover:border-primary/50 text-xs font-medium"
            onClick={() => onRefund(transaction)}
          >
            <RotateCw className="h-3.5 w-3.5 mr-1.5" />
            {t("markAsReturned")}
          </Button>
          {cardChargeable && (
            <Button
              size="sm"
              className={`w-full text-xs font-medium border ${
                cardExpired
                  ? "bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30"
                  : cardExpiringSoon
                  ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30"
                  : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border-orange-500/30"
              }`}
              onClick={() => onCharge(transaction)}
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Charge card
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

type SortKey = "date-desc" | "date-asc" | "status-active" | "status-returned" | "deposit-desc" | "deposit-asc";

const PAGE_SIZE = 20;

function readUrlParams() {
  if (typeof window === "undefined") return { status: "all" as const, sort: "date-desc" as SortKey, page: 1 };
  try {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("status");
    const rawSort = sp.get("sort") as SortKey | null;
    const rawPage = parseInt(sp.get("page") ?? "1", 10);
    const validSorts: SortKey[] = ["date-desc", "date-asc", "status-active", "status-returned", "deposit-desc", "deposit-asc"];
    const validStatuses = ["all", "active", "returned", "has-card", "expiring-soon"] as const;
    type FilterStatus = typeof validStatuses[number];
    const parsedStatus: FilterStatus =
      s === "active" || s === "open" || s === "pending" ? "active"
      : s === "returned" ? "returned"
      : s === "has-card" ? "has-card"
      : s === "expiring-soon" ? "expiring-soon"
      : "all";
    return {
      status: parsedStatus,
      sort: (rawSort && validSorts.includes(rawSort) ? rawSort : "date-desc") as SortKey,
      page: isNaN(rawPage) || rawPage < 1 ? 1 : rawPage,
    };
  } catch {
    return { status: "all" as const, sort: "date-desc" as SortKey, page: 1 };
  }
}

export default function AdminTransactions() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const initialParams = readUrlParams();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "returned" | "has-card" | "expiring-soon">(initialParams.status);
  const [sortKey, setSortKey] = useState<SortKey>(initialParams.sort);
  const [currentPage, setCurrentPage] = useState(initialParams.page);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundTransaction, setRefundTransaction] = useState<Transaction | null>(null);
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // ── Charge card dialog state ─────────────────────────────────────────
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [chargeTransaction, setChargeTransaction] = useState<Transaction | null>(null);
  const [chargeNote, setChargeNote] = useState("");
  const [chargeConfirmStep, setChargeConfirmStep] = useState(false);

  // ── Remove card dialog state ─────────────────────────────────────────
  const [isRemoveCardDialogOpen, setIsRemoveCardDialogOpen] = useState(false);
  const [removeCardTransaction, setRemoveCardTransaction] = useState<Transaction | null>(null);

  // ── Bulk selection state ─────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [bulkRefundAmounts, setBulkRefundAmounts] = useState<Record<number, string>>({});
  const [allResultsSelected, setAllResultsSelected] = useState(false);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAllResultsSelected(false);
    setBulkRefundAmounts({});
  }, []);

  const selectionMode = selectedIds.size > 0;

  // Sync sort/status/page to URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (filterStatus === "all") sp.delete("status"); else sp.set("status", filterStatus);
    if (sortKey === "date-desc") sp.delete("sort"); else sp.set("sort", sortKey);
    if (currentPage <= 1) sp.delete("page"); else sp.set("page", String(currentPage));
    const newSearch = sp.toString();
    const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    if (window.location.search !== (newSearch ? `?${newSearch}` : "")) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [filterStatus, sortKey, currentPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset pagination when filter/sort changes
  const handleSetFilterStatus = useCallback((s: "all" | "active" | "returned" | "has-card" | "expiring-soon") => {
    setFilterStatus(s);
    setCurrentPage(1);
    setSelectedIds(new Set());
    setAllResultsSelected(false);
  }, []);

  const handleSetSortKey = useCallback((s: SortKey) => {
    setSortKey(s);
    setCurrentPage(1);
    setSelectedIds(new Set());
    setAllResultsSelected(false);
  }, []);

  const [filterRegionId, setFilterRegionId] = useState<number | null>(null);
  const [filterDistrict, setFilterDistrict] = useState<string | null>(null);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const { data: cityCategories = [] } = useQuery<CityCategory[]>({
    queryKey: ["/api/city-categories"],
  });

  // Determine the server-side status filter; has-card / expiring-soon need
  // further client-side filtering so we request all active records from the server.
  const serverStatus = (filterStatus === "has-card" || filterStatus === "expiring-soon") ? "active" : filterStatus;

  // Paginated list query — fetches one page of sorted/filtered results from the server
  const { data: paginatedResult, isLoading: txLoading } = useQuery<{ data: Transaction[]; total: number }>({
    queryKey: ["/api/transactions", currentPage, PAGE_SIZE, sortKey, serverStatus, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
        sort: sortKey,
        status: serverStatus,
        search: debouncedSearch,
      });
      const res = await fetch(`/api/transactions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
  });
  const transactions = paginatedResult?.data ?? [];
  const totalCount = paginatedResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Full dataset for analytics charts, counts, and expiring-cards banner.
  // Loaded on demand when the analytics section is expanded.
  const { data: allTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
    enabled: analyticsOpen,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch the max card age so we can compute card expiry warnings client-side
  const { data: stripeSettings } = useQuery<{ maxCardAgeDays: number }>({
    queryKey: ["/api/operator/stripe-settings"],
  });
  const maxCardAgeDays = stripeSettings?.maxCardAgeDays ?? 90;

  const markReturnedMutation = useMutation({
    mutationFn: ({ id, refundAmount, notes }: { id: number; refundAmount?: number; notes?: string }) =>
      markTransactionReturned(id, { refundAmount, notes }),
    onSuccess: () => {
      toast({ title: t("success"), description: t("transactionUpdatedSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      closeRefundDialog();
    },
    onError: (error) => {
      toast({ title: t("error"), description: `${t("failedToUpdateStatus")} ${error.message}`, variant: "destructive" });
    },
  });

  const bulkMarkReturnedMutation = useMutation({
    mutationFn: async ({ ids }: { ids: number[] }) => {
      const results = await Promise.allSettled(
        ids.map((id) => {
          const customAmount = bulkRefundAmounts[id];
          // Amounts must always be pre-populated (either from dialog initializer or
          // from selectAllResults). Defaulting to 0 if somehow missing is safe — it
          // means no refund rather than a random incorrect charge.
          const refundAmount = customAmount !== undefined
            ? Math.max(0, parseFloat(customAmount) || 0)
            : 0;
          return markTransactionReturned(id, { refundAmount });
        })
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed === 0) {
        toast({ title: t("success"), description: `${succeeded} ${t("transactionsLabel") || "transactions"} marked as returned.` });
      } else {
        toast({
          title: "Partial success",
          description: `${succeeded} marked as returned; ${failed} failed. Please retry the remaining items.`,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setIsBulkConfirmOpen(false);
      clearSelection();
    },
    onError: (error) => {
      toast({ title: t("error"), description: `${t("failedToUpdateStatus")} ${error.message}`, variant: "destructive" });
    },
  });

  // ── Charge card mutation ─────────────────────────────────────────────
  const chargeCardMutation = useMutation({
    mutationFn: ({ id, operatorNote }: { id: number; operatorNote?: string }) =>
      apiRequest("POST", `/api/operator/transactions/${id}/charge`, { operatorNote }),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.success) {
        toast({ title: "Card charged", description: "The card was charged successfully." });
      } else if (data.requiresAction) {
        toast({
          title: "Authentication required",
          description: "The borrower needs to complete additional authentication. A link has been sent to them.",
        });
      } else {
        toast({
          title: "Charge failed",
          description: data.errorMessage || "Failed to charge the card.",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      closeChargeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Charge failed", description: error.message || "Failed to charge the card.", variant: "destructive" });
    },
  });

  // ── Resend card link mutation ────────────────────────────────────────
  const resendCardLinkMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/operator/transactions/${id}/request-new-card`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      const link = data.statusUrl || "";
      toast({
        title: "Card-update link created",
        description: link
          ? `Send this link to the borrower: ${link}`
          : "A new card-setup link has been generated.",
        duration: 8000,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Could not generate card link.", variant: "destructive" });
    },
  });

  // ── Remove card mutation ─────────────────────────────────────────────
  const removeCardMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/admin/transactions/${id}/card`, {}),
    onSuccess: () => {
      toast({ title: "Card removed", description: "The saved card has been detached from this transaction." });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setIsRemoveCardDialogOpen(false);
      setRemoveCardTransaction(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Could not remove card.", variant: "destructive" });
    },
  });

  const openRefundDialog = (transaction: Transaction) => {
    setRefundTransaction(transaction);
    setIsFullRefund(true);
    setRefundAmount(transaction.depositAmount?.toString() || "0");
    setRefundNotes("");
    setConfirmStep(false);
    setIsRefundDialogOpen(true);
  };

  const closeRefundDialog = () => {
    setIsRefundDialogOpen(false);
    setRefundTransaction(null);
    setIsFullRefund(true);
    setRefundAmount("");
    setRefundNotes("");
    setConfirmStep(false);
  };

  const handleProcessRefund = () => {
    if (!refundTransaction) return;
    const amount = isFullRefund ? refundTransaction.depositAmount : parseFloat(refundAmount);
    markReturnedMutation.mutate({ id: refundTransaction.id, refundAmount: amount || 0, notes: refundNotes || undefined });
  };

  const openChargeDialog = (transaction: Transaction) => {
    setChargeTransaction(transaction);
    setChargeNote("");
    setChargeConfirmStep(false);
    setIsChargeDialogOpen(true);
  };

  const closeChargeDialog = () => {
    setIsChargeDialogOpen(false);
    setChargeTransaction(null);
    setChargeNote("");
    setChargeConfirmStep(false);
  };

  const handleCharge = () => {
    if (!chargeTransaction) return;
    chargeCardMutation.mutate({ id: chargeTransaction.id, operatorNote: chargeNote || undefined });
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingTransaction(null);
  };

  const getLocationNameById = (locationId: number) => {
    const location = locations.find((l) => l.id === locationId);
    if (!location) return "Unknown";
    return language === "he" && location.nameHe ? location.nameHe : location.name;
  };

  // Build a lookup: location id → districtCode (for Israeli locations)
  const locationDistrictMap = useMemo(() => {
    const ccById = new Map<number, CityCategory>(cityCategories.map((cc) => [cc.id, cc]));
    const m = new Map<number, string>();
    for (const loc of locations) {
      if (loc.cityCategoryId) {
        const cc = ccById.get(loc.cityCategoryId);
        if (cc?.districtCode) m.set(loc.id, cc.districtCode);
      }
    }
    return m;
  }, [locations, cityCategories]);

  // The Israel region record (used to gate district filter)
  const israelRegion = useMemo(() => regions.find(r => r.slug === "israel") ?? null, [regions]);

  // Regions that actually have transactions (for the region filter chips)
  const availableRegions = useMemo(() => {
    const regionIdSet = new Set(locations.map(l => l.regionId));
    return regions.filter(r => regionIdSet.has(r.id));
  }, [regions, locations]);

  // Districts available in Israel — computed from all locations so the dropdown
  // is never page-limited when server-side pagination is active.
  const availableIsraelDistricts = useMemo(() => {
    if (!israelRegion || filterRegionId !== israelRegion.id) return [];
    const found = new Set<string>();
    for (const loc of locations) {
      if (loc.regionId !== israelRegion.id) continue;
      const dc = locationDistrictMap.get(loc.id);
      if (dc) found.add(dc);
    }
    return IL_DISTRICT_ORDER.filter(d => found.has(d));
  }, [locations, locationDistrictMap, israelRegion, filterRegionId]);

  // Only client-side-only filters here (status/search/sort are handled server-side).
  // has-card and expiring-soon require Stripe card data, region/district require
  // location data — both are applied client-side on the already-paginated page data.
  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (filterStatus === "has-card") {
        if (transaction.isReturned) return false;
        if (!hasActiveCard(transaction)) return false;
      }
      if (filterStatus === "expiring-soon") {
        if (transaction.isReturned) return false;
        if (!hasActiveCard(transaction)) return false;
        const days = cardDaysUntilExpiry(transaction, maxCardAgeDays);
        if (days === null || days < 0 || days > CARD_EXPIRY_WARN_DAYS) return false;
      }
      if (filterRegionId !== null) {
        const loc = locations.find(l => l.id === transaction.locationId);
        if (!loc || loc.regionId !== filterRegionId) return false;
      }
      if (filterDistrict) {
        const dc = locationDistrictMap.get(transaction.locationId);
        if (dc !== filterDistrict) return false;
      }
      return true;
    });
  }, [transactions, filterStatus, filterRegionId, filterDistrict, maxCardAgeDays, locations, locationDistrictMap]);

  const visibleTransactions = filteredTransactions;
  const hasMore = currentPage < totalPages;

  // ── Select-all helpers ────────────────────────────────────────────────
  const selectableFilteredIds = useMemo(
    () => filteredTransactions.filter((tx) => !tx.isReturned).map((tx) => tx.id),
    [filteredTransactions]
  );

  const allPageSelected =
    selectableFilteredIds.length > 0 &&
    selectableFilteredIds.every((id) => selectedIds.has(id));

  // Select all non-returned items visible on the current page
  const selectAllOnPage = useCallback(() => {
    setSelectedIds(new Set(selectableFilteredIds));
    setAllResultsSelected(false);
  }, [selectableFilteredIds]);

  // Select all non-returned items across all pages (fetches IDs + depositAmounts from server).
  // Only valid when no client-side-only filters are active (region / district / has-card /
  // expiring-soon) because those cannot be communicated to the server-side IDs endpoint.
  const canSelectAllResults =
    filterStatus !== "has-card" &&
    filterStatus !== "expiring-soon" &&
    filterRegionId === null &&
    !filterDistrict;

  const selectAllResults = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: serverStatus, search: debouncedSearch });
      const res = await fetch(`/api/admin/transactions/ids?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const { transactions: allTxItems } = await res.json() as {
        transactions: { id: number; depositAmount: number | null }[];
        total: number;
      };
      // Pre-populate exact refund amounts so the mutation never falls back to a guess
      const amounts: Record<number, string> = {};
      allTxItems.forEach(tx => {
        amounts[tx.id] = String(tx.depositAmount ?? 20);
      });
      setSelectedIds(new Set(allTxItems.map(tx => tx.id)));
      setBulkRefundAmounts(amounts);
      setAllResultsSelected(true);
    } catch {
      toast({ title: t("error"), description: "Failed to select all results", variant: "destructive" });
    }
  }, [serverStatus, debouncedSearch, toast, t]);

  // ── Cards expiring soon (banner) — from full dataset when analytics loaded ──
  const expiringCards = useMemo(() =>
    allTransactions.filter((tx) => {
      if (tx.isReturned || !hasActiveCard(tx)) return false;
      const days = cardDaysUntilExpiry(tx, maxCardAgeDays);
      return days !== null && days >= 0 && days <= CARD_EXPIRY_WARN_DAYS;
    }),
    [allTransactions, maxCardAgeDays]
  );

  // ── Filter button counts (from full dataset when analytics is loaded) ─────
  const cardOnFileCount = useMemo(
    () => allTransactions.filter((tx) => !tx.isReturned && hasActiveCard(tx)).length,
    [allTransactions]
  );
  const expiringSoonCount = expiringCards.length;

  // ── Analytics computations (use full dataset for accurate totals) ─────────
  const returnedCount = useMemo(() => allTransactions.filter((t) => t.isReturned).length, [allTransactions]);
  const activeBorrows = allTransactions.length - returnedCount;
  const returnRate = allTransactions.length > 0 ? Math.round((returnedCount / allTransactions.length) * 100) : 0;
  const totalDeposits = useMemo(() => allTransactions.reduce((sum, t) => sum + (t.depositAmount ?? 0), 0), [allTransactions]);

  const locationMap = useMemo(() => {
    const m = new Map<number, string>();
    locations.forEach((l) => m.set(l.id, l.name));
    return m;
  }, [locations]);

  const volumeByMonth = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(getMonthKey(d));
    }
    const borrowCounts: Record<string, number> = {};
    const returnCounts: Record<string, number> = {};
    months.forEach((m) => { borrowCounts[m] = 0; returnCounts[m] = 0; });
    allTransactions.forEach((tx) => {
      const bKey = getMonthKey(new Date(tx.borrowDate));
      if (borrowCounts[bKey] !== undefined) borrowCounts[bKey]++;
      if (tx.actualReturnDate) {
        const rKey = getMonthKey(new Date(tx.actualReturnDate));
        if (returnCounts[rKey] !== undefined) returnCounts[rKey]++;
      }
    });
    return months.map((m) => ({ month: formatMonth(m), Borrows: borrowCounts[m], Returns: returnCounts[m] }));
  }, [allTransactions]);

  const statusPieData = useMemo(() => [
    { name: "Active", value: activeBorrows },
    { name: "Returned", value: returnedCount },
  ], [activeBorrows, returnedCount]);

  const locationBarData = useMemo(() => {
    const counts: Record<number, number> = {};
    allTransactions.forEach((tx) => { counts[tx.locationId] = (counts[tx.locationId] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([id, count]) => ({ name: locationMap.get(Number(id)) ?? `Location ${id}`, Borrows: count }))
      .sort((a, b) => b.Borrows - a.Borrows)
      .slice(0, 8);
  }, [allTransactions, locationMap]);

  const paymentMethodData = useMemo(() => {
    const counts: Record<string, number> = {};
    allTransactions.forEach((tx) => {
      const method = tx.depositPaymentMethod ?? "cash";
      counts[method] = (counts[method] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [allTransactions]);

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{t("transactionManagement")}</h1>
        <p className="text-sm md:text-base text-muted-foreground">{t("trackDepositsAndBorrowing")}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("paymentMethodsLabel")} &amp; {t("paymentStatusMonitor")} now live in{" "}
          <a href="/admin/locations#settings=payments" className="underline hover:text-foreground">
            Settings
          </a>
          .
        </p>
      </div>

      {/* ── Cards-expiring-soon alert banner ────────────────────────────── */}
      {!txLoading && expiringCards.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-300">
              {expiringCards.length} saved card{expiringCards.length > 1 ? "s" : ""} expiring soon
            </span>
            <span className="text-xs text-amber-400/80 ml-auto">
              Charge, request an update, or remove before authorization expires.
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {expiringCards.map((tx) => {
              const days = cardDaysUntilExpiry(tx, maxCardAgeDays);
              const expired = days !== null && days < 0;
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="font-medium text-white truncate">{tx.borrowerName}</span>
                    <span className="text-amber-400/70 shrink-0">
                      {expired ? "expired" : `${days}d left`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-amber-300 hover:text-white hover:bg-amber-500/20"
                      onClick={() => openChargeDialog(tx)}
                      title="Charge card now"
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Charge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-slate-300 hover:text-white hover:bg-white/10"
                      onClick={() => resendCardLinkMutation.mutate(tx.id)}
                      disabled={resendCardLinkMutation.isPending}
                      title="Send borrower a link to update their card"
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Update
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => { setRemoveCardTransaction(tx); setIsRemoveCardDialogOpen(true); }}
                      title="Remove saved card"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiTile
          icon={Package}
          label={t("analyticsTotalBorrows")}
          value={txLoading ? "…" : transactions.length}
          loading={txLoading}
        />
        <KpiTile
          icon={Activity}
          label={t("analyticsActiveLoans")}
          value={txLoading ? "…" : activeBorrows}
          loading={txLoading}
          accent="bg-amber-500/20"
        />
        <KpiTile
          icon={CheckCircle2}
          label={t("analyticsReturnRate")}
          value={txLoading ? "…" : transactions.length > 0 ? `${returnRate}%` : "—"}
          loading={txLoading}
          accent="bg-green-500/20"
        />
        <KpiTile
          icon={DollarSign}
          label={t("analyticsDepositsCollected")}
          value={txLoading ? "…" : `$${totalDeposits.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          loading={txLoading}
          accent="bg-blue-500/20"
        />
      </div>

      {/* ── Region filter chips (shown when ≥2 regions have transactions) ─── */}
      {availableRegions.length >= 2 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            variant={filterRegionId === null ? "default" : "outline"}
            size="sm"
            className="whitespace-nowrap rounded-full"
            onClick={() => { setFilterRegionId(null); setFilterDistrict(null); setCurrentPage(1); setSelectedIds(new Set()); }}
          >
            {t("allTransactions")}
          </Button>
          {availableRegions.map(region => (
            <Button
              key={region.id}
              variant={filterRegionId === region.id ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap rounded-full"
              onClick={() => {
                setFilterRegionId(region.id);
                setFilterDistrict(null);
                setCurrentPage(1);
                setSelectedIds(new Set());
              }}
            >
              {language === "he" && region.nameHe ? region.nameHe : region.name}
            </Button>
          ))}
        </div>
      )}

      {/* ── Search / filter bar + add button ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-grow">
          <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            className="ps-10"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setSelectedIds(new Set()); }}
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1 overflow-x-auto">
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap"
              onClick={() => handleSetFilterStatus("all")}
            >
              {t("allTransactions")}
            </Button>
            <Button
              variant={filterStatus === "active" ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap"
              onClick={() => handleSetFilterStatus("active")}
            >
              {t("activeOnly")}
            </Button>
            <Button
              variant={filterStatus === "returned" ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap"
              onClick={() => handleSetFilterStatus("returned")}
            >
              {t("returnedOnly")}
            </Button>
            <Button
              variant={filterStatus === "has-card" ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap gap-1.5"
              onClick={() => handleSetFilterStatus("has-card")}
            >
              <CreditCard className="h-3.5 w-3.5" />
              {t("cardOnFile")}
              {cardOnFileCount > 0 && (
                <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-semibold leading-none">
                  {cardOnFileCount}
                </span>
              )}
            </Button>
            <Button
              variant={filterStatus === "expiring-soon" ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap gap-1.5"
              onClick={() => handleSetFilterStatus("expiring-soon")}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("expiringSoon")}
              {expiringSoonCount > 0 && (
                <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-semibold leading-none">
                  {expiringSoonCount}
                </span>
              )}
            </Button>
          </div>

          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="whitespace-nowrap gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortKey === "date-desc" && (t("sortDateNewest") || "Newest first")}
                {sortKey === "date-asc" && (t("sortDateOldest") || "Oldest first")}
                {sortKey === "status-active" && (t("sortActiveFirst") || "Active first")}
                {sortKey === "status-returned" && (t("sortReturnedFirst") || "Returned first")}
                {sortKey === "deposit-desc" && (t("sortDepositHigh") || "Deposit ↓")}
                {sortKey === "deposit-asc" && (t("sortDepositLow") || "Deposit ↑")}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{t("sortBy") || "Sort by"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground py-1 px-2">
                {t("borrowDate") || "Borrow Date"}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleSetSortKey("date-desc")} className={sortKey === "date-desc" ? "bg-accent" : ""}>
                {t("sortDateNewest") || "Newest first"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetSortKey("date-asc")} className={sortKey === "date-asc" ? "bg-accent" : ""}>
                {t("sortDateOldest") || "Oldest first"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground py-1 px-2">
                {t("status") || "Status"}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleSetSortKey("status-active")} className={sortKey === "status-active" ? "bg-accent" : ""}>
                {t("sortActiveFirst") || "Active first"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetSortKey("status-returned")} className={sortKey === "status-returned" ? "bg-accent" : ""}>
                {t("sortReturnedFirst") || "Returned first"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground py-1 px-2">
                {t("depositAmount") || "Deposit Amount"}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleSetSortKey("deposit-desc")} className={sortKey === "deposit-desc" ? "bg-accent" : ""}>
                {t("sortDepositHigh") || "Highest first"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetSortKey("deposit-asc")} className={sortKey === "deposit-asc" ? "bg-accent" : ""}>
                {t("sortDepositLow") || "Lowest first"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* District filter — visible when Israel transactions exist */}
          {availableIsraelDistricts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={filterDistrict ? "default" : "outline"}
                  size="sm"
                  className="whitespace-nowrap gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {filterDistrict
                    ? localizeIsraelDistrict(language as "en" | "he", filterDistrict)
                    : (t("districts") || "Districts")}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t("districts") || "Districts"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => { setFilterDistrict(null); setCurrentPage(1); setSelectedIds(new Set()); }}
                  className={!filterDistrict ? "bg-accent" : ""}
                >
                  {t("allDistricts") || "All Districts"}
                </DropdownMenuItem>
                {availableIsraelDistricts.map((dc) => (
                  <DropdownMenuItem
                    key={dc}
                    onClick={() => { setFilterDistrict(dc); setCurrentPage(1); setSelectedIds(new Set()); }}
                    className={filterDistrict === dc ? "bg-accent" : ""}
                  >
                    {localizeIsraelDistrict(language as "en" | "he", dc)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            onClick={() => setIsCreateDialogOpen(true)}
            data-testid="button-add-transaction"
            aria-label={t("addNewTransaction")}
            title={t("addNewTransaction")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Bulk action bar ──────────────────────────────────────────────── */}
      {selectionMode && (
        <div className="sticky top-2 z-20 mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 backdrop-blur-md px-4 py-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <ListChecks className="h-4 w-4 text-primary" />
            {selectedIds.size} {selectedIds.size === 1 ? (t("transactionLabel") || "transaction") : (t("transactionsLabel") || "transactions")} selected
            {/* Select all on page / all results / deselect */}
            {!allPageSelected && (
              <button
                type="button"
                onClick={selectAllOnPage}
                className="text-xs text-primary/80 hover:text-primary underline underline-offset-2 ml-1"
              >
                Select page ({selectableFilteredIds.length})
              </button>
            )}
            {allPageSelected && totalPages > 1 && !allResultsSelected && canSelectAllResults && (
              <button
                type="button"
                onClick={selectAllResults}
                className="text-xs text-primary/80 hover:text-primary underline underline-offset-2 ml-1"
              >
                · Select all {totalCount}
              </button>
            )}
            {(allPageSelected || allResultsSelected) && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 ml-1"
              >
                · Deselect all
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
              onClick={() => {
              setBulkRefundAmounts(prev => {
                const next = { ...prev };
                // Only initialise amounts for current-page items not already set
                // (off-page items were pre-populated by selectAllResults with exact amounts)
                transactions.filter(tx => selectedIds.has(tx.id)).forEach(tx => {
                  if (next[tx.id] === undefined) {
                    next[tx.id] = String(tx.depositAmount ?? 20);
                  }
                });
                return next;
              });
              setIsBulkConfirmOpen(true);
            }}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Mark {selectedIds.size} as Returned
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-300 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Transaction card grid ────────────────────────────────────────── */}
      {!txLoading && (filteredTransactions.length > 0 || totalCount > 0) && (
        <p className="text-xs text-slate-400 mb-3">
          {t("showingResults") || "Showing"} {filteredTransactions.length}{" "}
          {t("ofLabel") || "of"} {totalCount}{" "}
          {t("transactionsLabel") || "transactions"}
          {totalPages > 1 && ` — page ${currentPage} of ${totalPages}`}
        </p>
      )}

      {txLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="glass-card rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <Package className="h-10 w-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">
            {searchTerm || filterStatus !== "all" ? t("noTransactionsMatchSearch") : t("noTransactionsYet")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleTransactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                locationName={getLocationNameById(transaction.locationId)}
                onEdit={handleEditTransaction}
                onRefund={openRefundDialog}
                onCharge={openChargeDialog}
                onResendCardLink={(tx) => resendCardLinkMutation.mutate(tx.id)}
                onRemoveCard={(tx) => { setRemoveCardTransaction(tx); setIsRemoveCardDialogOpen(true); }}
                t={t}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(transaction.id)}
                onToggleSelect={toggleSelect}
                maxCardAgeDays={maxCardAgeDays}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || txLoading}
              >
                ← Previous
              </Button>
              <span className="text-xs text-slate-400">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || txLoading}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Analytics section (collapsible, closed by default) ──────────── */}
      <div className="mt-8">
        <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 py-2 border-b border-border/40 text-left"
            >
              <h2 className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                {t("analyticsReports")}
              </h2>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {analyticsOpen ? (
                  <><ChevronUp className="h-3.5 w-3.5" />Hide</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" />Show</>
                )}
              </span>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Monthly volume bar chart */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    {t("analyticsMonthlyVolume")}
                  </CardTitle>
                  <CardDescription>{t("analyticsLast12Months")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {txLoading ? (
                    <ChartSkeleton />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={volumeByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Borrows" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Returns" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Active vs Returned pie */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    {t("analyticsLoanStatusSplit")}
                  </CardTitle>
                  <CardDescription>{t("analyticsActiveVsReturned")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {txLoading ? (
                    <ChartSkeleton />
                  ) : transactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-16">{t("analyticsNoData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={statusPieData} cx="50%" cy="45%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                          {statusPieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top locations */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {t("analyticsTopLocations")}
                  </CardTitle>
                  <CardDescription>{t("analyticsAllTimeBorrows")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {txLoading ? (
                    <ChartSkeleton />
                  ) : locationBarData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-16">{t("analyticsNoData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={locationBarData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          width={120}
                          tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)}
                        />
                        <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                        <Bar dataKey="Borrows" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Payment method breakdown pie */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    {t("analyticsDepositMethods")}
                  </CardTitle>
                  <CardDescription>{t("analyticsCashVsCard")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {txLoading ? (
                    <ChartSkeleton />
                  ) : paymentMethodData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-16">{t("analyticsNoData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={paymentMethodData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                          {paymentMethodData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addNewTransaction")}</DialogTitle>
            <DialogDescription>{t("recordNewTransactionDescription")}</DialogDescription>
          </DialogHeader>
          <TransactionForm locations={locations} onSuccess={() => setIsCreateDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editTransaction")}</DialogTitle>
            <DialogDescription>{t("editTransactionDescription")}</DialogDescription>
          </DialogHeader>
          {editingTransaction && (
            <TransactionForm transaction={editingTransaction} locations={locations} onSuccess={closeEditDialog} />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk confirm dialog ──────────────────────────────────────────── */}
      <Dialog open={isBulkConfirmOpen} onOpenChange={(open) => { if (!open) setIsBulkConfirmOpen(false); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Mark {selectedIds.size} as Returned
            </DialogTitle>
            <DialogDescription>
              Adjust each refund amount below. Defaults to the full deposit — set to 0 to keep the deposit.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2 max-h-64 overflow-y-auto">
            {transactions
              .filter((tx) => selectedIds.has(tx.id))
              .map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="font-medium text-white truncate">{tx.borrowerName}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3" />
                      <span>{getLocationNameById(tx.locationId)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="number"
                        min="0"
                        max={tx.depositAmount ?? 20}
                        step="0.01"
                        value={bulkRefundAmounts[tx.id] ?? String(tx.depositAmount ?? 20)}
                        onChange={(e) => setBulkRefundAmounts(prev => ({ ...prev, [tx.id]: e.target.value }))}
                        className="w-16 rounded border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-white text-right focus:outline-none focus:ring-1 focus:ring-primary"
                        disabled={bulkMarkReturnedMutation.isPending}
                      />
                    </div>
                  </div>
                </div>
              ))}
            {allResultsSelected && selectedIds.size > transactions.filter(tx => selectedIds.has(tx.id)).length && (
              <p className="text-xs text-slate-400 px-1 pt-1">
                + {selectedIds.size - transactions.filter(tx => selectedIds.has(tx.id)).length} more from other pages — full deposit will be refunded
              </p>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Total to be refunded</span>
              <span className="text-sm font-semibold text-emerald-400">
                ${transactions
                  .filter((tx) => selectedIds.has(tx.id))
                  .reduce((sum, tx) => {
                    const amt = bulkRefundAmounts[tx.id] !== undefined
                      ? parseFloat(bulkRefundAmounts[tx.id]) || 0
                      : (tx.depositAmount ?? 20);
                    return sum + amt;
                  }, 0)
                  .toFixed(2)}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsBulkConfirmOpen(false)} disabled={bulkMarkReturnedMutation.isPending}>
              {t("cancel")}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
              onClick={() => bulkMarkReturnedMutation.mutate({ ids: Array.from(selectedIds) })}
              disabled={bulkMarkReturnedMutation.isPending}
            >
              <RotateCw className="h-4 w-4" />
              {bulkMarkReturnedMutation.isPending
                ? "Processing…"
                : `Confirm — Return & Refund ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Return / Refund dialog ───────────────────────────────────────── */}
      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent className="sm:max-w-[450px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t("processRefund")}
            </DialogTitle>
            <DialogDescription>{t("processRefundDescription")}</DialogDescription>
          </DialogHeader>

          {refundTransaction && !confirmStep && (
            <div className="space-y-6 py-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">{t("borrower")}</span>
                  <span className="font-medium">{refundTransaction.borrowerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t("originalDeposit")}</span>
                  <span className="font-bold text-lg">${refundTransaction.depositAmount}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="full-refund" className="flex flex-col gap-1">
                  <span>{t("fullRefund")}</span>
                  <span className="text-xs text-muted-foreground font-normal">{t("refundEntireDeposit")}</span>
                </Label>
                <Switch
                  id="full-refund"
                  checked={isFullRefund}
                  onCheckedChange={(checked) => {
                    setIsFullRefund(checked);
                    if (checked) setRefundAmount(refundTransaction.depositAmount?.toString() || "0");
                  }}
                />
              </div>

              {!isFullRefund && (
                <div className="space-y-2">
                  <Label htmlFor="refund-amount">{t("refundAmount")}</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="refund-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      max={refundTransaction.depositAmount || 0}
                      placeholder={t("enterRefundAmount")}
                      className="pl-9"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("maxRefund")}: ${refundTransaction.depositAmount}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="refund-notes">{t("refundNotes")}</Label>
                <Textarea
                  id="refund-notes"
                  placeholder={t("refundNotesPlaceholder")}
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {refundTransaction && confirmStep && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <h4 className="font-semibold">{t("confirmRefundDetails")}</h4>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t("borrower")}</span>
                  <span className="font-medium">{refundTransaction.borrowerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t("originalDeposit")}</span>
                  <span>${refundTransaction.depositAmount}</span>
                </div>
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-sm font-medium">{t("refundAmount")}</span>
                  <span className="font-bold text-lg text-green-600">
                    ${isFullRefund ? refundTransaction.depositAmount : refundAmount}
                  </span>
                </div>
                {!isFullRefund && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t("retained")}</span>
                    <span className="text-amber-600">
                      ${((refundTransaction.depositAmount || 0) - parseFloat(refundAmount || "0")).toFixed(2)}
                    </span>
                  </div>
                )}
                {refundNotes && (
                  <div className="border-t pt-2">
                    <span className="text-sm text-muted-foreground">{t("notes")}: </span>
                    <span className="text-sm">{refundNotes}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-background border-t z-10">
            {!confirmStep ? (
              <>
                <Button variant="outline" onClick={closeRefundDialog}>
                  {t("cancel")}
                </Button>
                <Button
                  onClick={() => setConfirmStep(true)}
                  disabled={!isFullRefund && (!refundAmount || parseFloat(refundAmount) < 0)}
                >
                  {t("reviewRefund")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfirmStep(false)}>
                  {t("back")}
                </Button>
                <Button
                  onClick={handleProcessRefund}
                  disabled={markReturnedMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {markReturnedMutation.isPending ? t("processing") : t("confirmAndProcessRefund")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Charge card dialog ───────────────────────────────────────────── */}
      <Dialog open={isChargeDialogOpen} onOpenChange={(open) => { if (!open) closeChargeDialog(); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-400" />
              Charge saved card
            </DialogTitle>
            <DialogDescription>
              This will charge the borrower's saved card off-session. They will receive a notification before and after the charge.
            </DialogDescription>
          </DialogHeader>

          {chargeTransaction && !chargeConfirmStep && (
            <div className="space-y-5 py-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Borrower</span>
                  <span className="font-medium">{chargeTransaction.borrowerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount to charge</span>
                  <span className="font-bold text-orange-300">
                    ${((chargeTransaction.amountPlannedCents ?? chargeTransaction.depositAmount * 100) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Card status</span>
                  <span className="flex items-center gap-1 text-blue-300">
                    <CreditCard className="h-3 w-3" />
                    {chargeTransaction.payLaterStatus === "APPROVED" ? "Approved" : "Card on file"}
                  </span>
                </div>
                {chargeTransaction.cardSavedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Card saved</span>
                    <span className={
                      cardDaysUntilExpiry(chargeTransaction, maxCardAgeDays) !== null &&
                      (cardDaysUntilExpiry(chargeTransaction, maxCardAgeDays) ?? 999) <= CARD_EXPIRY_WARN_DAYS
                        ? "text-amber-300"
                        : "text-slate-300"
                    }>
                      {format(new Date(chargeTransaction.cardSavedAt), "MMM d, yyyy")}
                      {(() => {
                        const days = cardDaysUntilExpiry(chargeTransaction, maxCardAgeDays);
                        if (days === null) return null;
                        if (days < 0) return <span className="ml-1 text-red-400">(authorization expired)</span>;
                        if (days <= CARD_EXPIRY_WARN_DAYS) return <span className="ml-1 text-amber-400">({days}d left)</span>;
                        return null;
                      })()}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="charge-note">Reason for charge (sent to borrower)</Label>
                <Textarea
                  id="charge-note"
                  placeholder="e.g. Item not returned after 30 days — deposit forfeited"
                  value={chargeNote}
                  onChange={(e) => setChargeNote(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  This message is included in the pre-charge notification to the borrower.
                </p>
              </div>
            </div>
          )}

          {chargeTransaction && chargeConfirmStep && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 space-y-3 text-sm">
                <h4 className="font-semibold text-orange-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Confirm charge
                </h4>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Borrower</span>
                  <span className="font-medium">{chargeTransaction.borrowerName}</span>
                </div>
                <div className="flex justify-between border-t border-orange-500/20 pt-2">
                  <span className="text-sm font-medium">Charge amount</span>
                  <span className="font-bold text-lg text-orange-300">
                    ${((chargeTransaction.amountPlannedCents ?? chargeTransaction.depositAmount * 100) / 100).toFixed(2)}
                  </span>
                </div>
                {chargeNote && (
                  <div className="border-t border-orange-500/20 pt-2">
                    <span className="text-muted-foreground">Reason: </span>
                    <span>{chargeNote}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                The borrower will be notified via email or SMS before the charge is processed. This action cannot be undone.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!chargeConfirmStep ? (
              <>
                <Button variant="outline" onClick={closeChargeDialog}>Cancel</Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
                  onClick={() => setChargeConfirmStep(true)}
                >
                  <Zap className="h-4 w-4" />
                  Review charge
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setChargeConfirmStep(false)} disabled={chargeCardMutation.isPending}>
                  Back
                </Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
                  onClick={handleCharge}
                  disabled={chargeCardMutation.isPending}
                >
                  <Zap className="h-4 w-4" />
                  {chargeCardMutation.isPending ? "Charging…" : "Confirm charge"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove card confirm dialog ───────────────────────────────────── */}
      <AlertDialog open={isRemoveCardDialogOpen} onOpenChange={(open) => { if (!open) { setIsRemoveCardDialogOpen(false); setRemoveCardTransaction(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-400" />
              Remove saved card?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently detach the card from Stripe and remove it from{" "}
              <strong>{removeCardTransaction?.borrowerName}</strong>'s transaction. The card cannot be charged afterwards. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeCardMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => removeCardTransaction && removeCardMutation.mutate(removeCardTransaction.id)}
              disabled={removeCardMutation.isPending}
            >
              {removeCardMutation.isPending ? "Removing…" : "Remove card"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
