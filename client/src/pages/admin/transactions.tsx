import React, { useState, useMemo, useEffect, useCallback } from "react";
import type { ElementType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLocations, getTransactions, markTransactionReturned } from "@/lib/api";
import { Location, Transaction } from "@shared/schema";
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
  ChevronsUpDown,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format } from "date-fns";
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

const CHART_COLORS = ["hsl(var(--primary))", "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
const PIE_COLORS = ["hsl(var(--primary))", "#94a3b8"];

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

interface TransactionCardProps {
  transaction: Transaction;
  locationName: string;
  onEdit: (t: Transaction) => void;
  onRefund: (t: Transaction) => void;
  t: (key: string) => string;
}

function TransactionCard({ transaction, locationName, onEdit, onRefund, t }: TransactionCardProps) {
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

  return (
    <div className="glass-card rounded-xl border border-white/10 backdrop-blur-sm bg-white/5 p-4 flex flex-col gap-3 relative">
      {/* Header row: name + status + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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

      {/* Quick-action button for active borrows */}
      {!transaction.isReturned && (
        <div className="pt-1 border-t border-white/5">
          <Button
            size="sm"
            className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 hover:border-primary/50 text-xs font-medium"
            onClick={() => onRefund(transaction)}
          >
            <RotateCw className="h-3.5 w-3.5 mr-1.5" />
            {t("markAsReturned")}
          </Button>
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
    return {
      status: (s === "active" || s === "open" || s === "pending" ? "active" : s === "returned" ? "returned" : "all") as "all" | "active" | "returned",
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
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "returned">(initialParams.status);
  const [sortKey, setSortKey] = useState<SortKey>(initialParams.sort);
  const [visibleCount, setVisibleCount] = useState(initialParams.page * PAGE_SIZE);

  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundTransaction, setRefundTransaction] = useState<Transaction | null>(null);
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Sync sort/status/page to URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (filterStatus === "all") sp.delete("status"); else sp.set("status", filterStatus);
    if (sortKey === "date-desc") sp.delete("sort"); else sp.set("sort", sortKey);
    const pageNum = Math.ceil(visibleCount / PAGE_SIZE);
    if (pageNum <= 1) sp.delete("page"); else sp.set("page", String(pageNum));
    const newSearch = sp.toString();
    const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    if (window.location.search !== (newSearch ? `?${newSearch}` : "")) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [filterStatus, sortKey, visibleCount]);

  // Reset pagination when filter/sort/search changes
  const handleSetFilterStatus = useCallback((s: "all" | "active" | "returned") => {
    setFilterStatus(s);
    setVisibleCount(PAGE_SIZE);
  }, []);

  const handleSetSortKey = useCallback((s: SortKey) => {
    setSortKey(s);
    setVisibleCount(PAGE_SIZE);
  }, []);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

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

  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter((transaction) => {
      if (filterStatus === "active" && transaction.isReturned) return false;
      if (filterStatus === "returned" && !transaction.isReturned) return false;
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        transaction.borrowerName.toLowerCase().includes(searchLower) ||
        (transaction.borrowerEmail && transaction.borrowerEmail.toLowerCase().includes(searchLower)) ||
        (transaction.borrowerPhone && transaction.borrowerPhone.toLowerCase().includes(searchLower)) ||
        getLocationNameById(transaction.locationId).toLowerCase().includes(searchLower)
      );
    });

    filtered.sort((a, b) => {
      switch (sortKey) {
        case "date-asc":
          return new Date(a.borrowDate).getTime() - new Date(b.borrowDate).getTime();
        case "date-desc":
          return new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime();
        case "status-active":
          if (a.isReturned === b.isReturned) return 0;
          return a.isReturned ? 1 : -1;
        case "status-returned":
          if (a.isReturned === b.isReturned) return 0;
          return a.isReturned ? -1 : 1;
        case "deposit-desc":
          return (b.depositAmount ?? 0) - (a.depositAmount ?? 0);
        case "deposit-asc":
          return (a.depositAmount ?? 0) - (b.depositAmount ?? 0);
        default:
          return 0;
      }
    });

    return filtered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, filterStatus, searchTerm, sortKey, locations, language]);

  const visibleTransactions = filteredTransactions.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTransactions.length;

  // ── Analytics computations ──────────────────────────────────────────
  const returnedCount = useMemo(() => transactions.filter((t) => t.isReturned).length, [transactions]);
  const activeBorrows = transactions.length - returnedCount;
  const returnRate = transactions.length > 0 ? Math.round((returnedCount / transactions.length) * 100) : 0;
  const totalDeposits = useMemo(() => transactions.reduce((sum, t) => sum + (t.depositAmount ?? 0), 0), [transactions]);

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
    transactions.forEach((tx) => {
      const bKey = getMonthKey(new Date(tx.borrowDate));
      if (borrowCounts[bKey] !== undefined) borrowCounts[bKey]++;
      if (tx.actualReturnDate) {
        const rKey = getMonthKey(new Date(tx.actualReturnDate));
        if (returnCounts[rKey] !== undefined) returnCounts[rKey]++;
      }
    });
    return months.map((m) => ({ month: formatMonth(m), Borrows: borrowCounts[m], Returns: returnCounts[m] }));
  }, [transactions]);

  const statusPieData = useMemo(() => [
    { name: "Active", value: activeBorrows },
    { name: "Returned", value: returnedCount },
  ], [activeBorrows, returnedCount]);

  const locationBarData = useMemo(() => {
    const counts: Record<number, number> = {};
    transactions.forEach((tx) => { counts[tx.locationId] = (counts[tx.locationId] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([id, count]) => ({ name: locationMap.get(Number(id)) ?? `Location ${id}`, Borrows: count }))
      .sort((a, b) => b.Borrows - a.Borrows)
      .slice(0, 8);
  }, [transactions, locationMap]);

  const paymentMethodData = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.forEach((tx) => {
      const method = tx.depositPaymentMethod ?? "cash";
      counts[method] = (counts[method] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [transactions]);

  return (
    <>
      {/* ── Page header ────────────────────────────────────────────────── */}
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

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
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

      {/* ── Search / filter bar + add button ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-grow">
          <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            className="ps-10"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(PAGE_SIZE); }}
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

      {/* ── Transaction card grid ───────────────────────────────────────── */}
      {/* Results count */}
      {!txLoading && filteredTransactions.length > 0 && (
        <p className="text-xs text-slate-400 mb-3">
          {t("showingResults") || "Showing"} {visibleTransactions.length}{" "}
          {t("ofLabel") || "of"} {filteredTransactions.length}{" "}
          {t("transactionsLabel") || "transactions"}
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
                t={t}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                <ChevronsUpDown className="h-4 w-4" />
                {t("loadMore") || "Load more"}{" "}
                <span className="text-muted-foreground text-xs">
                  ({filteredTransactions.length - visibleCount} {t("remaining") || "remaining"})
                </span>
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Analytics section (collapsible, closed by default) ─────────── */}
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

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
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
    </>
  );
}
