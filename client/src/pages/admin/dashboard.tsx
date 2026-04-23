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
  DollarSign, RefreshCw, AlarmClock, CreditCard, CheckCircle, BarChart3, Mail, MessageSquare
} from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/hooks/use-language";

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
