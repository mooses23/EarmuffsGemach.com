import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, DollarSign, MapPin } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { AdminNavTabs } from "@/components/admin/admin-nav-tabs";

export default function AdminAnalytics() {
  const { t } = useLanguage();

  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
        <AdminNavTabs />
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t('analyticsReports')}</h1>
          <p className="text-muted-foreground mt-2">{t('comprehensiveAnalytics')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('usageStatistics')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('trackLocationPerformance')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t('financialReports')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('monitorDepositsReturns')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                {t('regionalAnalysis')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('comparePerformance')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('growthMetrics')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('trackExpansion')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
