import React, { lazy, Suspense, type ComponentType } from "react";
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
import { ensureRest, type Language } from "@/lib/translations";

// Resolves the persisted language synchronously so route chunks can wait
// for the matching dictionary before mounting.
function detectLang(): Language {
  if (typeof localStorage !== "undefined" && localStorage.getItem("language") === "he") return "he";
  return "en";
}

// Wrap React.lazy so non-Home routes don't resolve until the *rest*
// translation dictionary for the active language is loaded. That guarantees
// `t()` inside those pages never returns a raw key on first paint.
function lazyWithRest<P extends object>(factory: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(async () => {
    await ensureRest(detectLang());
    return factory();
  });
}

function withAdminLayout(Component: React.ComponentType<any>) {
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

// Non-Home public routes are lazy so the landing page payload stays minimal.
// Each lazy module also waits on `ensureRest` so the rest translation chunk
// is resolved before the page renders.
const Locations = lazyWithRest(() => import("@/pages/locations"));
const Apply = lazyWithRest(() => import("@/pages/apply"));
const Contact = lazyWithRest(() => import("@/pages/contact"));
const Borrow = lazyWithRest(() => import("@/pages/borrow"));
const AuthPage = lazyWithRest(() => import("@/pages/auth-page"));
const Rules = lazyWithRest(() => import("@/pages/rules"));

const SelfDepositPage = lazyWithRest(() => import("@/pages/self-deposit"));
const StatusPage = lazyWithRest(() => import("@/pages/status"));
const WelcomePage = lazyWithRest(() => import("@/pages/welcome"));

const AdminDashboard = lazyWithRest(() => import("@/pages/admin/dashboard"));
const AdminLocations = lazyWithRest(() => import("@/pages/admin/locations"));
const AdminTransactions = lazyWithRest(() => import("@/pages/admin/transactions"));
const AdminApplications = lazyWithRest(() => import("@/pages/admin/applications"));
const AdminPaymentMethods = lazyWithRest(() => import("@/pages/admin/payment-methods"));
const PaymentStatusMonitor = lazyWithRest(() => import("@/pages/admin/payment-status-monitor"));
const AdminInbox = lazyWithRest(() => import("@/pages/admin/inbox"));
const AdminGlossary = lazyWithRest(() => import("@/pages/admin/glossary"));
const AdminAnalytics = lazyWithRest(() => import("@/pages/admin/analytics"));

const OperatorIndex = lazyWithRest(() => import("@/pages/operator/index"));
const OperatorLogin = lazyWithRest(() => import("@/pages/operator/login"));
const OperatorDashboard = lazyWithRest(() => import("@/pages/operator/dashboard"));
const OperatorDepositDashboard = lazyWithRest(() => import("@/pages/operator/deposit-dashboard"));

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
        <ProtectedRoute path="/admin/payment-status" component={withAdminLayout(PaymentStatusMonitor)} requiredRole="admin" />
        <ProtectedRoute path="/admin/inbox" component={withAdminLayout(AdminInbox)} requiredRole="admin" />
        <ProtectedRoute path="/admin/glossary" component={withAdminLayout(AdminGlossary)} requiredRole="admin" />
        <ProtectedRoute path="/admin/analytics" component={withAdminLayout(AdminAnalytics)} requiredRole="admin" />
        <Route path="/admin/emails">{() => <Redirect to="/admin/inbox" />}</Route>
        <Route path="/admin/messages">{() => <Redirect to="/admin/inbox" />}</Route>
        <Route path="/admin/payment-confirmations">{() => <Redirect to="/admin/transactions" />}</Route>
        
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
