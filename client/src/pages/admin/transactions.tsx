import React, { useState, useMemo } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  RotateCcw,
  Package,
  MapPin,
} from "lucide-react";
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

function StatCard({
  icon: Icon,
  title,
  value,
  sub,
  loading,
}: {
  icon: ElementType;
  title: string;
  value: string | number;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          {loading ? (
            <Skeleton className="h-7 w-20 mt-1" />
          ) : (
            <p className="text-2xl font-bold leading-tight mt-0.5">{value}</p>
          )}
          {sub && !loading && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
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

export default function AdminTransactions() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "returned">(() => {
    if (typeof window === "undefined") return "all";
    try {
      const sp = new URLSearchParams(window.location.search);
      const s = sp.get("status");
      if (s === "active" || s === "open" || s === "pending") return "active";
      if (s === "returned") return "returned";
    } catch {}
    return "all";
  });

  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundTransaction, setRefundTransaction] = useState<Transaction | null>(null);
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

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
      toast({ title: t('success'), description: t('transactionUpdatedSuccess') });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      closeRefundDialog();
    },
    onError: (error) => {
      toast({ title: t('error'), description: `${t('failedToUpdateStatus')} ${error.message}`, variant: "destructive" });
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
    const location = locations.find(l => l.id === locationId);
    if (!location) return "Unknown";
    return language === "he" && location.nameHe ? location.nameHe : location.name;
  };

  const getRefundStatus = (transaction: Transaction) => {
    if (!transaction.isReturned) return null;
    const refund = transaction.refundAmount ?? 0;
    const deposit = transaction.depositAmount ?? 0;
    if (refund === 0) return "none";
    if (refund >= deposit) return "full";
    return "partial";
  };

  const filteredTransactions = transactions.filter(transaction => {
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

  // ── Analytics computations ──────────────────────────────────────────
  const returnedCount = useMemo(() => transactions.filter(t => t.isReturned).length, [transactions]);
  const activeBorrows = transactions.length - returnedCount;
  const returnRate = transactions.length > 0 ? Math.round((returnedCount / transactions.length) * 100) : 0;
  const totalDeposits = useMemo(() => transactions.reduce((sum, t) => sum + (t.depositAmount ?? 0), 0), [transactions]);

  const locationMap = useMemo(() => {
    const m = new Map<number, string>();
    locations.forEach(l => m.set(l.id, l.name));
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
    months.forEach(m => { borrowCounts[m] = 0; returnCounts[m] = 0; });
    transactions.forEach(tx => {
      const bKey = getMonthKey(new Date(tx.borrowDate));
      if (borrowCounts[bKey] !== undefined) borrowCounts[bKey]++;
      if (tx.actualReturnDate) {
        const rKey = getMonthKey(new Date(tx.actualReturnDate));
        if (returnCounts[rKey] !== undefined) returnCounts[rKey]++;
      }
    });
    return months.map(m => ({ month: formatMonth(m), Borrows: borrowCounts[m], Returns: returnCounts[m] }));
  }, [transactions]);

  const statusPieData = useMemo(() => [
    { name: "Active", value: activeBorrows },
    { name: "Returned", value: returnedCount },
  ], [activeBorrows, returnedCount]);

  const locationBarData = useMemo(() => {
    const counts: Record<number, number> = {};
    transactions.forEach(tx => { counts[tx.locationId] = (counts[tx.locationId] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([id, count]) => ({ name: locationMap.get(Number(id)) ?? `Location ${id}`, Borrows: count }))
      .sort((a, b) => b.Borrows - a.Borrows)
      .slice(0, 8);
  }, [transactions, locationMap]);

  const paymentMethodData = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.forEach(tx => {
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
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{t('transactionManagement')}</h1>
        <p className="text-sm md:text-base text-muted-foreground">{t('trackDepositsAndBorrowing')}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('paymentMethodsLabel')} &amp; {t('paymentStatusMonitor')} now live in <a href="/admin/locations#settings=payments" className="underline hover:text-foreground">Settings</a>.
        </p>
      </div>

      <div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>{t('addNewTransaction')}</DialogTitle>
                <DialogDescription>{t('recordNewTransactionDescription')}</DialogDescription>
              </DialogHeader>
              <TransactionForm locations={locations} onSuccess={() => setIsCreateDialogOpen(false)} />
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{t('transactions')}</CardTitle>
                  <CardDescription>{t('trackDepositsAndBorrowing')}</CardDescription>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setIsCreateDialogOpen(true)}
                  data-testid="button-add-transaction"
                  aria-label={t('addNewTransaction')}
                  title={t('addNewTransaction')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-grow">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('search')}
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="-mx-1 px-1 overflow-x-auto sm:overflow-visible">
                  <div className="flex gap-2 min-w-max sm:min-w-0">
                    <Button variant={filterStatus === "all" ? "default" : "outline"} size="sm" className="whitespace-nowrap" onClick={() => setFilterStatus("all")}>{t('allTransactions')}</Button>
                    <Button variant={filterStatus === "active" ? "default" : "outline"} size="sm" className="whitespace-nowrap" onClick={() => setFilterStatus("active")}>{t('activeOnly')}</Button>
                    <Button variant={filterStatus === "returned" ? "default" : "outline"} size="sm" className="whitespace-nowrap" onClick={() => setFilterStatus("returned")}>{t('returnedOnly')}</Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('borrower')}</TableHead>
                      <TableHead>{t('location')}</TableHead>
                      <TableHead>{t('depositLabel')}</TableHead>
                      <TableHead>{t('refund')}</TableHead>
                      <TableHead>{t('dates')}</TableHead>
                      <TableHead>{t('status')}</TableHead>
                      <TableHead>{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((transaction) => {
                        const isOverdue = !transaction.isReturned &&
                          transaction.expectedReturnDate &&
                          new Date(transaction.expectedReturnDate) < new Date();
                        const refundStatus = getRefundStatus(transaction);
                        return (
                          <TableRow key={transaction.id}>
                            <TableCell>
                              <div className="font-medium flex items-center">
                                <User className="h-4 w-4 mr-2" />
                                {transaction.borrowerName}
                              </div>
                              {transaction.borrowerEmail && (
                                <div className="text-xs text-muted-foreground flex items-center">
                                  <Mail className="h-3 w-3 mr-1" />
                                  {transaction.borrowerEmail}
                                </div>
                              )}
                              {transaction.borrowerPhone && (
                                <div className="text-xs text-muted-foreground flex items-center">
                                  <Phone className="h-3 w-3 mr-1" />
                                  {transaction.borrowerPhone}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{getLocationNameById(transaction.locationId)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">${transaction.depositAmount}</Badge>
                            </TableCell>
                            <TableCell>
                              {transaction.isReturned ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                                    <span className="font-medium">${transaction.refundAmount ?? 0}</span>
                                  </div>
                                  {refundStatus === "full" && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{t('fullRefund')}</Badge>}
                                  {refundStatus === "partial" && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{t('partialRefund')}</Badge>}
                                  {refundStatus === "none" && <Badge variant="outline" className="text-muted-foreground">{t('noRefund')}</Badge>}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                                <span className="text-sm">{format(new Date(transaction.borrowDate), "MMM d, yyyy")}</span>
                              </div>
                              {transaction.expectedReturnDate && (
                                <div className="flex items-center mt-1">
                                  <span className="text-xs text-muted-foreground">
                                    {t('dueDate')}: {format(new Date(transaction.expectedReturnDate), "MMM d, yyyy")}
                                  </span>
                                  {isOverdue && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <AlertCircle className="h-3 w-3 ml-1 text-red-500" />
                                        </TooltipTrigger>
                                        <TooltipContent><p>{t('pastExpectedReturnDate')}</p></TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              )}
                              {transaction.actualReturnDate && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {t('returned')}: {format(new Date(transaction.actualReturnDate), "MMM d, yyyy")}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {transaction.isReturned ? (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{t('returned')}</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{t('activeBorrow')}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">{t('openMenu')}</span>
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleEditTransaction(transaction)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    {t('edit')}
                                  </DropdownMenuItem>
                                  {!transaction.isReturned && (
                                    <DropdownMenuItem onClick={() => openRefundDialog(transaction)}>
                                      <RotateCw className="mr-2 h-4 w-4" />
                                      {t('markAsReturned')}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          {searchTerm || filterStatus !== "all" ? (
                            <p className="text-muted-foreground">{t('noTransactionsMatchSearch')}</p>
                          ) : (
                            <p className="text-muted-foreground">{t('noTransactionsYet')}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
      </div>

      {/* ── Analytics section (compact, collapsible) ────────────────── */}
      <details className="mt-8 group" open>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 py-2 border-b border-border/40">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {t('analyticsReports')}
          </h2>
          <span className="text-xs text-muted-foreground group-open:hidden">{t('show') || 'Show'}</span>
          <span className="text-xs text-muted-foreground hidden group-open:inline">{t('hide') || 'Hide'}</span>
        </summary>

        {/* Compact KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div className="rounded-md border bg-card p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('analyticsTotalBorrows')}</div>
            <div className="text-lg font-semibold mt-0.5">{txLoading ? '…' : transactions.length}</div>
          </div>
          <div className="rounded-md border bg-card p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('analyticsActiveLoans')}</div>
            <div className="text-lg font-semibold mt-0.5">{txLoading ? '…' : activeBorrows}</div>
          </div>
          <div className="rounded-md border bg-card p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('analyticsReturnRate')}</div>
            <div className="text-lg font-semibold mt-0.5">{txLoading ? '…' : (transactions.length > 0 ? `${returnRate}%` : '—')}</div>
          </div>
          <div className="rounded-md border bg-card p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('analyticsDepositsCollected')}</div>
            <div className="text-lg font-semibold mt-0.5">{txLoading ? '…' : `$${totalDeposits.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          {/* Monthly volume bar chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                {t('analyticsMonthlyVolume')}
              </CardTitle>
              <CardDescription>{t('analyticsLast12Months')}</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? <ChartSkeleton /> : (
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
                {t('analyticsLoanStatusSplit')}
              </CardTitle>
              <CardDescription>{t('analyticsActiveVsReturned')}</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? <ChartSkeleton /> : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">{t('analyticsNoData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={statusPieData} cx="50%" cy="45%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                      {statusPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
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
                {t('analyticsTopLocations')}
              </CardTitle>
              <CardDescription>{t('analyticsAllTimeBorrows')}</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? <ChartSkeleton /> : locationBarData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">{t('analyticsNoData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={locationBarData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v} />
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
                {t('analyticsDepositMethods')}
              </CardTitle>
              <CardDescription>{t('analyticsCashVsCard')}</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? <ChartSkeleton /> : paymentMethodData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">{t('analyticsNoData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={paymentMethodData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {paymentMethodData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </details>

      {/* ── Shared dialogs ─────────────────────────────────────────────── */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{t('editTransaction')}</DialogTitle>
            <DialogDescription>{t('editTransactionDescription')}</DialogDescription>
          </DialogHeader>
          {editingTransaction && (
            <TransactionForm transaction={editingTransaction} locations={locations} onSuccess={closeEditDialog} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t('processRefund')}
            </DialogTitle>
            <DialogDescription>{t('processRefundDescription')}</DialogDescription>
          </DialogHeader>

          {refundTransaction && !confirmStep && (
            <div className="space-y-6 py-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">{t('borrower')}</span>
                  <span className="font-medium">{refundTransaction.borrowerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t('originalDeposit')}</span>
                  <span className="font-bold text-lg">${refundTransaction.depositAmount}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="full-refund" className="flex flex-col gap-1">
                  <span>{t('fullRefund')}</span>
                  <span className="text-xs text-muted-foreground font-normal">{t('refundEntireDeposit')}</span>
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
                  <Label htmlFor="refund-amount">{t('refundAmount')}</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="refund-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      max={refundTransaction.depositAmount || 0}
                      placeholder={t('enterRefundAmount')}
                      className="pl-9"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('maxRefund')}: ${refundTransaction.depositAmount}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="refund-notes">{t('refundNotes')}</Label>
                <Textarea
                  id="refund-notes"
                  placeholder={t('refundNotesPlaceholder')}
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
                <h4 className="font-semibold">{t('confirmRefundDetails')}</h4>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t('borrower')}</span>
                  <span className="font-medium">{refundTransaction.borrowerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t('originalDeposit')}</span>
                  <span>${refundTransaction.depositAmount}</span>
                </div>
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-sm font-medium">{t('refundAmount')}</span>
                  <span className="font-bold text-lg text-green-600">
                    ${isFullRefund ? refundTransaction.depositAmount : refundAmount}
                  </span>
                </div>
                {!isFullRefund && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('retained')}</span>
                    <span className="text-amber-600">
                      ${((refundTransaction.depositAmount || 0) - parseFloat(refundAmount || "0")).toFixed(2)}
                    </span>
                  </div>
                )}
                {refundNotes && (
                  <div className="border-t pt-2">
                    <span className="text-sm text-muted-foreground">{t('notes')}: </span>
                    <span className="text-sm">{refundNotes}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!confirmStep ? (
              <>
                <Button variant="outline" onClick={closeRefundDialog}>{t('cancel')}</Button>
                <Button
                  onClick={() => setConfirmStep(true)}
                  disabled={!isFullRefund && (!refundAmount || parseFloat(refundAmount) < 0)}
                >
                  {t('reviewRefund')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfirmStep(false)}>{t('back')}</Button>
                <Button
                  onClick={handleProcessRefund}
                  disabled={markReturnedMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {markReturnedMutation.isPending ? t('processing') : t('confirmAndProcessRefund')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
