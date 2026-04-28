import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Location, Transaction, GemachApplication, Contact } from "@/lib/types";
import { 
  Users, MapPin, FileText, Package, Settings, Grid, List, 
  DollarSign, RefreshCw, AlarmClock, CreditCard, CheckCircle, BarChart3, Mail, MessageSquare,
  Shield, AlertTriangle, BookOpen, Save
} from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";

interface DisputeSummaryRow {
  locationId: number;
  locationName: string;
  disputeCount: number;
  chargedCount: number;
  rate: number;
  flagged: boolean;
}
interface DisputeSummary {
  warnThreshold: number;
  windowDays: number;
  rows: DisputeSummaryRow[];
}

interface LocationFee { locationId: number; name: string; processingFeePercent: number; processingFeeFixed: number; }
interface StripeAdminSettings { maxCardAgeDays: number; requirePreChargeNotification: boolean; locationFees: LocationFee[]; }

function StripeSettingsCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<StripeAdminSettings>({
    queryKey: ["/api/admin/settings/stripe"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings/stripe", { credentials: "include" });
      return res.json();
    },
  });

  const [maxCardAgeDays, setMaxCardAgeDays] = useState<string>("");
  const [requireNotify, setRequireNotify] = useState<boolean>(false);
  const [feeEdits, setFeeEdits] = useState<Record<number, { processingFeePercent: string; processingFeeFixed: string }>>({});

  // Seed local state once data loads
  const [seeded, setSeeded] = useState(false);
  if (data && !seeded) {
    setMaxCardAgeDays(String(data.maxCardAgeDays));
    setRequireNotify(data.requirePreChargeNotification);
    const edits: typeof feeEdits = {};
    for (const loc of data.locationFees ?? []) {
      edits[loc.locationId] = {
        processingFeePercent: String(loc.processingFeePercent),
        processingFeeFixed: String(loc.processingFeeFixed),
      };
    }
    setFeeEdits(edits);
    setSeeded(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const locationFees = Object.entries(feeEdits).map(([id, v]) => ({
        locationId: Number(id),
        processingFeePercent: Number(v.processingFeePercent),
        processingFeeFixed: Number(v.processingFeeFixed),
      }));
      const res = await apiRequest("PATCH", "/api/admin/settings/stripe", {
        maxCardAgeDays: Number(maxCardAgeDays),
        requirePreChargeNotification: requireNotify,
        locationFees,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/stripe"] });
      setSeeded(false);
      toast({ title: "Saved", description: "Stripe settings updated." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-stripe-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Stripe charge settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Max card age (days)</label>
                <input
                  type="number" min={1} max={365}
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={maxCardAgeDays}
                  onChange={e => setMaxCardAgeDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">Cards older than this are blocked from off-session charges (default 90).</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Require pre-charge notification</label>
                <div className="flex items-center gap-2 mt-2">
                  <Switch checked={requireNotify} onCheckedChange={setRequireNotify} data-testid="switch-require-notify" />
                  <span className="text-sm">{requireNotify ? "Enforced" : "Best-effort (default)"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">When on, charges are blocked if the borrower cannot be notified.</p>
              </div>
            </div>

            {(data?.locationFees ?? []).length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Per-location processing fee (applied to card deposits)</p>
                <div className="space-y-2">
                  {(data?.locationFees ?? []).map(loc => (
                    <div key={loc.locationId} className="grid grid-cols-3 gap-2 items-center">
                      <span className="text-sm truncate">{loc.name}</span>
                      <div>
                        <label className="text-xs text-muted-foreground">% (basis pts)</label>
                        <input
                          type="number" min={0} max={10000}
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={feeEdits[loc.locationId]?.processingFeePercent ?? ""}
                          onChange={e => setFeeEdits(prev => ({ ...prev, [loc.locationId]: { ...prev[loc.locationId], processingFeePercent: e.target.value } }))}
                          title="Basis points: 290 = 2.90%"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Fixed (¢)</label>
                        <input
                          type="number" min={0} max={9999}
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={feeEdits[loc.locationId]?.processingFeeFixed ?? ""}
                          onChange={e => setFeeEdits(prev => ({ ...prev, [loc.locationId]: { ...prev[loc.locationId], processingFeeFixed: e.target.value } }))}
                          title="Cents: 30 = $0.30"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? "Saving…" : "Save settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StripeRiskCard() {
  const { data: summary, isLoading } = useQuery<DisputeSummary>({
    queryKey: ["/api/admin/disputes/summary"],
  });

  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const flagged = summary?.rows?.filter(r => r.flagged) ?? [];
  const totalDisputes = summary?.rows?.reduce((acc, r) => acc + r.disputeCount, 0) ?? 0;

  return (
    <Card data-testid="card-stripe-risk">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Stripe risk (last {summary?.windowDays ?? 30} days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading dispute data…</p>
        ) : !summary || summary.rows.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm">No disputes in the last {summary?.windowDays ?? 30} days.</p>
            <p className="text-xs text-muted-foreground">
              Stripe enforces a network-wide 0.7% dispute ceiling. We warn at {fmtPct(summary?.warnThreshold ?? 0.005)}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Total disputes</span>
              <Badge variant={flagged.length > 0 ? "destructive" : "secondary"}>
                {totalDisputes}
              </Badge>
            </div>
            {flagged.length > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3">
                <div className="flex items-start gap-2 text-red-900">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold mb-1">
                      {flagged.length} location(s) over the {fmtPct(summary.warnThreshold)} warning threshold
                    </p>
                    <ul className="space-y-1">
                      {flagged.slice(0, 5).map(r => (
                        <li key={r.locationId} data-testid={`row-flagged-location-${r.locationId}`}>
                          {r.locationName} — {r.disputeCount} disputes / {r.chargedCount} charges ({fmtPct(r.rate)})
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">View all locations</summary>
              <ul className="mt-2 space-y-1">
                {summary.rows.map(r => (
                  <li key={r.locationId} className="flex justify-between">
                    <span>{r.locationName}</span>
                    <span className={r.flagged ? "text-red-700 font-semibold" : ""}>
                      {r.disputeCount}/{r.chargedCount} ({fmtPct(r.rate)})
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
        <div className="mt-4 pt-3 border-t">
          <a
            href="/api/admin/docs/stripe-operations"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            data-testid="link-stripe-runbook"
          >
            <BookOpen className="h-4 w-4" />
            Stripe operations runbook
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

type ViewMode = 'grid' | 'list' | 'compact';
type DashboardSection = 'overview' | 'locations' | 'transactions' | 'applications' | 'analytics';

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const { t } = useLanguage();
  
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: applications = [] } = useQuery<GemachApplication[]>({
    queryKey: ["/api/applications"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contact"],
  });

  const pendingApplications = applications.filter(app => app.status === "pending").length;
  const activeLocations = locations.filter(loc => loc.isActive).length;
  const pendingReturns = transactions.filter(tx => !tx.isReturned).length;
  const unreadContacts = contacts.filter(c => !c.isRead).length;
  const depositTotal = transactions.reduce((acc, tx) => acc + tx.depositAmount, 0);

  const StatsCard = ({ title, value, subtitle, icon: Icon, className = "" }: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: any;
    className?: string;
  }) => (
    <Card className={className}>
      <CardContent className={viewMode === 'compact' ? 'p-4' : 'pt-6'}>
        <div className={`flex items-center ${viewMode === 'list' ? 'justify-start gap-4' : 'justify-between'}`}>
          <div>
            <p className={`text-sm text-muted-foreground ${viewMode === 'compact' ? 'text-xs' : ''}`}>
              {title}
            </p>
            <p className={`font-bold ${viewMode === 'compact' ? 'text-lg' : 'text-2xl'}`}>
              {value}
            </p>
          </div>
          <div className={`p-2 bg-primary/10 rounded-full ${viewMode === 'compact' ? 'p-1' : ''}`}>
            <Icon className={`text-primary ${viewMode === 'compact' ? 'h-4 w-4' : 'h-6 w-6'}`} />
          </div>
        </div>
        <p className={`text-xs text-muted-foreground mt-2 ${viewMode === 'compact' ? 'text-[10px]' : ''}`}>
          {subtitle}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold">{t('adminDashboard')}</h1>
          
          {/* View Controls */}
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  {t('viewOptions')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('dashboardLayout')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setViewMode('grid')}>
                  <Grid className="h-4 w-4 mr-2" />
                  {t('gridView')}
                  {viewMode === 'grid' && <Badge variant="secondary" className="ml-auto">{t('active')}</Badge>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('list')}>
                  <List className="h-4 w-4 mr-2" />
                  {t('listView')}
                  {viewMode === 'list' && <Badge variant="secondary" className="ml-auto">{t('active')}</Badge>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('compact')}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {t('compactView')}
                  {viewMode === 'compact' && <Badge variant="secondary" className="ml-auto">{t('active')}</Badge>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Section Navigation */}
        <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as DashboardSection)} className="mb-8">
          <div className="w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsList className="flex w-max min-w-full justify-start sm:grid sm:w-full sm:grid-cols-5">
              <TabsTrigger value="overview" className="whitespace-nowrap px-4">{t('overview')}</TabsTrigger>
              <TabsTrigger value="locations" className="whitespace-nowrap px-4">{t('locations')}</TabsTrigger>
              <TabsTrigger value="transactions" className="whitespace-nowrap px-4">{t('transactions')}</TabsTrigger>
              <TabsTrigger value="applications" className="whitespace-nowrap px-4">{t('applications')}</TabsTrigger>
              <TabsTrigger value="analytics" className="whitespace-nowrap px-4">{t('analytics')}</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="overview">
            {/* Stats Cards - Responsive based on view mode */}
            <div className={`gap-6 mb-8 ${
              viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4' :
              viewMode === 'list' ? 'space-y-4' :
              'grid grid-cols-2 lg:grid-cols-6'
            }`}>
              <StatsCard
                title={t('totalLocations')}
                value={locations.length}
                subtitle={`${activeLocations} ${t('activeLocations')}`}
                icon={MapPin}
              />
              
              <StatsCard
                title={t('depositsHeld')}
                value={`$${depositTotal}`}
                subtitle={`${pendingReturns} ${t('pendingReturns')}`}
                icon={DollarSign}
              />
              
              <StatsCard
                title={t('newApplications')}
                value={pendingApplications}
                subtitle={t('waitingForReview')}
                icon={FileText}
              />
              
              <StatsCard
                title={t('unreadMessages')}
                value={unreadContacts}
                subtitle={t('requiresAttention')}
                icon={AlarmClock}
              />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    {t('quickActions')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link href="/admin/locations">
                    <Button className="w-full" variant="outline">
                      {t('manageLocations')}
                    </Button>
                  </Link>
                  <Link href="/admin/transactions">
                    <Button className="w-full" variant="outline">
                      {t('viewTransactions')}
                    </Button>
                  </Link>
                  <Link href="/admin/applications">
                    <Button className="w-full" variant="outline">
                      {t('reviewApplications')}
                    </Button>
                  </Link>
                  <Link href="/admin/inbox">
                    <Button className="w-full" variant="outline">
                      <Mail className="h-4 w-4 mr-2" />
                      {t('inboxTitle')}
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlarmClock className="h-5 w-5" />
                    {t('recentActivity')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className="font-medium">{t('latestTransaction')}</p>
                      <p className="text-muted-foreground">
                        {transactions.length > 0 ? t('recentDepositProcessed') : t('noRecentActivity')}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{t('newApplications')}</p>
                      <p className="text-muted-foreground">
                        {pendingApplications} {t('pendingReview')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <StripeSettingsCard />
              <StripeRiskCard />

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {t('systemStatus')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">{t('paymentProcessingStatus')}</span>
                      <Badge variant="default">{t('active')}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">{t('locationNetwork')}</span>
                      <Badge variant="default">{t('online')}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">{t('database')}</span>
                      <Badge variant="default">{t('connected')}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="locations">
            <Card>
              <CardHeader>
                <CardTitle>{t('locationManagementTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p>{t('manageAllGemachLocations')}</p>
                    <Link href="/admin/locations">
                      <Button>{t('viewAllLocations')}</Button>
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">{locations.length}</p>
                      <p className="text-sm text-muted-foreground">{t('totalLocations')}</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">{activeLocations}</p>
                      <p className="text-sm text-muted-foreground">{t('active')}</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">{locations.length - activeLocations}</p>
                      <p className="text-sm text-muted-foreground">{t('inactive')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>{t('transactionOverview')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p>{t('monitorDeposits')}</p>
                    <Link href="/admin/transactions">
                      <Button>{t('viewTransactions')}</Button>
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">${depositTotal}</p>
                      <p className="text-sm text-muted-foreground">{t('totalDeposits')}</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">{pendingReturns}</p>
                      <p className="text-sm text-muted-foreground">{t('pendingReturns')}</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">{transactions.filter(tx => tx.isReturned).length}</p>
                      <p className="text-sm text-muted-foreground">{t('completed')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applications">
            <Card>
              <CardHeader>
                <CardTitle>{t('applicationManagement')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p>{t('reviewApproveApplications')}</p>
                    <Link href="/admin/applications">
                      <Button>{t('reviewApplications')}</Button>
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">{applications.length}</p>
                      <p className="text-sm text-muted-foreground">{t('totalApplications')}</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold text-orange-600">{pendingApplications}</p>
                      <p className="text-sm text-muted-foreground">{t('pendingReview')}</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{applications.filter(app => app.status === "approved").length}</p>
                      <p className="text-sm text-muted-foreground">{t('approved')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>{t('analyticsReports')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p>{t('comprehensiveAnalytics')}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2">{t('usageStatistics')}</h3>
                      <p className="text-sm text-muted-foreground">{t('trackLocationPerformance')}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2">{t('financialReports')}</h3>
                      <p className="text-sm text-muted-foreground">{t('monitorDepositsReturns')}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2">{t('regionalAnalysis')}</h3>
                      <p className="text-sm text-muted-foreground">{t('comparePerformance')}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2">{t('growthMetrics')}</h3>
                      <p className="text-sm text-muted-foreground">{t('trackExpansion')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
