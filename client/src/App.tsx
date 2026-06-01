import React, { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
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
import { ErrorBoundary } from "@/components/error-boundary";

function detectLang(): Language {
  if (typeof localStorage !== "undefined" && localStorage.getItem("language") === "he") return "he";
  return "en";
}

void ensureRest(detectLang());

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

const Locations = lazyWithRest(() => import("@/pages/locations"));
const Apply = lazyWithRest(() => import("@/pages/apply"));
const Contact = lazyWithRest(() => import("@/pages/contact"));
const Borrow = lazyWithRest(() => import("@/pages/borrow"));
const AuthPage = lazyWithRest(() => import("@/pages/auth-page"));
const Rules = lazyWithRest(() => import("@/pages/rules"));
const PrivacyPolicy = lazyWithRest(() => import("@/pages/privacy-policy"));
const Terms = lazyWithRest(() => import("@/pages/terms"));
const SmsPolicy = lazyWithRest(() => import("@/pages/sms-policy"));

const SelfDepositPage = lazyWithRest(() => import("@/pages/self-deposit"));
const StatusPage = lazyWithRest(() => import("@/pages/status"));
const WelcomePage = lazyWithRest(() => import("@/pages/welcome"));

const AdminDashboard = lazyWithRest(() => import("@/pages/admin/dashboard"));
const AdminLocations = lazyWithRest(() => import("@/pages/admin/locations"));
const AdminTransactions = lazyWithRest(() => import("@/pages/admin/transactions"));
const AdminApplications = lazyWithRest(() => import("@/pages/admin/applications"));
const AdminInbox = lazyWithRest(() => import("@/pages/admin/inbox"));
const AdminGlossary = lazyWithRest(() => import("@/pages/admin/glossary"));
const AdminPaymentStatus = lazyWithRest(() => import("@/pages/admin/payment-status-monitor"));
const AdminSettings = lazyWithRest(() => import("@/pages/admin/settings"));

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

function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location} label="Page error — something went wrong">
      {children}
    </ErrorBoundary>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RouteErrorBoundary>
        <Switch>
          <Route path="/welcome/:token" component={WelcomePage} />
          <Route>
            <LayoutRouter />
          </Route>
        </Switch>
      </RouteErrorBoundary>
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
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/terms" component={Terms} />
        <Route path="/sms-policy" component={SmsPolicy} />
        <Route path="/status/:transactionId" component={StatusPage} />

        {/* Protected Admin Routes */}
        <ProtectedRoute path="/admin" component={withAdminLayout(AdminDashboard)} requiredRole="admin" />
        <ProtectedRoute path="/admin/dashboard" component={withAdminLayout(AdminDashboard)} requiredRole="admin" />
        <ProtectedRoute path="/admin/locations" component={withAdminLayout(AdminLocations)} requiredRole="admin" />
        <ProtectedRoute path="/admin/transactions" component={withAdminLayout(AdminTransactions)} requiredRole="admin" />
        <ProtectedRoute path="/admin/applications" component={withAdminLayout(AdminApplications)} requiredRole="admin" />
        <ProtectedRoute path="/admin/inbox" component={withAdminLayout(AdminInbox)} requiredRole="admin" />
        <ProtectedRoute path="/admin/glossary" component={withAdminLayout(AdminGlossary)} requiredRole="admin" />
        <ProtectedRoute path="/admin/settings" component={withAdminLayout(AdminSettings)} requiredRole="admin" />

        {/* Redirects — merged pages now live inside /admin/transactions */}
        <Route path="/admin/payment-status" component={withAdminLayout(AdminPaymentStatus)} />
        <Route path="/admin/analytics">{() => <Redirect to="/admin/transactions" />}</Route>
        <Route path="/admin/emails">{() => <Redirect to="/admin/inbox" />}</Route>
        <Route path="/admin/messages">{() => <Redirect to="/admin/inbox" />}</Route>
        <Route path="/admin/payment-confirmations">{() => <Redirect to="/admin/transactions" />}</Route>

        {/* Operator Routes */}
        <Route path="/operator/login">{() => <Redirect to="/auth" />}</Route>
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
