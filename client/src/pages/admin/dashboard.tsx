import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Location, Transaction, GemachApplication, Contact } from "@/lib/types";
import {
  MapPin, FileText, Settings, Grid, List,
  DollarSign, AlarmClock, BarChart3, Mail, MessageSquare,
  Shield, AlertTriangle, BookOpen, Phone, Bell, X,
  CheckCircle2, XCircle, Download, Send, MailCheck, Plus,
  ArrowRight, Activity,
} from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ViewMode = 'grid' | 'list' | 'compact';
const VIEW_MODE_KEY = "gemachhub:adminDashboardView";
const DISMISSED_KEY = "gemachhub:adminDashboardDismissed";

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
interface SystemStatus {
  database: { ok: boolean; latencyMs?: number; error?: string };
  stripe: { ok: boolean; configured: boolean; latencyMs?: number; error?: string };
  gmail: { ok: boolean; configured: boolean; message?: string };
}
interface ActivityItem {
  kind: "transaction" | "application" | "contact";
  id: number;
  at: string;
  action?: "lent" | "returned";
  name: string;
  subtitle: string;
  href: string;
}

type Severity = "critical" | "warning" | "info";
interface AlertRow {
  id: string;
  severity: Severity;
  icon: any;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

function getInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'compact';
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === 'grid' || v === 'list' || v === 'compact') return v;
  } catch {}
  return 'compact';
}

function getInitialDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((s) => typeof s === 'string'));
  } catch {}
  return new Set();
}

