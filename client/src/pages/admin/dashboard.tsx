import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Location, Transaction, GemachApplication, Contact } from "@/lib/types";
import { 
  Users, MapPin, FileText, Package, Settings, Grid, List, 
  DollarSign, RefreshCw, AlarmClock, CheckCircle, BarChart3, Mail, MessageSquare,
  Shield, AlertTriangle, BookOpen
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/hooks/use-language";

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
type DashboardSection = 'overview';

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const { t } = useLanguage();
  const [currentPath] = useLocation();
  
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
              <Link href="/admin/locations" className={`whitespace-nowrap px-4 inline-flex items-center justify-center rounded-sm py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-muted/50 ${currentPath === '/admin/locations' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                {t('locations')}
              </Link>
              <Link href="/admin/transactions" className={`whitespace-nowrap px-4 inline-flex items-center justify-center rounded-sm py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-muted/50 ${currentPath === '/admin/transactions' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                {t('transactions')}
              </Link>
              <Link href="/admin/applications" className={`whitespace-nowrap px-4 inline-flex items-center justify-center rounded-sm py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-muted/50 ${currentPath === '/admin/applications' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                {t('applications')}
              </Link>
              <Link href="/admin/analytics" className={`whitespace-nowrap px-4 inline-flex items-center justify-center rounded-sm py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-muted/50 ${currentPath === '/admin/analytics' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                {t('analytics')}
              </Link>
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

        </Tabs>
      </div>
    </div>
  );
}
