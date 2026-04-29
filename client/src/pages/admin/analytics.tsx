import { useMemo } from "react";
import type { ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, DollarSign, MapPin, Package, RotateCcw, Users } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { AdminNavTabs } from "@/components/admin/admin-nav-tabs";
import type { Transaction, Location } from "@shared/schema";

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

export default function AdminAnalytics() {
  const { t } = useLanguage();

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: locations = [], isLoading: locLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: applications = [], isLoading: appLoading } = useQuery<{ id: number; status: string; submittedAt: string }[]>({
    queryKey: ["/api/applications"],
  });

  const locationMap = useMemo(() => {
    const m = new Map<number, string>();
    locations.forEach((l) => m.set(l.id, l.name));
    return m;
  }, [locations]);

  const isLoading = txLoading || locLoading || appLoading;

  // KPIs
  const totalTransactions = transactions.length;
  const returnedCount = transactions.filter((t) => t.isReturned).length;
  const activeBorrows = totalTransactions - returnedCount;
  const returnRate = totalTransactions > 0
    ? Math.round((returnedCount / totalTransactions) * 100)
    : 0;
  const totalDeposits = transactions.reduce((sum, t) => sum + (t.depositAmount ?? 0), 0);

  // Borrow volume by month (last 12 months)
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

    return months.map((m) => ({
      month: formatMonth(m),
      Borrows: borrowCounts[m],
      Returns: returnCounts[m],
    }));
  }, [transactions]);

  // Active vs returned pie
  const statusPieData = useMemo(() => [
    { name: "Active", value: activeBorrows },
    { name: "Returned", value: returnedCount },
  ], [activeBorrows, returnedCount]);

  // Top 8 locations by borrow count
  const locationBarData = useMemo(() => {
    const counts: Record<number, number> = {};
    transactions.forEach((tx) => {
      counts[tx.locationId] = (counts[tx.locationId] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, count]) => ({
        name: locationMap.get(Number(id)) ?? `Location ${id}`,
        Borrows: count,
      }))
      .sort((a, b) => b.Borrows - a.Borrows)
      .slice(0, 8);
  }, [transactions, locationMap]);

  // Deposit payment method breakdown
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

  // Applications over time (last 12 months)
  const appsByMonth = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(getMonthKey(d));
    }
    const counts: Record<string, number> = {};
    months.forEach((m) => { counts[m] = 0; });
    applications.forEach((app) => {
      const key = getMonthKey(new Date(app.submittedAt));
      if (counts[key] !== undefined) counts[key]++;
    });
    return months.map((m) => ({ month: formatMonth(m), Applications: counts[m] }));
  }, [applications]);

  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
        <AdminNavTabs />

        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t("analyticsReports")}</h1>
          <p className="text-muted-foreground mt-2">{t("comprehensiveAnalytics")}</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Package}
            title={t("analyticsTotalBorrows")}
            value={totalTransactions}
            loading={isLoading}
          />
          <StatCard
            icon={TrendingUp}
            title={t("analyticsActiveLoans")}
            value={activeBorrows}
            sub={totalTransactions > 0 ? `${Math.round((activeBorrows / totalTransactions) * 100)}% ${t("analyticsOfAllBorrows")}` : undefined}
            loading={isLoading}
          />
          <StatCard
            icon={RotateCcw}
            title={t("analyticsReturnRate")}
            value={totalTransactions > 0 ? `${returnRate}%` : "—"}
            sub={totalTransactions > 0 ? `${returnedCount} ${t("analyticsReturned")}` : undefined}
            loading={isLoading}
          />
          <StatCard
            icon={DollarSign}
            title={t("analyticsDepositsCollected")}
            value={`$${totalDeposits.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            sub={totalTransactions > 0 ? `${t("analyticsAcrossTransactions")} ${totalTransactions}` : undefined}
            loading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Borrow & Return Volume (spans 2 cols) */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                {t("analyticsMonthlyVolume")}
              </CardTitle>
              <CardDescription>{t("analyticsLast12Months")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={volumeByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Borrows" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Returns" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Active vs Returned Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                {t("analyticsLoanStatusSplit")}
              </CardTitle>
              <CardDescription>{t("analyticsActiveVsReturned")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton />
              ) : totalTransactions === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">{t("analyticsNoData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Top Locations */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {t("analyticsTopLocations")}
              </CardTitle>
              <CardDescription>{t("analyticsAllTimeBorrows")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton />
              ) : locationBarData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">{t("analyticsNoData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={locationBarData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      width={120}
                      tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v}
                    />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="Borrows" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Payment Method Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                {t("analyticsDepositMethods")}
              </CardTitle>
              <CardDescription>{t("analyticsCashVsCard")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton />
              ) : paymentMethodData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">{t("analyticsNoData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={paymentMethodData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {paymentMethodData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Applications Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-muted-foreground" />
              {t("analyticsNewApplications")}
            </CardTitle>
            <CardDescription>{t("analyticsMonthlyApplications")}</CardDescription>
          </CardHeader>
          <CardContent>
            {appLoading ? (
              <ChartSkeleton height={200} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={appsByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Line
                    type="monotone"
                    dataKey="Applications"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: CHART_COLORS[0] }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