function fmtCurrency(amount: number, language: string) {
  try {
    return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(0)}`;
  }
}

function fmtRelative(iso: string, language: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  try {
    const rtf = new Intl.RelativeTimeFormat(language === 'he' ? 'he-IL' : 'en-US', { numeric: 'auto' });
    if (min < 1) return rtf.format(0, 'minute');
    if (min < 60) return rtf.format(-min, 'minute');
    if (hr < 24) return rtf.format(-hr, 'hour');
    if (day < 30) return rtf.format(-day, 'day');
    return d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US');
  } catch {
    return d.toLocaleString();
  }
}

function GmailReconnectInstructions({ open }: { open: boolean }) {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-100 p-3 text-sm text-yellow-900 space-y-1">
      <p className="font-medium">{t('howToReconnectGmail')}:</p>
      <ol className="list-decimal list-inside space-y-1 text-yellow-800">
        <li>{t('gmailStep1')}</li>
        <li>{t('gmailStep2')}</li>
        <li>{t('gmailStep3')}</li>
        <li>{t('gmailStep4')}</li>
      </ol>
    </div>
  );
}

const SEV_STYLES: Record<Severity, { bar: string; text: string; badge: string; icon: string }> = {
  critical: { bar: 'border-red-300 bg-red-50', text: 'text-red-900', badge: 'bg-red-600 text-white', icon: 'text-red-600' },
  warning:  { bar: 'border-amber-300 bg-amber-50', text: 'text-amber-900', badge: 'bg-amber-500 text-white', icon: 'text-amber-600' },
  info:     { bar: 'border-blue-300 bg-blue-50', text: 'text-blue-900', badge: 'bg-blue-500 text-white', icon: 'text-blue-600' },
};

function NeedsAttentionPanel({ alerts, dismissed, onDismiss }: {
  alerts: AlertRow[];
  dismissed: Set<string>;
  onDismiss: (id: string) => void;
}) {
  const { t } = useLanguage();
  const visible = alerts.filter(a => !dismissed.has(a.id));
  const [gmailOpen, setGmailOpen] = useState(false);

  // Group by severity (critical → warning → info) and add per-severity counts.
  const order: Severity[] = ['critical', 'warning', 'info'];
  const grouped = order
    .map((sev) => ({ sev, items: visible.filter((a) => a.severity === sev) }))
    .filter((g) => g.items.length > 0);
  const counts = {
    critical: visible.filter((a) => a.severity === 'critical').length,
    warning: visible.filter((a) => a.severity === 'warning').length,
    info: visible.filter((a) => a.severity === 'info').length,
  };

  return (
    <Card className="mb-6" data-testid="card-needs-attention">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {t('needsAttention')}
          <Badge variant={visible.length > 0 ? 'destructive' : 'secondary'} className="ml-2" data-testid="badge-attention-count">
            {visible.length}
          </Badge>
          {counts.critical > 0 && (
            <Badge className={`${SEV_STYLES.critical.badge}`} data-testid="badge-attention-critical">
              {t('severityCritical')}: {counts.critical}
            </Badge>
          )}
          {counts.warning > 0 && (
            <Badge className={`${SEV_STYLES.warning.badge}`} data-testid="badge-attention-warning">
              {t('severityWarning')}: {counts.warning}
            </Badge>
          )}
          {counts.info > 0 && (
            <Badge className={`${SEV_STYLES.info.badge}`} data-testid="badge-attention-info">
              {t('severityInfo')}: {counts.info}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            {t('nothingNeedsAttention')}
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ sev: sevKey, items }) => (
              <div key={sevKey} data-testid={`alert-group-${sevKey}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${SEV_STYLES[sevKey].text}`}>
                  {t(sevKey === 'critical' ? 'severityCritical' : sevKey === 'warning' ? 'severityWarning' : 'severityInfo')}
                  {' '}({items.length})
                </p>
                <ul className="space-y-2">
                  {items.map((a) => {
                    const sev = SEV_STYLES[a.severity];
                    const Icon = a.icon;
                    const isGmail = a.id === 'gmail';
                    return (
                      <li
                        key={a.id}
                        className={`rounded-md border ${sev.bar} p-3`}
                        data-testid={`alert-row-${a.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${sev.icon}`} aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={`${sev.badge} uppercase text-[10px] px-1.5 py-0`}>
                                {t(a.severity === 'critical' ? 'severityCritical' : a.severity === 'warning' ? 'severityWarning' : 'severityInfo')}
                              </Badge>
                              <p className={`font-semibold ${sev.text}`}>{a.title}</p>
                            </div>
                            <p className={`text-sm mt-1 ${sev.text} opacity-90`}>{a.body}</p>
                            {isGmail && <GmailReconnectInstructions open={gmailOpen} />}
                            <div className="mt-2 flex flex-wrap gap-3 items-center">
                              {a.action && (
                                <button
                                  type="button"
                                  onClick={a.action.onClick}
                                  className={`text-sm font-medium ${sev.text} hover:underline inline-flex items-center gap-1`}
                                  data-testid={`alert-action-${a.id}`}
                                >
                                  {a.action.label}
                                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                                </button>
                              )}
                              {isGmail && (
                                <button
                                  type="button"
                                  onClick={() => setGmailOpen(v => !v)}
                                  className={`text-sm font-medium ${sev.text} hover:underline`}
                                >
                                  {gmailOpen ? t('hideInstructions') : t('showInstructions')}
                                </button>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDismiss(a.id)}
                            aria-label={t('dismiss')}
                            className={`p-1 rounded hover:bg-black/5 ${sev.text}`}
                            data-testid={`alert-dismiss-${a.id}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatTileSkeleton({ compact }: { compact: boolean }) {
  return (
    <Card>
      <CardContent className={compact ? 'p-4' : 'pt-6'}>
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className={compact ? 'h-5 w-16' : 'h-7 w-24'} />
          </div>
          <Skeleton className={compact ? 'h-7 w-7 rounded-full' : 'h-10 w-10 rounded-full'} />
        </div>
        <Skeleton className="h-3 w-28 mt-3" />
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [dismissed, setDismissed] = useState<Set<string>>(getInitialDismissed);

  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch {}
  }, [viewMode]);

  useEffect(() => {
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(dismissed))); } catch {}
  }, [dismissed]);

  const dismiss = (id: string) => setDismissed(prev => {
    const next = new Set(prev); next.add(id); return next;
  });

  const locationsQ = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const transactionsQ = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });
  const applicationsQ = useQuery<GemachApplication[]>({ queryKey: ["/api/applications"] });
  const contactsQ = useQuery<Contact[]>({ queryKey: ["/api/contact"] });
  const gmailQ = useQuery<{ configured: boolean; environment: string; message: string }>({
    queryKey: ["/api/admin/emails/status"], staleTime: 60_000,
  });
  const notifQ = useQuery<{ adminEmail: string; effectiveEmail: string; source: "db" | "env" | "none" }>({
    queryKey: ["/api/admin/settings/notifications"], staleTime: 60_000,
  });
  const disputesQ = useQuery<DisputeSummary>({ queryKey: ["/api/admin/disputes/summary"] });
  const statusQ = useQuery<SystemStatus>({
    queryKey: ["/api/admin/system/status"], staleTime: 30_000,
  });
  const activityQ = useQuery<ActivityItem[]>({
    queryKey: ["/api/admin/recent-activity"], staleTime: 30_000,
  });

  const locations = locationsQ.data ?? [];
  const transactions = transactionsQ.data ?? [];
  const applications = applicationsQ.data ?? [];
  const contacts = contactsQ.data ?? [];

  const pendingApplications = applications.filter(app => app.status === "pending").length;
  const activeLocations = locations.filter(loc => loc.isActive).length;
  const pendingReturns = transactions.filter(tx => !tx.isReturned).length;
  const unreadContacts = contacts.filter(c => !c.isRead).length;
  const depositTotal = transactions
    .filter(tx => !tx.isReturned)
    .reduce((acc, tx) => acc + (tx.depositAmount || 0), 0);

  const phonelessCount = locations.filter(
    loc => loc.isActive !== false && !loc.phone && !loc.onboardedAt
  ).length;

  const flaggedLocations = (disputesQ.data?.rows ?? []).filter(r => r.flagged);

  // Build alerts
  const alerts: AlertRow[] = [];
  if (gmailQ.data && !gmailQ.data.configured) {
    alerts.push({
      id: 'gmail',
      severity: 'critical',
      icon: Mail,
      title: t('gmailNotConnected'),
      body: t('gmailNotConnectedBody'),
    });
  }
  if (notifQ.data && notifQ.data.source === 'none') {
    alerts.push({
      id: 'notif-email',
      severity: 'warning',
      icon: Bell,
      title: t('noNotificationEmail'),
      body: t('noNotificationEmailBody'),
      action: {
        label: t('configureNow'),
        onClick: () => {
          try { localStorage.setItem("gemachhub:notificationSettingsPanelOpen", "true"); } catch {}
          window.location.href = "/admin/locations";
        },
      },
    });
  }
  if (phonelessCount > 0) {
    alerts.push({
      id: 'phoneless',
      severity: 'warning',
      icon: Phone,
      title: t('phonelessLocationsTitle').replace('{count}', String(phonelessCount)),
      body: t('phonelessLocationsBody'),
      action: {
        label: t('viewAffectedLocations'),
        onClick: () => {
          try { localStorage.setItem("adminOnboardingFilter", "no-phone"); } catch {}
          window.location.href = "/admin/locations";
        },
      },
    });
  }
  if (flaggedLocations.length > 0 && disputesQ.data) {
    const pct = `${(disputesQ.data.warnThreshold * 100).toFixed(2)}%`;
    alerts.push({
      id: 'stripe-risk',
      severity: 'critical',
      icon: Shield,
      title: t('stripeRiskTitle'),
      body: t('stripeRiskBody').replace('{count}', String(flaggedLocations.length)).replace('{threshold}', pct),
      action: {
        label: t('viewStripeRunbook'),
        onClick: () => window.open("/api/admin/docs/stripe-operations", "_blank"),
      },
    });
  }

  // Mark all messages read mutation
  const markAllReadMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/contact/mark-all-read");
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact"] });
      toast({
        title: data.updated > 0
          ? t('markedAllRead').replace('{count}', String(data.updated))
          : t('nothingToMark'),
      });
    },
    onError: (err: Error) => {
      toast({ title: t('failed'), description: err.message, variant: "destructive" });
    },
  });

  // Stats grid layout per view mode
  const gridCls = viewMode === 'grid'
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
    : viewMode === 'list'
      ? 'grid grid-cols-1'
      : 'grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4';

  const StatTile = ({ title, value, subtitle, icon: Icon, href, testId }: {
    title: string; value: React.ReactNode; subtitle: string; icon: any;
    href: string; testId: string;
  }) => {
    const isCompact = viewMode === 'compact';
    return (
      <Link href={href}>
        <Card
          className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all focus-within:ring-2 focus-within:ring-primary"
          data-testid={testId}
          tabIndex={0}
        >
          <CardContent className={isCompact ? 'p-4' : 'pt-6'}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={`text-muted-foreground ${isCompact ? 'text-xs' : 'text-sm'}`}>{title}</p>
                <p className={`font-bold ${isCompact ? 'text-lg' : 'text-2xl'}`} data-testid={`${testId}-value`}>
                  {value}
                </p>
              </div>
              <div className={`bg-primary/10 rounded-full ${isCompact ? 'p-1.5' : 'p-2'}`}>
                <Icon className={`text-primary ${isCompact ? 'h-4 w-4' : 'h-6 w-6'}`} />
              </div>
            </div>
            <p className={`text-muted-foreground mt-2 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
              {subtitle}
            </p>
          </CardContent>
        </Card>
      </Link>
    );
  };

  const statsLoading = locationsQ.isLoading || transactionsQ.isLoading || applicationsQ.isLoading || contactsQ.isLoading;

  // Recent activity
  const renderActivity = () => {
    if (activityQ.isLoading) {
      return (
        <ul className="space-y-3">
          {[0,1,2,3].map(i => (
            <li key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </li>
          ))}
        </ul>
      );
    }
    const items = activityQ.data ?? [];
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground">{t('noActivityYet')}</p>;
    }
    const iconFor = (k: ActivityItem['kind']) =>
      k === 'transaction' ? DollarSign : k === 'application' ? FileText : MessageSquare;
    return (
      <ul className="space-y-2.5">
        {items.slice(0, 8).map((it) => {
          const Icon = iconFor(it.kind);
          const titleKey =
            it.kind === 'transaction'
              ? (it.action === 'returned' ? 'activityTransactionReturned' : 'activityTransactionLent')
              : it.kind === 'application'
                ? 'activityApplicationNew'
                : 'activityContactNew';
          const title = t(titleKey as any).replace('{name}', it.name);
          return (
            <li key={`${it.kind}-${it.id}`}>
              <Link
                href={it.href}
                className="flex items-start gap-2 text-sm hover:bg-muted/50 -mx-2 px-2 py-1 rounded"
                data-testid={`activity-${it.kind}-${it.id}`}
              >
                <Icon className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {it.subtitle} · {fmtRelative(it.at, language)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  };

  // System status row helper
  const StatusRow = ({ label, ok, configured, detail, testId }: {
    label: string; ok: boolean; configured: boolean; detail?: string; testId: string;
  }) => {
    const variant: "default" | "destructive" | "secondary" = !configured ? "secondary" : ok ? "default" : "destructive";
    const labelKey = !configured ? 'statusNotConfigured' : ok ? 'statusOk' : 'statusDown';
    const Icon = !configured ? AlertTriangle : ok ? CheckCircle2 : XCircle;
    return (
      <div className="flex justify-between items-center" data-testid={testId}>
        <span className="text-sm flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${!configured ? 'text-muted-foreground' : ok ? 'text-green-600' : 'text-red-600'}`} aria-hidden="true" />
          {label}
        </span>
        <div className="flex items-center gap-2">
          {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
          <Badge variant={variant}>{t(labelKey as any)}</Badge>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('adminDashboard')}</h1>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="btn-view-options">
                <Settings className="h-4 w-4 mr-2" />
                {t('viewOptions')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('dashboardLayout')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setViewMode('compact')} data-testid="menu-view-compact">
                <BarChart3 className="h-4 w-4 mr-2" />
                {t('compactView')}
                {viewMode === 'compact' && <Badge variant="secondary" className="ml-auto">{t('active')}</Badge>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('grid')} data-testid="menu-view-grid">
                <Grid className="h-4 w-4 mr-2" />
                {t('gridView')}
                {viewMode === 'grid' && <Badge variant="secondary" className="ml-auto">{t('active')}</Badge>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('list')} data-testid="menu-view-list">
                <List className="h-4 w-4 mr-2" />
                {t('listView')}
                {viewMode === 'list' && <Badge variant="secondary" className="ml-auto">{t('active')}</Badge>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stat tiles */}
      <div className={`gap-4 mb-6 ${gridCls}`}>
        {statsLoading ? (
          <>
            <StatTileSkeleton compact={viewMode === 'compact'} />
            <StatTileSkeleton compact={viewMode === 'compact'} />
            <StatTileSkeleton compact={viewMode === 'compact'} />
            <StatTileSkeleton compact={viewMode === 'compact'} />
          </>
        ) : (
          <>
            <StatTile
              title={t('totalLocations')}
              value={locations.length}
              subtitle={`${activeLocations} ${t('activeLocations')}`}
              icon={MapPin}
              href="/admin/locations"
              testId="card-total-locations"
            />
            <StatTile
              title={t('depositsHeld')}
              value={fmtCurrency(depositTotal, language)}
              subtitle={`${pendingReturns} ${t('pendingReturns')}`}
              icon={DollarSign}
              href="/admin/transactions"
              testId="card-deposits-held"
            />
            <StatTile
              title={t('newApplications')}
              value={pendingApplications}
              subtitle={t('waitingForReview')}
              icon={FileText}
              href="/admin/applications"
              testId="card-pending-applications"
            />
            <StatTile
              title={t('unreadMessages')}
              value={unreadContacts}
              subtitle={t('requiresAttention')}
              icon={AlarmClock}
              href="/admin/inbox"
              testId="card-unread-messages"
            />
          </>
        )}
      </div>

      {/* Consolidated needs-attention panel */}
      <NeedsAttentionPanel alerts={alerts} dismissed={dismissed} onDismiss={dismiss} />

      {/* 3-column quick info row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Quick actions */}
        <Card data-testid="card-quick-actions">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              {t('quickActions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/admin/locations?action=create">
              <Button className="w-full justify-start" variant="outline" size="sm" data-testid="btn-add-location">
                <Plus className="h-4 w-4 mr-2" />
                {t('addLocation')}
              </Button>
            </Link>
            <a
              href="/api/admin/transactions/export.csv"
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <Button className="w-full justify-start" variant="outline" size="sm" data-testid="btn-export-csv">
                <Download className="h-4 w-4 mr-2" />
                {t('exportTransactionsCsv')}
              </Button>
            </a>
            <Link href="/admin/locations?welcome=broadcast">
              <Button className="w-full justify-start" variant="outline" size="sm" data-testid="btn-broadcast-sms">
                <Send className="h-4 w-4 mr-2" />
                {t('sendBroadcastSms')}
              </Button>
            </Link>
            <Button
              className="w-full justify-start"
              variant="outline"
              size="sm"
              onClick={() => markAllReadMut.mutate()}
              disabled={markAllReadMut.isPending || unreadContacts === 0}
              data-testid="btn-mark-all-read"
            >
              <MailCheck className="h-4 w-4 mr-2" />
              {t('markAllMessagesRead')}
              {unreadContacts > 0 && (
                <Badge variant="secondary" className="ml-auto">{unreadContacts}</Badge>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card data-testid="card-recent-activity">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              {t('recentActivity')}
            </CardTitle>
          </CardHeader>
          <CardContent>{renderActivity()}</CardContent>
        </Card>

        {/* System status */}
        <Card data-testid="card-system-status">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              {t('systemStatus')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusQ.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : statusQ.data ? (
              <div className="space-y-2.5">
                <StatusRow
                  label={t('statusDatabase')}
                  ok={statusQ.data.database.ok}
                  configured={true}
                  detail={statusQ.data.database.latencyMs !== undefined ? `${statusQ.data.database.latencyMs}ms` : undefined}
                  testId="status-row-database"
                />
                <StatusRow
                  label={t('statusGmail')}
                  ok={statusQ.data.gmail.ok}
                  configured={statusQ.data.gmail.configured}
                  testId="status-row-gmail"
                />
                <StatusRow
                  label={t('statusStripe')}
                  ok={statusQ.data.stripe.ok}
                  configured={statusQ.data.stripe.configured}
                  detail={statusQ.data.stripe.latencyMs !== undefined ? `${statusQ.data.stripe.latencyMs}ms` : undefined}
                  testId="status-row-stripe"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stripe risk detail (only when there's data) */}
      {disputesQ.data && disputesQ.data.rows.length > 0 && (
        <Card className="mt-4" data-testid="card-stripe-risk">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              {t('stripeRiskTitle')} ({disputesQ.data.windowDays}d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {disputesQ.data.rows.length} {t('flaggedLocations').toLowerCase()}
              </summary>
              <ul className="mt-2 space-y-1">
                {disputesQ.data.rows.map(r => (
                  <li key={r.locationId} className="flex justify-between text-xs">
                    <span>{r.locationName}</span>
                    <span className={r.flagged ? "text-red-700 font-semibold" : ""}>
                      {r.disputeCount}/{r.chargedCount} ({(r.rate * 100).toFixed(2)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            <a
              href="/api/admin/docs/stripe-operations"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
              data-testid="link-stripe-runbook"
            >
              <BookOpen className="h-4 w-4" />
              {t('viewStripeRunbook')}
            </a>
          </CardContent>
        </Card>
      )}
    </>
  );
}
