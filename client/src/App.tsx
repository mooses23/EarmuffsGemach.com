import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Locations from "@/pages/locations";
import Apply from "@/pages/apply";
import Contact from "@/pages/contact";
import Borrow from "@/pages/borrow";
import AuthPage from "@/pages/auth-page";
import SelfDepositPage from "@/pages/self-deposit";
import Rules from "@/pages/rules";
import StatusPage from "@/pages/status";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminLocations from "@/pages/admin/locations";
import AdminTransactions from "@/pages/admin/transactions";
import AdminApplications from "@/pages/admin/applications";
import AdminPaymentMethods from "@/pages/admin/payment-methods";
import PaymentConfirmations from "@/pages/admin/payment-confirmations";
import PaymentStatusMonitor from "@/pages/admin/payment-status-monitor";
import AdminInbox from "@/pages/admin/inbox";
import AdminGlossary from "@/pages/admin/glossary";
import OperatorIndex from "@/pages/operator/index";
import OperatorLogin from "@/pages/operator/login";
import OperatorDashboard from "@/pages/operator/dashboard";
import OperatorDepositDashboard from "@/pages/operator/deposit-dashboard";
import WelcomePage from "@/pages/welcome";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Layout } from "@/components/layout/layout";
import { AuthProvider } from "@/hooks/use-auth";
import { LanguageProvider } from "@/hooks/use-language";
import { OperatorAuthProvider } from "@/hooks/use-operator-auth";

function Router() {
  return (
    <Switch>
      <Route path="/welcome/:token" component={WelcomePage} />
      <Route>
        <LayoutRouter />
      </Route>
    </Switch>
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
        
        {/* Protected Admin Routes */}
        <ProtectedRoute path="/admin" component={AdminDashboard} requiredRole="admin" />
        <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} requiredRole="admin" />
        <ProtectedRoute path="/admin/locations" component={AdminLocations} requiredRole="admin" />
        <ProtectedRoute path="/admin/transactions" component={AdminTransactions} requiredRole="admin" />
        <ProtectedRoute path="/admin/applications" component={AdminApplications} requiredRole="admin" />
        <ProtectedRoute path="/admin/payment-methods" component={AdminPaymentMethods} requiredRole="admin" />
        <ProtectedRoute path="/admin/payment-confirmations" component={PaymentConfirmations} requiredRole="admin" />
        <ProtectedRoute path="/admin/payment-status" component={PaymentStatusMonitor} requiredRole="admin" />
        <ProtectedRoute path="/admin/inbox" component={AdminInbox} requiredRole="admin" />
        <ProtectedRoute path="/admin/glossary" component={AdminGlossary} requiredRole="admin" />
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
