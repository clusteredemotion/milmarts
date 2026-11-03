import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StorefrontShell } from '@/components/storefront-shell';
import { AdminShell } from '@/components/admin-shell';
import Home from '@/pages/home';
import Shop from '@/pages/shop';
import Product from '@/pages/product';
import Cart from '@/pages/cart';
import Orders from '@/pages/orders';
import Account from '@/pages/account';
import Tracking from '@/pages/tracking';
import AdminNotifications from '@/pages/admin-notifications';
import AdminOverview from '@/pages/admin-overview';
import AdminUsers from '@/pages/admin-users';
import AdminTransactions from '@/pages/admin-transactions';
import AdminStaff from '@/pages/admin-staff';
import AdminProducts from '@/pages/admin-products';
import NotFound from '@/pages/not-found';
import SignIn from '@/pages/sign-in';
import SignUp from '@/pages/sign-up';
import { AuthProvider } from '@/lib/auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useEffect(() => {
    const hashTargetId = window.location.hash.slice(1);
    if (hashTargetId && document.getElementById(decodeURIComponent(hashTargetId))) return;

    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

function Router() {
  const [location] = useLocation();
  if (location.startsWith('/admin')) {
    return (
      <AdminShell>
        <RoutedErrorBoundary>
          <Switch>
            <Route path="/admin" component={AdminOverview} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/transactions" component={AdminTransactions} />
            <Route path="/admin/staff" component={AdminStaff} />
            <Route path="/admin/products" component={AdminProducts} />
            <Route path="/admin/orders" component={Tracking} />
            <Route path="/admin/notifications" component={AdminNotifications} />
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </AdminShell>
    );
  }
  return (
    <StorefrontShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/shop" component={Shop} />
          <Route path="/product/:handle" component={Product} />
          <Route path="/cart" component={Cart} />
          <Route path="/orders" component={Orders} />
          <Route path="/tracking" component={Tracking} />
          <Route path="/account" component={Account} />
          <Route path="/dashboard" component={Account} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </StorefrontShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ScrollToTop />
          <AuthProvider>
            <Switch>
              <Route path="/login" component={SignIn} />
              <Route path="/sign-in" component={SignIn} />
              <Route path="/signup" component={SignUp} />
              <Route path="/sign-up" component={SignUp} />
              <Route component={Router} />
            </Switch>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
