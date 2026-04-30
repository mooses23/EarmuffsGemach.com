import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, DollarSign, Users, Home, ClipboardList, LogOut } from "lucide-react";
import { useOperatorAuth } from "@/hooks/use-operator-auth";
import { useLanguage } from "@/hooks/use-language";

interface Payment {
  id: number;
  transactionId: number;
  paymentMethod: string;
  paymentProvider: string | null;
  depositAmount: number;
  totalAmount: number;
  status: string;
  externalPaymentId: string | null;
  createdAt: string;
}

interface Transaction {
  id: number;
  locationId: number;
  borrowerName: string;
  borrowerEmail: string;
  borrowerPhone: string;
  depositAmount: number;
  borrowDate: string;
  expectedReturnDate: string;
  actualReturnDate: string | null;
  isReturned: boolean;
  notes: string;
}

export default function OperatorDepositDashboard() {
  const { operatorLocation, isLoading: isOperatorLoading, logout } = useOperatorAuth();
  const { t } = useLanguage();
  const [currentPath, setPath] = useLocation();

  useEffect(() => {
    if (!isOperatorLoading && !operatorLocation) {
      setPath("/auth");
    }
  }, [isOperatorLoading, operatorLocation, setPath]);

  // Use operator-scoped endpoints - these filter by the operator's location on the backend
  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/locations", operatorLocation?.id, "payments"],
    enabled: !!operatorLocation?.id,
    queryFn: async () => {
      const res = await fetch("/api/operator/payments", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
  });

  const { data: transactions = [], isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/locations", operatorLocation?.id, "transactions"],
    enabled: !!operatorLocation?.id,
    queryFn: async () => {
      const res = await fetch(`/api/locations/${operatorLocation?.id}/transactions`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
  });

  // Cash deposits now auto-complete at borrow time, so there is no
  // "confirming" queue to surface here. We show today's activity, totals,
  // and a payment-method breakdown instead.
  const relevantTransactions = transactions;
  const relevantPayments = payments;

  const todayDeposits = relevantPayments.filter(p => {
    const today = new Date().toDateString();
    return new Date(p.createdAt).toDateString() === today;
  });

  const completedDeposits = relevantPayments.filter(p => p.status === "completed");
  const failedDeposits = relevantPayments.filter(p => p.status === "failed");

  const totalDepositValue = completedDeposits.reduce((sum, p) => sum + p.totalAmount, 0);

  if (paymentsLoading || transactionsLoading || isOperatorLoading) {
    return (
      <div className="container py-6 space-y-6">
        <h1 className="text-2xl font-bold">{t("depositDashboard")}</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Operator Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              {t("home")}
            </Button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{operatorLocation?.name || t("myLocation")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/operator/dashboard">
            <Button
              variant={currentPath === "/operator/dashboard" ? "default" : "outline"}
              size="sm"
              className="flex items-center gap-2"
            >
              <ClipboardList className="h-4 w-4" />
              {t("transactions")}
            </Button>
          </Link>
          <Link href="/operator/deposits">
            <Button
              variant={currentPath === "/operator/deposits" ? "default" : "outline"}
              size="sm"
              className="flex items-center gap-2"
            >
              <DollarSign className="h-4 w-4" />
              {t("deposits")}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t("logOut")}
          </Button>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t("depositDashboard")}</h1>
          <p className="text-gray-600 mt-1">
            {t("manageAndConfirmDeposits")}
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("todaysDeposits")}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{todayDeposits.length}</div>
            <p className="text-xs text-gray-600">
              ${(todayDeposits.reduce((sum, p) => sum + p.totalAmount, 0) / 100).toFixed(2)} {t("collected")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("totalConfirmed")}</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{completedDeposits.length}</div>
            <p className="text-xs text-gray-600">
              ${(totalDepositValue / 100).toFixed(2)} {t("totalValue")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("activeBorrowers")}</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {relevantTransactions.filter(t => !t.isReturned).length}
            </div>
            <p className="text-xs text-gray-600">{t("currentlyHaveEarmuffs")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="recent" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recent">{t("recentActivity")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("analytics")}</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="space-y-4">
          <h2 className="text-xl font-semibold">{t("recentDepositActivity")}</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("recentlyConfirmed")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {completedDeposits.slice(0, 5).map((payment) => {
                  const transaction = transactions.find(t => t.id === payment.transactionId);
                  return (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <div>
                          <div className="font-medium">{transaction?.borrowerName}</div>
                          <div className="text-sm text-gray-600">
                            {payment.paymentMethod}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${(payment.totalAmount / 100).toFixed(2)}</div>
                        <div className="text-xs text-gray-600">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("failedDeposits")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {failedDeposits.slice(0, 5).map((payment) => {
                  const transaction = transactions.find(t => t.id === payment.transactionId);
                  return (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <div>
                          <div className="font-medium">{transaction?.borrowerName}</div>
                          <div className="text-sm text-gray-600">
                            {payment.paymentMethod}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${(payment.totalAmount / 100).toFixed(2)}</div>
                        <div className="text-xs text-gray-600">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <h2 className="text-xl font-semibold">{t("depositAnalytics")}</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("paymentMethodBreakdown")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {['cash', 'stripe', 'paypal'].map(method => {
                    const methodPayments = completedDeposits.filter(p => p.paymentMethod === method);
                    const percentage = completedDeposits.length > 0 ? (methodPayments.length / completedDeposits.length) * 100 : 0;
                    return (
                      <div key={method} className="flex justify-between items-center">
                        <span className="capitalize">{method}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">{methodPayments.length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("averageProcessingTime")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {t("approximately24Hours")}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {t("averageTimeFromDepositToConfirmation")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("successRate")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {((completedDeposits.length / (completedDeposits.length + failedDeposits.length)) * 100).toFixed(1)}%
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {t("depositConfirmationSuccessRate")}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
