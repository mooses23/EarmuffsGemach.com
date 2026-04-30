import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Shield, AlertTriangle, BookOpen, Phone, Bell
} from "lucide-react";
import { Link } from "wouter";
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

function GmailDisconnectedWarning() {
  const [showInstructions, setShowInstructions] = useState(false);
  return (
    <div className="mb-4" data-testid="card-gmail-disconnected">
      <Card className="border-yellow-300 bg-yellow-50">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-yellow-900">Gmail is not connected</p>
              <p className="text-sm text-yellow-800 mt-0.5">
                Email delivery is currently disabled. Confirmation emails, admin alerts, and welcome messages will not be sent.
              </p>
              {showInstructions && (
                <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-100 p-3 text-sm text-yellow-900 space-y-1">
                  <p className="font-medium">How to reconnect Gmail:</p>
                  <ol className="list-decimal list-inside space-y-1 text-yellow-800">
                    <li>Open Replit and click the <strong>puzzle piece</strong> icon in the left sidebar.</li>
                    <li>Find the <strong>Google Mail</strong> integration.</li>
                    <li>Click <strong>Connect</strong> and complete the OAuth authorization flow.</li>
                    <li>Return to this dashboard — the warning will disappear once Gmail is connected.</li>
                  </ol>
                </div>
              )}
            </div>
            <button
              className="text-sm font-medium text-yellow-700 hover:text-yellow-900 hover:underline whitespace-nowrap"
              data-testid="link-gmail-reconnect"
              onClick={() => setShowInstructions(v => !v)}
            >
              {showInstructions ? "Hide instructions" : "How to reconnect →"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NoNotificationEmailWarning() {
  return (
    <div className="mb-4" data-testid="card-no-notification-email">
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-900">No notification email configured</p>
              <p className="text-sm text-amber-800 mt-0.5">
                New application alerts and system notifications will not be delivered until an admin email address is set.
              </p>
            </div>
            <Link
              href="/admin/locations"
              onClick={() => {
                try {
                  localStorage.setItem("gemachhub:notificationSettingsPanelOpen", "true");
                } catch {}
              }}
              className="text-sm font-medium text-amber-700 hover:text-amber-900 hover:underline whitespace-nowrap"
              data-testid="link-notification-settings"
            >
              Configure now →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
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
export default function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
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

  const { data: gmailStatus } = useQuery<{ configured: boolean; environment: string; message: string }>({
    queryKey: ["/api/admin/emails/status"],
    staleTime: 60_000,
  });

  const { data: notifStatus } = useQuery<{ adminEmail: string; effectiveEmail: string; source: "db" | "env" | "none" }>({
    queryKey: ["/api/admin/settings/notifications"],
    staleTime: 60_000,
  });

  const pendingApplications = applications.filter(app => app.status === "pending").length;
  const activeLocations = locations.filter(loc => loc.isActive).length;
  const pendingReturns = transactions.filter(tx => !tx.isReturned).length;
  const unreadContacts = contacts.filter(c => !c.isRead).length;
  const depositTotal = transactions.reduce((acc, tx) => acc + tx.depositAmount, 0);

  const phonelessCount = locations.filter(
    loc => loc.isActive !== false && !loc.phone && !loc.onboardedAt
  ).length;

  const StatsCard = ({ title, value, subtitle, icon: Icon, className = "", href, testId }: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: any;
    className?: string;
    href?: string;
    testId?: string;
  }) => {
    const card = (
      <Card className={`${className} ${href ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} data-testid={testId}>
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
    return href ? <Link href={href}>{card}</Link> : card;
  };

  return (
    <>
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
                href="/admin/applications"
                testId="card-pending-applications"
              />
              
              <StatsCard
                title={t('unreadMessages')}
                value={unreadContacts}
                subtitle={t('requiresAttention')}
                icon={AlarmClock}
              />
            </div>

            {/* Gmail disconnected warning */}
            {gmailStatus && !gmailStatus.configured && (
              <GmailDisconnectedWarning />
            )}

            {/* No notification email warning */}
            {notifStatus && notifStatus.source === "none" && (
              <NoNotificationEmailWarning />
            )}

            {/* Phone-less locations warning */}
            {phonelessCount > 0 && (
              <div className="mb-8" data-testid="card-phoneless-locations">
                <Card className="border-orange-300 bg-orange-50">
                  <CardContent className="pt-5">
                    <div className="flex items-start gap-3">
                      <Phone className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-orange-900">
                          {phonelessCount} location{phonelessCount !== 1 ? "s" : ""} without a phone number
                        </p>
                        <p className="text-sm text-orange-800 mt-0.5">
                          {phonelessCount !== 1 ? "These locations" : "This location"} cannot receive SMS onboarding messages until a phone number is added.
                        </p>
                      </div>
                      <Link
                        href="/admin/locations"
                        onClick={() => {
                          try {
                            localStorage.setItem("adminOnboardingFilter", "no-phone");
                          } catch {}
                        }}
                        className="text-sm font-medium text-orange-700 hover:text-orange-900 hover:underline whitespace-nowrap"
                        data-testid="link-phoneless-locations"
                      >
                        View affected locations →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

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
    </>
  );
}
