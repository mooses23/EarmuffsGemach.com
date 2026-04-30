import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Layout } from "@/components/layout/layout";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AuthProvider } from "@/hooks/use-auth";
import { LanguageProvider } from "@/hooks/use-language";
import { OperatorAuthProvider } from "@/hooks/use-operator-auth";

function withAdminLayout(Component: (props: any) => JSX.Element | null) {
  return function AdminLayoutWrapper(props: any) {
    return (
      <AdminLayout>
        <Component {...props} />
      </AdminLayout>
    );
  };
}

import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Locations from "@/pages/locations";
import Apply from "@/pages/apply";
import Contact from "@/pages/contact";
import Borrow from "@/pages/borrow";
import AuthPage from "@/pages/auth-page";
import Rules from "@/pages/rules";

const SelfDepositPage = lazy(() => import("@/pages/self-deposit"));
const StatusPage = lazy(() => import("@/pages/status"));
const WelcomePage = lazy(() => import("@/pages/welcome"));

const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminLocations = lazy(() => import("@/pages/admin/locations"));
const AdminTransactions = lazy(() => import("@/pages/admin/transactions"));
const AdminApplications = lazy(() => import("@/pages/admin/applications"));
const AdminPaymentMethods = lazy(() => import("@/pages/admin/payment-methods"));
const PaymentConfirmations = lazy(() => import("@/pages/admin/payment-confirmations"));
const PaymentStatusMonitor = lazy(() => import("@/pages/admin/payment-status-monitor"));
const AdminInbox = lazy(() => import("@/pages/admin/inbox"));
const AdminGlossary = lazy(() => import("@/pages/admin/glossary"));
const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));

const OperatorIndex = lazy(() => import("@/pages/operator/index"));
const OperatorLogin = lazy(() => import("@/pages/operator/login"));
const OperatorDashboard = lazy(() => import("@/pages/operator/dashboard"));
const OperatorDepositDashboard = lazy(() => import("@/pages/operator/deposit-dashboard"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/welcome/:token" component={WelcomePage} />
        <Route>
          <LayoutRouter />
        </Route>
      </Switch>
    </Suspense>
  );
}

function LayoutRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/locations" component={Locations} />
        <Route path="/apply" component={Apply} />
        <Route path="/contact" component={Contact} />
        <Route path="/borrow" component={Borrow} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/self-deposit" component={SelfDepositPage} />
        <Route path="/rules" component={Rules} />
        <Route path="/status/:transactionId" component={StatusPage} />
        
        {/* Protected Admin Routes — all wrapped in AdminLayout via withAdminLayout HOC */}
        <ProtectedRoute path="/admin" component={withAdminLayout(AdminDashboard)} requiredRole="admin" />
        <ProtectedRoute path="/admin/dashboard" component={withAdminLayout(AdminDashboard)} requiredRole="admin" />
        <ProtectedRoute path="/admin/locations" component={withAdminLayout(AdminLocations)} requiredRole="admin" />
        <ProtectedRoute path="/admin/transactions" component={withAdminLayout(AdminTransactions)} requiredRole="admin" />
        <ProtectedRoute path="/admin/applications" component={withAdminLayout(AdminApplications)} requiredRole="admin" />
        <ProtectedRoute path="/admin/payment-methods" component={withAdminLayout(AdminPaymentMethods)} requiredRole="admin" />
        <ProtectedRoute path="/admin/payment-confirmations" component={withAdminLayout(PaymentConfirmations)} requiredRole="admin" />
        <ProtectedRoute path="/admin/payment-status" component={withAdminLayout(PaymentStatusMonitor)} requiredRole="admin" />
        <ProtectedRoute path="/admin/inbox" component={withAdminLayout(AdminInbox)} requiredRole="admin" />
        <ProtectedRoute path="/admin/glossary" component={withAdminLayout(AdminGlossary)} requiredRole="admin" />
        <ProtectedRoute path="/admin/analytics" component={withAdminLayout(AdminAnalytics)} requiredRole="admin" />
        <Route path="/admin/emails">{() => <Redirect to="/admin/inbox" />}</Route>
        <Route path="/admin/messages">{() => <Redirect to="/admin/inbox" />}</Route>
        
        {/* Operator Routes - Use localStorage-based auth via useOperatorAuth hook */}
        <Route path="/operator/login" component={OperatorLogin} />
        <Route path="/operator" component={OperatorDashboard} />
        <Route path="/operator/dashboard" component={OperatorDashboard} />
        <Route path="/operator/deposits" component={OperatorDepositDashboard} />
        
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <OperatorAuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </OperatorAuthProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
