import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  BarChart3
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

interface PaymentDetectionAnalytics {
  totalPayments: number;
  statusBreakdown: Record<string, number>;
  methodPerformance: Array<{
    method: string;
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  }>;
  pendingPayments: number;
  retryableFailures: number;
}

export default function PaymentStatusMonitor() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Fetch detection analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<PaymentDetectionAnalytics>({
    queryKey: ["/api/analytics/deposit-detection", dateRange],
    queryFn: () => 
      apiRequest("GET", `/api/analytics/deposit-detection?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)
        .then(res => res.json()),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Manual status check mutation
  const statusCheckMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/payments/status-check");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/deposit-detection"] });
      toast({
        title: t('statusCheckComplete'),
        description: t('paymentStatusesUpdated'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('statusCheckFailed'),
        description: error.message || t('failedToCheckPaymentStatuses'),
        variant: "destructive",
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'confirming': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'pending_retry': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'stripe': return '💳';
      case 'paypal': return '🅿️';
      case 'cash': return '💵';
      default: return '💰';
    }
  };

  if (analyticsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('paymentStatusMonitor')}</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t('paymentStatusMonitor')}</h1>
          <p className="text-gray-600 mt-1">
            {t('paymentStatusMonitorDescription')}
          </p>
        </div>
        
        <Button 
          onClick={() => statusCheckMutation.mutate()}
          disabled={statusCheckMutation.isPending}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${statusCheckMutation.isPending ? 'animate-spin' : ''}`} />
          {t('checkStatus')}
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle>{t('filterAnalytics')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <Label htmlFor="startDate">{t('startDate')}</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">{t('endDate')}</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalPayments')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalPayments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('allPaymentAttempts')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pendingReview')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.pendingPayments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('awaitingConfirmation')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('retryableFailures')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.retryableFailures || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('canBeRetried')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('successRate')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics && analytics.totalPayments > 0 
                ? Math.round(((analytics.statusBreakdown.completed || 0) / analytics.totalPayments) * 100)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {t('overallAcceptanceRate')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">{t('paymentStatus')}</TabsTrigger>
          <TabsTrigger value="methods">{t('methodPerformance')}</TabsTrigger>
          <TabsTrigger value="detection">{t('detectionTimeline')}</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('paymentStatusBreakdown')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {analytics?.statusBreakdown && Object.entries(analytics.statusBreakdown).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getStatusColor(status)}`}>
                      {status === 'completed' && <CheckCircle className="w-4 h-4 mr-1" />}
                      {status === 'failed' && <XCircle className="w-4 h-4 mr-1" />}
                      {(status === 'confirming' || status === 'pending') && <Clock className="w-4 h-4 mr-1" />}
                      {status === 'pending_retry' && <RefreshCw className="w-4 h-4 mr-1" />}
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                    </div>
                    <div className="text-2xl font-bold mt-2">{count}</div>
                    <div className="text-sm text-gray-500">
                      {analytics.totalPayments > 0 ? Math.round((count / analytics.totalPayments) * 100) : 0}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="methods" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('paymentMethodPerformance')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics?.methodPerformance?.map((method) => (
                  <div key={method.method} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getMethodIcon(method.method)}</span>
                        <h3 className="font-semibold capitalize">{method.method}</h3>
                      </div>
                      <Badge variant={method.successRate >= 95 ? "default" : method.successRate >= 80 ? "secondary" : "destructive"}>
                        {method.successRate.toFixed(1)}% {t('success')}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">{t('totalAttempts')}</div>
                        <div className="font-semibold">{method.total}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">{t('successful')}</div>
                        <div className="font-semibold text-green-600">{method.successful}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">{t('failed')}</div>
                        <div className="font-semibold text-red-600">{method.failed}</div>
                      </div>
                    </div>
                    
                    {/* Success Rate Bar */}
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${method.successRate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                {t('realtimeDetectionInsights')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">{t('webhookProcessing')}</h3>
                  <p className="text-sm text-blue-800">
                    {t('webhookProcessingDescription')}
                  </p>
                </div>
                
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-2">{t('automaticRetries')}</h3>
                  <p className="text-sm text-green-800">
                    {t('automaticRetriesDescription')}
                  </p>
                </div>
                
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h3 className="font-semibold text-orange-900 mb-2">{t('statusMonitoring')}</h3>
                  <p className="text-sm text-orange-800">
                    {t('statusMonitoringDescription')}
                  </p>
                </div>
                
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-2">{t('auditTrail')}</h3>
                  <p className="text-sm text-purple-800">
                    {t('auditTrailDescription')}
                  </p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">{t('detectionFlow')}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="px-2 py-1 bg-blue-100 rounded">{t('paymentInitiated')}</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-yellow-100 rounded">{t('webhookReceived')}</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-green-100 rounded">{t('statusUpdated')}</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-purple-100 rounded">{t('systemSynced')}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}